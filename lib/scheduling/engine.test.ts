import { describe, it, expect } from 'vitest';
import { processReview } from './engine';
import { createInitialItemState } from './sm2';
import type { LearnerState, EngineConfig, ReviewEvent } from './types';

const config: EngineConfig = {
  targetRetrievability: 0.9,
  responseTimeConstant: 0.05,
  minRetrievability: 0.3,
  maxRetrievability: 0.99,
  incorrectRetrievability: 0.1,
  stabilitySmoothing: 0.3,
  stabilityGrowthRate: 0.1,
  lapseFactor: 0.5,
  stabilityFloor: 0.5,
  stabilityMax: 1000,
  minIntervalForCorrection: 1,
  maxStabilityChangePerReview: 100,
  coldStartItemReviews: 2, // small, so tests don't need many reviews
  coldStartLearnerReviews: 10,
  defaultPriorStability: 4,
};

const emptyLearner: LearnerState = {
  learnerId: 'l1',
  meanLogResponseTime: null,
  stdLogResponseTime: null,
  logResponseTimeM2: 0,
  rtCount: 0,
  priorStability: null,
};

const event = (
  correct: boolean,
  at: Date,
  responseTimeMs = 2000,
): ReviewEvent => ({
  correct,
  responseTimeMs,
  reviewedAt: at,
});

describe('processReview', () => {
  it('routes through SM-2 while reviewCount is below the item threshold', () => {
    const item = createInitialItemState('l1', 'c1');
    const result = processReview(
      item,
      emptyLearner,
      event(true, new Date('2026-01-01')),
      config,
    );
    expect(result.pathUsed).toBe('sm2');
    expect(result.updatedItem.reviewCount).toBe(1);
    expect(result.updatedItem.stability).toBeNull(); // still not on the adaptive path
  });

  it('transitions to the adaptive path once reviewCount reaches the threshold, initializing S from the learner prior', () => {
    let item = createInitialItemState('l1', 'c1');
    item = processReview(
      item,
      emptyLearner,
      event(true, new Date('2026-01-01')),
      config,
    ).updatedItem;
    item = processReview(
      item,
      emptyLearner,
      event(true, new Date('2026-01-02')),
      config,
    ).updatedItem;
    // reviewCount is now 2, equal to coldStartItemReviews -> this review transitions it
    const learnerWithPrior = { ...emptyLearner, priorStability: 7 };
    const result = processReview(
      item,
      learnerWithPrior,
      event(true, new Date('2026-01-03')),
      config,
    );
    expect(result.pathUsed).toBe('adaptive');
    expect(result.updatedItem.stability).not.toBeNull();
    expect(result.updatedItem.reviewCount).toBe(3);
  });

  it('uses the global default prior when the learner has no adaptive-path items yet', () => {
    let item = createInitialItemState('l1', 'c1');
    item = processReview(
      item,
      emptyLearner,
      event(true, new Date('2026-01-01')),
      config,
    ).updatedItem;
    item = processReview(
      item,
      emptyLearner,
      event(true, new Date('2026-01-02')),
      config,
    ).updatedItem;
    const result = processReview(
      item,
      emptyLearner,
      event(false, new Date('2026-01-03')),
      config,
    );
    // transition review was incorrect: S initializes to defaultPriorStability (4), then lapses: max(0.5, 0.5*4)=2
    expect(result.updatedItem.stability).toBe(2);
  });

  it('applies the lapse rule (not the correction/growth pipeline) on any incorrect adaptive-path review', () => {
    let item = createInitialItemState('l1', 'c1');
    item = processReview(
      item,
      emptyLearner,
      event(true, new Date('2026-01-01')),
      config,
    ).updatedItem;
    item = processReview(
      item,
      emptyLearner,
      event(true, new Date('2026-01-02')),
      config,
    ).updatedItem;
    item = processReview(
      item,
      emptyLearner,
      event(true, new Date('2026-01-03')),
      config,
    ).updatedItem;
    const stabilityBeforeLapse = item.stability!;
    const result = processReview(
      item,
      emptyLearner,
      event(false, new Date('2026-01-10')),
      config,
    );
    expect(result.updatedItem.stability).toBe(
      Math.max(
        config.stabilityFloor,
        config.lapseFactor * stabilityBeforeLapse,
      ),
    );
  });

  it('only updates the learner response-time stats on correct responses', () => {
    const item = createInitialItemState('l1', 'c1');
    const correctResult = processReview(
      item,
      emptyLearner,
      event(true, new Date('2026-01-01')),
      config,
    );
    expect(correctResult.updatedLearner.rtCount).toBe(1);

    const incorrectResult = processReview(
      item,
      emptyLearner,
      event(false, new Date('2026-01-01')),
      config,
    );
    expect(incorrectResult.updatedLearner.rtCount).toBe(0);
  });
});
