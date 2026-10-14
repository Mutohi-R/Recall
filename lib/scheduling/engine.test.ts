import { describe, it, expect } from 'vitest';
import { processReview } from './engine';
import { createInitialItemState } from './sm2';
import type { LearnerState, EngineConfig, ReviewEvent } from './types';

const config: EngineConfig = {
  targetRetrievability: 0.9,
  responseTimeConstant: 0.05,
  minRetrievability: 0.3,
  maxRetrievability: 0.99,
  stabilitySmoothing: 0.3,
  stabilityGrowthRate: 0.1,
  lapseFactor: 0.5,
  stabilityFloor: 0.5,
  stabilityMax: 1000,
  minIntervalForCorrection: 1,
  maxStabilityChangePerReview: 100, // proportional: effectively uncapped here
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
    // reviewCount is now 2, equal to coldStartItemReviews -> this review transitions it.
    // It is still a correct response on the adaptive path, so it does not just
    // adopt the prior (7) unchanged - it also runs that prior through the same
    // correction-then-growth update any other adaptive review would get
    // (elapsed = 1 day, rHat = targetRetrievability = 0.9 since the learner has
    // no response-time history yet): corrected = 0.7*7 + 0.3*(-1/ln(0.9)) ≈
    // 7.7474, then growth 7.7474*(1+0.1*0.1) ≈ 7.8248. Asserting this exact
    // value (not just "not null") is what actually confirms the prior of 7 was
    // used, rather than e.g. the global default.
    const learnerWithPrior = { ...emptyLearner, priorStability: 7 };
    const result = processReview(
      item,
      learnerWithPrior,
      event(true, new Date('2026-01-03')),
      config,
    );
    expect(result.pathUsed).toBe('adaptive');
    expect(result.updatedItem.stability).toBeCloseTo(7.8248, 4);
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
      Math.min(
        stabilityBeforeLapse,
        Math.max(
          config.stabilityFloor,
          config.lapseFactor * stabilityBeforeLapse,
        ),
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

  it('rejects a response time that is zero, negative or not a number', () => {
    const item = createInitialItemState('l1', 'c1');
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        processReview(
          item,
          emptyLearner,
          event(true, new Date('2026-01-01'), bad),
          config,
        ),
      ).toThrow(RangeError);
    }
  });

  it('rejects a review dated before the previous one', () => {
    const item = {
      ...createInitialItemState('l1', 'c1'),
      lastReviewedAt: new Date('2026-01-05'),
    };
    expect(() =>
      processReview(
        item,
        emptyLearner,
        event(true, new Date('2026-01-04')),
        config,
      ),
    ).toThrow(RangeError);
  });

  // Regression test for the audit finding: with the old day-based cap on the
  // correction step alone, a mature item answered slowly earned a LONGER next
  // interval than one answered at typical speed. These values are the
  // configuration that exposed it, with the cap now read as a proportion.
  it('never gives a slower correct answer a longer next interval, at any stability', () => {
    const exposed: EngineConfig = {
      ...config,
      responseTimeConstant: 0.0819,
      minRetrievability: 0.7458,
      maxRetrievability: 0.9562,
      stabilitySmoothing: 0.4523,
      stabilityGrowthRate: 0.5757,
      minIntervalForCorrection: 0.9831,
      maxStabilityChangePerReview: 0.5,
      stabilityMax: 36500,
    };
    const learner: LearnerState = {
      ...emptyLearner,
      meanLogResponseTime: Math.log(3),
      stdLogResponseTime: 0.4,
      rtCount: 100,
    };
    const DAY = 24 * 60 * 60 * 1000;
    for (const stability of [5, 20, 100, 500, 5000]) {
      const last = new Date('2026-01-01');
      const onTime = new Date(last.getTime() - stability * Math.log(0.9) * DAY);
      const intervals = [-2, -1, 0, 1, 2].map((z) => {
        const item = {
          ...createInitialItemState('l1', 'c1'),
          stability,
          reviewCount: 5,
          lastReviewedAt: last,
        };
        const rt = Math.exp(Math.log(3) + 0.4 * z) * 1000;
        const out = processReview(
          item,
          learner,
          event(true, onTime, rt),
          exposed,
        );
        return out.nextReviewAt.getTime() - onTime.getTime();
      });
      // ordered fastest (z = -2) to slowest (z = +2): never increasing
      for (let i = 1; i < intervals.length; i++) {
        expect(intervals[i]).toBeLessThanOrEqual(intervals[i - 1] + 1e-6);
      }
    }
  });
});
