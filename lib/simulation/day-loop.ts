import type { Rng } from './rng';
import type { SyntheticLearner, SyntheticItemState } from './types';
import { generateReview } from './generate-review';
import { processReview } from '../scheduling/engine';
import { createInitialItemState, applySM2 } from '../scheduling/sm2';
import type {
  EngineConfig,
  ItemState,
  LearnerState,
  ReviewEvent,
  SchedulingPath,
} from '../scheduling/types';

// The matched/mismatched distinction (3.9.1) is about the *within-review*
// decay shape (generative-models.ts: exponential vs power law) - not about
// whether memory is strengthened by review at all. 2.2.3's own argument for
// why spacing works ("a review does more to strengthen the memory") applies
// regardless of curve shape, so the true, underlying stability-like scale
// fed to computeTrueRetrievability evolves via the *same* growth/lapse
// mechanic 3.7.4/3.7.5 describe, using the same constants as whatever
// EngineConfig is under test. This is what "the matched condition's
// assumptions hold exactly" (3.9.1) means: not just the curve shape, but the
// whole update rule - so there is deliberately no separate, independent set
// of "true dynamics" constants here (an earlier version of this file had
// one, and it produced a synthetic population whose real memory grew at a
// rate disconnected from whatever the algorithm assumed, guaranteeing
// systematic over- or under-scheduling regardless of tuning).
//
// No correction term is used: correction exists only to let a noisy
// *estimator* close in on a value it doesn't already know, and the
// generator knows the true state exactly at every point.
function applyTrueStabilityUpdate(
  trueStability: number,
  trueRetrievability: number,
  correct: boolean,
  engineConfig: EngineConfig,
): number {
  if (!correct) {
    return Math.max(
      engineConfig.stabilityFloor,
      engineConfig.lapseFactor * trueStability,
    );
  }
  const grown =
    trueStability *
    (1 + engineConfig.stabilityGrowthRate * (1 - trueRetrievability));
  return Math.min(engineConfig.stabilityMax, grown);
}

export type SchedulerPolicy = 'adaptive' | 'sm2-only';

// Not fixed by the thesis text (3.9.1 leaves these as "will be reported with
// the results") — agreed defaults, not derived values.
export interface DayLoopConfig {
  studyPeriodDays: number;
  testPointGapDays: number;
  convergenceToleranceBand: number;
  convergenceConsecutiveRequired: number;
  convergenceMaxReviews: number;
}

export const DEFAULT_DAY_LOOP_CONFIG: DayLoopConfig = {
  studyPeriodDays: 365,
  testPointGapDays: 30,
  convergenceToleranceBand: 0.05,
  convergenceConsecutiveRequired: 3,
  convergenceMaxReviews: 50,
};

export interface DayLoopTraceEntry {
  day: number;
  reviewIndex: number | null; // null for the test-point probe
  kind: 'review' | 'probe';
  path: SchedulingPath | null; // null for the probe and for the sm2-only policy's own bookkeeping
  correct: boolean;
  responseTimeMs: number;
  trueRetrievability: number;
  estimatedStability: number | null;
  trueStabilityAfter: number;
}

export interface DayLoopResult {
  policy: SchedulerPolicy;
  condition: SyntheticLearner['condition'];
  reviewCount: number; // during the study period only — the probe is not a review
  retentionCorrect: boolean; // outcome of the single held-out probe at the test point
  probeTrueRetrievability: number;
  convergedAtReview: number | null; // 1-based index among adaptive-path reviews; null if never
  didNotConverge: boolean; // true once convergenceMaxReviews adaptive reviews passed with no convergence
  trace: DayLoopTraceEntry[];
}

function dateFromDay(day: number): Date {
  return new Date(Date.UTC(2026, 0, 1) + day * 24 * 60 * 60 * 1000);
}

/**
 * Simulates one synthetic item, under one scheduling policy, as a literal
 * day-by-day loop (thesis 3.9.1: "moved through a timeline day by day...
 * items that become due will be reviewed"), followed by a single held-out
 * retention probe at the test point. The probe never updates scheduler or
 * ground-truth state — it only measures.
 *
 * processReview already handles the cold-start/adaptive routing internally
 * (it returns pathUsed: 'sm2' while item.reviewCount < coldStartItemReviews),
 * so the 'adaptive' policy here always just calls processReview — this loop
 * doesn't need to replicate that branch. The 'sm2-only' baseline bypasses
 * processReview entirely and always calls applySM2 directly.
 */
export function simulateItemDayLoop(options: {
  learner: SyntheticLearner;
  initialItem: SyntheticItemState;
  policy: SchedulerPolicy;
  engineConfig: EngineConfig;
  dayLoopConfig: DayLoopConfig;
  rng: Rng;
}): DayLoopResult {
  const { learner, initialItem, policy, engineConfig, dayLoopConfig, rng } =
    options;

  let schedulerItem: ItemState = createInitialItemState(
    learner.learnerId,
    initialItem.cardId,
  );
  let learnerState: LearnerState = {
    learnerId: learner.learnerId,
    meanLogResponseTime: null,
    stdLogResponseTime: null,
    logResponseTimeM2: 0,
    rtCount: 0,
    priorStability: null,
  };

  let trueStability = initialItem.trueStability;
  let lastReviewedDay: number | null = null;
  let dueDay = 0; // the item is introduced, and first becomes due, on day 0

  let reviewCount = 0;
  let adaptiveReviewIndex = 0;
  let consecutiveWithinBand = 0;
  let convergedAtReview: number | null = null;
  let didNotConverge = false;

  const trace: DayLoopTraceEntry[] = [];

  for (let day = 0; day <= dayLoopConfig.studyPeriodDays; day++) {
    if (dueDay > day) continue; // not due yet — nothing happens today for this item

    const elapsedDays = lastReviewedDay === null ? 0 : day - lastReviewedDay;

    const generated = generateReview(
      learner,
      {
        learnerId: learner.learnerId,
        cardId: initialItem.cardId,
        trueStability,
        lastReviewedAt: null,
      },
      elapsedDays,
      {
        targetRetrievability: engineConfig.targetRetrievability,
        responseTimeConstant: engineConfig.responseTimeConstant,
      },
      rng,
    );

    reviewCount += 1;

    const event: ReviewEvent = {
      correct: generated.correct,
      responseTimeMs: generated.responseTimeMs,
      reviewedAt: dateFromDay(day),
    };

    let path: SchedulingPath;
    let estimatedStability: number | null = null;
    let nextDueDay: number;

    if (policy === 'sm2-only') {
      schedulerItem = applySM2(schedulerItem, event);
      path = 'sm2';
      nextDueDay = day + Math.max(1, schedulerItem.intervalDays);
    } else {
      const outcome = processReview(
        schedulerItem,
        learnerState,
        event,
        engineConfig,
      );
      schedulerItem = outcome.updatedItem;
      learnerState = outcome.updatedLearner;
      path = outcome.pathUsed;
      estimatedStability = schedulerItem.stability;

      const intervalDays =
        (outcome.nextReviewAt.getTime() - dateFromDay(day).getTime()) /
        (1000 * 60 * 60 * 24);
      nextDueDay = day + Math.max(1, Math.round(intervalDays));

      if (path === 'adaptive' && !didNotConverge) {
        adaptiveReviewIndex += 1;

        const lower =
          engineConfig.targetRetrievability -
          dayLoopConfig.convergenceToleranceBand;
        const upper =
          engineConfig.targetRetrievability +
          dayLoopConfig.convergenceToleranceBand;
        const withinBand =
          generated.trueRetrievability >= lower &&
          generated.trueRetrievability <= upper;

        if (withinBand) {
          consecutiveWithinBand += 1;
          if (
            convergedAtReview === null &&
            consecutiveWithinBand >=
              dayLoopConfig.convergenceConsecutiveRequired
          ) {
            convergedAtReview = adaptiveReviewIndex;
          }
        } else {
          consecutiveWithinBand = 0;
        }

        if (
          convergedAtReview === null &&
          adaptiveReviewIndex >= dayLoopConfig.convergenceMaxReviews
        ) {
          didNotConverge = true;
        }
      }
    }

    trueStability = applyTrueStabilityUpdate(
      trueStability,
      generated.trueRetrievability,
      generated.correct,
      engineConfig,
    );

    trace.push({
      day,
      reviewIndex: reviewCount,
      kind: 'review',
      path,
      correct: generated.correct,
      responseTimeMs: generated.responseTimeMs,
      trueRetrievability: generated.trueRetrievability,
      estimatedStability,
      trueStabilityAfter: trueStability,
    });

    lastReviewedDay = day;
    dueDay = nextDueDay;
  }

  // Retention test point: a single held-out probe, testPointGapDays after the
  // study period ends. Does not feed back into scheduler or true-stability state.
  const testDay =
    dayLoopConfig.studyPeriodDays + dayLoopConfig.testPointGapDays;
  const elapsedAtProbe =
    lastReviewedDay === null ? testDay : testDay - lastReviewedDay;
  const probe = generateReview(
    learner,
    {
      learnerId: learner.learnerId,
      cardId: initialItem.cardId,
      trueStability,
      lastReviewedAt: null,
    },
    elapsedAtProbe,
    {
      targetRetrievability: engineConfig.targetRetrievability,
      responseTimeConstant: engineConfig.responseTimeConstant,
    },
    rng,
  );

  trace.push({
    day: testDay,
    reviewIndex: null,
    kind: 'probe',
    path: null,
    correct: probe.correct,
    responseTimeMs: probe.responseTimeMs,
    trueRetrievability: probe.trueRetrievability,
    estimatedStability: null,
    trueStabilityAfter: trueStability,
  });

  return {
    policy,
    condition: learner.condition,
    reviewCount,
    retentionCorrect: probe.correct,
    probeTrueRetrievability: probe.trueRetrievability,
    convergedAtReview,
    didNotConverge,
    trace,
  };
}
