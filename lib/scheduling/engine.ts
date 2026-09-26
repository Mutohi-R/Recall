import type {
  ItemState,
  LearnerState,
  ReviewEvent,
  EngineConfig,
  SchedulingPath,
} from './types';
import { applySM2, nextReviewDate } from './sm2';
import { estimateRetrievability } from './retrievability';
import { applyStabilityUpdate, applyLapse } from './stability';
import { updateResponseTimeStats } from './learner-stats';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface ReviewOutcome {
  updatedItem: ItemState;
  updatedLearner: LearnerState;
  pathUsed: SchedulingPath;
  nextReviewAt: Date;
}

export function processReview(
  item: ItemState,
  learner: LearnerState,
  event: ReviewEvent,
  config: EngineConfig,
): ReviewOutcome {
  // Step 1
  const elapsedDays = item.lastReviewedAt
    ? (event.reviewedAt.getTime() - item.lastReviewedAt.getTime()) / MS_PER_DAY
    : 0;

  // Step 2 — still in item-level cold start: SM-2 handles the whole review
  if (item.reviewCount < config.coldStartItemReviews) {
    const sm2Updated = applySM2(item, event);
    const updatedItem: ItemState = {
      ...sm2Updated,
      reviewCount: item.reviewCount + 1,
    };
    const updatedLearner = event.correct
      ? updateResponseTimeStats(learner, event.responseTimeMs)
      : learner;
    return {
      updatedItem,
      updatedLearner,
      pathUsed: 'sm2',
      nextReviewAt: nextReviewDate(updatedItem),
    };
  }

  // Step 3 - the transition review: initialise S exactly once
  let stability = item.stability;
  if (item.reviewCount === config.coldStartItemReviews) {
    stability = learner.priorStability ?? config.defaultPriorStability;
  }
  if (stability === null) stability = config.defaultPriorStability; // defensive fallback

  let nextStability: number;

  // Step 4 - a lapse, on any incorrect response once on the adaptive path
  if (!event.correct) {
    nextStability = applyLapse(stability, config);
  } else {
    // Step 5 - compute R̂, the retrievability implied by this review
    const rHat = estimateRetrievability(
      true,
      event.responseTimeMs,
      learner.meanLogResponseTime,
      learner.stdLogResponseTime,
      learner.rtCount,
      config,
    );
    // Step 6 - update stability, first correction then growth
    nextStability = applyStabilityUpdate(stability, elapsedDays, rHat, config);
  }

  // Step 7
  const nextIntervalDays =
    -nextStability * Math.log(config.targetRetrievability);

  const updatedItem: ItemState = {
    ...item,
    stability: nextStability,
    reviewCount: item.reviewCount + 1,
    lastReviewedAt: event.reviewedAt,
  };

  // Step 8
  const updatedLearner = event.correct
    ? updateResponseTimeStats(learner, event.responseTimeMs)
    : learner;

  const nextReviewAt = new Date(
    event.reviewedAt.getTime() + nextIntervalDays * MS_PER_DAY,
  );

  return { updatedItem, updatedLearner, pathUsed: 'adaptive', nextReviewAt };
}
