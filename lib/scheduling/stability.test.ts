import { describe, it, expect } from 'vitest';
import { applyStabilityUpdate, applyLapse } from './stability';
import type { EngineConfig } from './types';

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
  coldStartItemReviews: 3,
  coldStartLearnerReviews: 10,
  defaultPriorStability: 2,
};

const R_HAT = 1 / Math.E; // ln(R_HAT) = -1, so S_obs = elapsedDays exactly

describe('applyStabilityUpdate', () => {
  it('applies correction then growth when the interval is long enough', () => {
    // S_obs = 20 (by construction) => corrected = 0.7*10 + 0.3*20 = 13
    // growth = 13 * (1 + 0.1*(1 - 1/e)) ≈ 13.8218
    const result = applyStabilityUpdate(10, 20, R_HAT, config);
    expect(result).toBeCloseTo(13.8218, 3);
  });

  it('skips correction when the interval is too short, and grows using theta rather than the speed-based estimate', () => {
    // elapsed 0.2 < min 1 => correction skipped, stability stays 10 going into
    // growth, and growth uses theta (0.9): 10 * (1 + 0.1*0.1) = 10.1. The
    // speed-based estimate (0.4 or 0.99 here) is not used, so a slow and a
    // fast answer give the same result.
    const slow = applyStabilityUpdate(10, 0.2, 0.4, config);
    const fast = applyStabilityUpdate(10, 0.2, 0.99, config);
    expect(slow).toBeCloseTo(10.1, 10);
    expect(fast).toBeCloseTo(10.1, 10);
  });

  it('caps the combined change proportionally, after growth', () => {
    // uncapped: correction 13, growth -> 13.8218. A cap of 0.2 allows at
    // most 10 * 1.2 = 12.
    const capped = { ...config, maxStabilityChangePerReview: 0.2 };
    expect(applyStabilityUpdate(10, 20, R_HAT, capped)).toBeCloseTo(12, 10);
  });

  it('caps a large drop proportionally too', () => {
    // elapsed 1 day, R_HAT = 1/e => S_obs = 1, corrected = 0.7*100 + 0.3*1
    // = 70.3, growth -> 74.74. A cap of 0.25 allows at least 100 / 1.25 = 80.
    const capped = { ...config, maxStabilityChangePerReview: 0.25 };
    expect(applyStabilityUpdate(100, 1, R_HAT, capped)).toBeCloseTo(80, 10);
  });

  it('never exceeds stabilityMax', () => {
    const lowCeiling = { ...config, stabilityMax: 5 };
    const result = applyStabilityUpdate(10, 20, R_HAT, lowCeiling);
    expect(result).toBe(5);
  });

  it('grows more from a harder (lower R̂) recall than an easy one, before correction is considered', () => {
    // correction switched off (alpha ~ 0) so only the growth term differs
    const growthOnly = { ...config, stabilitySmoothing: 1e-12 };
    const hard = applyStabilityUpdate(10, 5, 0.4, growthOnly);
    const easy = applyStabilityUpdate(10, 5, 0.95, growthOnly);
    expect(hard).toBeGreaterThan(easy);
  });
});

describe('applyLapse', () => {
  it('reduces stability by the lapse factor', () => {
    expect(applyLapse(10, config)).toBe(5); // 0.5 * 10
  });

  it('never drops below the stability floor', () => {
    const lowLambda = { ...config, lapseFactor: 0.3, stabilityFloor: 0.5 };
    expect(applyLapse(1, lowLambda)).toBe(0.5); // 0.3*1=0.3, floored to 0.5
  });

  it('never raises stability that is already below the floor', () => {
    const highFloor = { ...config, stabilityFloor: 18 };
    expect(applyLapse(8, highFloor)).toBe(8); // max(18, 4) = 18 would be a rise
  });
});
