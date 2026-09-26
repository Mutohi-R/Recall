import { describe, it, expect } from 'vitest';
import { estimateRetrievability } from './retrievability';
import type { EngineConfig } from './types';

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
  stabilityMax: 36500,
  minIntervalForCorrection: 0.5,
  maxStabilityChangePerReview: 1000,
  coldStartItemReviews: 3,
  coldStartLearnerReviews: 10,
  defaultPriorStability: 2,
};

describe('estimateRetrievability', () => {
  it('returns the fixed incorrect value regardless of response time', () => {
    expect(estimateRetrievability(false, 500, 0.7, 0.3, 50, config)).toBe(0.1);
    expect(estimateRetrievability(false, 20000, 0.7, 0.3, 50, config)).toBe(
      0.1,
    );
  });

  it('returns theta when the learner has not reached the response-time threshold', () => {
    const r = estimateRetrievability(true, 3000, 0.7, 0.3, 5, config);
    expect(r).toBe(0.9);
  });

  it('anchors to theta at exactly the typical (mean) response time', () => {
    // ln(rt) === mean  =>  z === 0  =>  raw === theta exactly
    const meanLogRt = Math.log(3); // "typical" = 3 seconds
    const rt = 3000;
    const r = estimateRetrievability(true, rt, meanLogRt, 0.4, 20, config);
    expect(r).toBeCloseTo(0.9, 10);
  });

  it('estimates above theta for a faster-than-typical correct response', () => {
    const meanLogRt = Math.log(3);
    const r = estimateRetrievability(true, 1000, meanLogRt, 0.4, 20, config); // faster than 3s
    expect(r).toBeGreaterThan(0.9);
  });

  it('estimates below theta for a slower-than-typical correct response', () => {
    const meanLogRt = Math.log(3);
    const r = estimateRetrievability(true, 9000, meanLogRt, 0.4, 20, config); // slower than 3s
    expect(r).toBeLessThan(0.9);
  });

  it('clamps extreme fast responses at maxRetrievability', () => {
    const meanLogRt = Math.log(3);
    const r = estimateRetrievability(true, 1, meanLogRt, 0.01, 20, config); // absurdly fast, tiny sigma
    expect(r).toBe(config.maxRetrievability);
  });

  it('clamps extreme slow responses at minRetrievability', () => {
    const meanLogRt = Math.log(3);
    const r = estimateRetrievability(
      true,
      1000000,
      meanLogRt,
      0.01,
      20,
      config,
    );
    expect(r).toBe(config.minRetrievability);
  });
});
