import { describe, it, expect } from 'vitest';
import { applyStabilityUpdate, applyLapse } from './stability';
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
  stabilityMax: 1000,
  minIntervalForCorrection: 1,
  maxStabilityChangePerReview: 100,
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

  it('skips correction but still applies growth when the interval is too short', () => {
    const shortIntervalConfig = { ...config, minIntervalForCorrection: 1 };
    // elapsed 0.2 < min 1 => correction skipped, stability stays 10 going into growth
    // growth with R_HAT=0.9: 10 * (1 + 0.1*0.1) = 10.01
    const result = applyStabilityUpdate(10, 0.2, 0.9, shortIntervalConfig);
    expect(result).toBeCloseTo(10.1, 5);
  });

  it('caps the correction step at maxStabilityChangePerReview', () => {
    // uncapped correction would move 10 -> 13 (delta 3), cap it to delta 2
    const cappedConfig = { ...config, maxStabilityChangePerReview: 2 };
    // corrected & capped = 12, then growth: 12 * (1 + 0.1*(1-1/e)) ≈ 12.7585
    const result = applyStabilityUpdate(10, 20, R_HAT, cappedConfig);
    expect(result).toBeCloseTo(12.7585, 3);
  });

  it('never exceeds stabilityMax', () => {
    const lowCeiling = { ...config, stabilityMax: 5 };
    const result = applyStabilityUpdate(10, 20, R_HAT, lowCeiling);
    expect(result).toBe(5);
  });

  it('grows more from a harder (lower R̂) recall than an easy one', () => {
    const hard = applyStabilityUpdate(10, 0.1, 0.4, {
      ...config,
      minIntervalForCorrection: 1,
    });
    const easy = applyStabilityUpdate(10, 0.1, 0.95, {
      ...config,
      minIntervalForCorrection: 1,
    });
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
});
