import { describe, it, expect } from 'vitest';
import { createRng } from './rng';
import {
  sampleCandidate,
  satisfiesBoundsConstraints,
  computeMonotonicityMultiplier,
  satisfiesMonotonicity,
  isValidCandidate,
  DEFAULT_SEARCH_RANGES,
  FIXED_ENGINE_PARAMS,
  selectCandidate,
} from './parameter-fitting';
import type { EngineConfig } from '../scheduling/types';

// A known-good baseline, structurally the same config used in day-loop.test.ts,
// which satisfies both 3.7.7's bounds and its monotonicity condition (verified
// by hand below).
const baseline: EngineConfig = {
  targetRetrievability: 0.9,
  responseTimeConstant: 0.05,
  minRetrievability: 0.3,
  maxRetrievability: 0.99,
  stabilitySmoothing: 0.3,
  stabilityGrowthRate: 0.1,
  lapseFactor: 0.5,
  stabilityFloor: 0.5,
  stabilityMax: 36500,
  minIntervalForCorrection: 0.5,
  maxStabilityChangePerReview: 1000, // proportional: effectively uncapped
  coldStartItemReviews: 3,
  coldStartLearnerReviews: 10,
  defaultPriorStability: 2,
};

describe('satisfiesBoundsConstraints', () => {
  it('accepts a config that satisfies every 3.7.7 bound', () => {
    expect(satisfiesBoundsConstraints(baseline)).toBe(true);
  });

  it('rejects minRetrievability <= 0', () => {
    expect(
      satisfiesBoundsConstraints({ ...baseline, minRetrievability: 0 }),
    ).toBe(false);
  });

  it('rejects minRetrievability >= targetRetrievability', () => {
    expect(
      satisfiesBoundsConstraints({ ...baseline, minRetrievability: 0.9 }),
    ).toBe(false);
    expect(
      satisfiesBoundsConstraints({ ...baseline, minRetrievability: 0.95 }),
    ).toBe(false);
  });

  it('rejects maxRetrievability >= 1', () => {
    expect(
      satisfiesBoundsConstraints({ ...baseline, maxRetrievability: 1 }),
    ).toBe(false);
  });

  it('rejects maxRetrievability <= targetRetrievability', () => {
    expect(
      satisfiesBoundsConstraints({ ...baseline, maxRetrievability: 0.9 }),
    ).toBe(false);
    expect(
      satisfiesBoundsConstraints({ ...baseline, maxRetrievability: 0.85 }),
    ).toBe(false);
  });

  it('rejects stabilitySmoothing outside (0, 1]', () => {
    expect(
      satisfiesBoundsConstraints({ ...baseline, stabilitySmoothing: 0 }),
    ).toBe(false);
    expect(
      satisfiesBoundsConstraints({ ...baseline, stabilitySmoothing: 1.1 }),
    ).toBe(false);
    expect(
      satisfiesBoundsConstraints({ ...baseline, stabilitySmoothing: 1 }),
    ).toBe(true);
  });

  it('rejects lapseFactor outside (0, 1)', () => {
    expect(satisfiesBoundsConstraints({ ...baseline, lapseFactor: 0 })).toBe(
      false,
    );
    expect(satisfiesBoundsConstraints({ ...baseline, lapseFactor: 1 })).toBe(
      false,
    );
  });

  it('rejects stabilityGrowthRate <= 0', () => {
    expect(
      satisfiesBoundsConstraints({ ...baseline, stabilityGrowthRate: 0 }),
    ).toBe(false);
    expect(
      satisfiesBoundsConstraints({ ...baseline, stabilityGrowthRate: -0.1 }),
    ).toBe(false);
  });

  it('rejects stabilityFloor <= 0', () => {
    expect(satisfiesBoundsConstraints({ ...baseline, stabilityFloor: 0 })).toBe(
      false,
    );
  });

  it('rejects stabilityMax <= stabilityFloor', () => {
    expect(
      satisfiesBoundsConstraints({
        ...baseline,
        stabilityMax: baseline.stabilityFloor,
      }),
    ).toBe(false);
    expect(
      satisfiesBoundsConstraints({
        ...baseline,
        stabilityFloor: 100,
        stabilityMax: 50,
      }),
    ).toBe(false);
  });

  it('rejects maxStabilityChangePerReview <= 0', () => {
    expect(
      satisfiesBoundsConstraints({
        ...baseline,
        maxStabilityChangePerReview: 0,
      }),
    ).toBe(false);
  });

  it('rejects defaultPriorStability <= 0', () => {
    expect(
      satisfiesBoundsConstraints({ ...baseline, defaultPriorStability: 0 }),
    ).toBe(false);
  });

  it('rejects a non-integer or too-small coldStartItemReviews', () => {
    expect(
      satisfiesBoundsConstraints({ ...baseline, coldStartItemReviews: 2.5 }),
    ).toBe(false);
    expect(
      satisfiesBoundsConstraints({ ...baseline, coldStartItemReviews: 1 }),
    ).toBe(false);
    expect(
      satisfiesBoundsConstraints({ ...baseline, coldStartItemReviews: 2 }),
    ).toBe(true);
  });

  it('rejects a non-integer or too-small coldStartLearnerReviews', () => {
    expect(
      satisfiesBoundsConstraints({ ...baseline, coldStartLearnerReviews: 4.5 }),
    ).toBe(false);
    expect(
      satisfiesBoundsConstraints({ ...baseline, coldStartLearnerReviews: 0 }),
    ).toBe(false);
    expect(
      satisfiesBoundsConstraints({ ...baseline, coldStartLearnerReviews: 1 }),
    ).toBe(true);
  });
});

describe('computeMonotonicityMultiplier', () => {
  it('matches the closed-form M(rHat) = [(1-alpha) + alpha*ln(theta)/ln(rHat)] * (1 + k*(1-rHat))', () => {
    const config = {
      targetRetrievability: 0.9,
      stabilitySmoothing: 0.3,
      stabilityGrowthRate: 0.1,
    };

    // Hand-computed at rHat = 0.5: correction = 0.7 + 0.3*ln(0.9)/ln(0.5), growth = 1 + 0.1*0.5
    const expectedAt05 =
      (0.7 + 0.3 * (Math.log(0.9) / Math.log(0.5))) * (1 + 0.1 * 0.5);
    expect(computeMonotonicityMultiplier(0.5, config)).toBeCloseTo(
      expectedAt05,
      10,
    );

    // At rHat = theta, ln(theta)/ln(theta) = 1, so correction collapses to 1 exactly.
    const expectedAtTheta = (0.7 + 0.3 * 1) * (1 + 0.1 * (1 - 0.9));
    expect(computeMonotonicityMultiplier(0.9, config)).toBeCloseTo(
      expectedAtTheta,
      10,
    );
    expect(computeMonotonicityMultiplier(0.9, config)).toBeCloseTo(1.01, 10);
  });
});

describe('satisfiesMonotonicity', () => {
  it('accepts the baseline config (verified by hand to be increasing across its R range)', () => {
    expect(satisfiesMonotonicity(baseline)).toBe(true);
  });

  it('rejects a config whose multiplier decreases across the R range', () => {
    // With alpha small (correction stays close to flat) and k large, the
    // growth term 1 + k*(1 - rHat) dominates and falls sharply as rHat rises
    // from 0.5 to 0.8, staying well clear of the rHat = theta singularity.
    // Hand-computed: M(0.5) ~= 3.470, M(0.8) ~= 1.989 - a clear decrease.
    const violating: EngineConfig = {
      ...baseline,
      targetRetrievability: 0.9,
      stabilitySmoothing: 0.01,
      stabilityGrowthRate: 5,
      minRetrievability: 0.5,
      maxRetrievability: 0.8,
    };
    expect(satisfiesMonotonicity(violating)).toBe(false);
  });

  it('checks the multiplier after the proportional change cap, as the engine applies it', () => {
    // The same falling multiplier (about 3.47 down to 1.99), but with a cap
    // of 0.5 every value is held at 1.5: what the engine actually produces is
    // flat, so it no longer decreases.
    const cappedFlat: EngineConfig = {
      ...baseline,
      targetRetrievability: 0.9,
      stabilitySmoothing: 0.01,
      stabilityGrowthRate: 5,
      minRetrievability: 0.5,
      maxRetrievability: 0.8,
      maxStabilityChangePerReview: 0.5,
    };
    expect(satisfiesMonotonicity(cappedFlat)).toBe(true);
  });
});

describe('isValidCandidate', () => {
  it('requires both bounds and monotonicity to pass', () => {
    expect(isValidCandidate(baseline)).toBe(true);

    // Fails bounds only (maxRetrievability below targetRetrievability).
    expect(isValidCandidate({ ...baseline, maxRetrievability: 0.8 })).toBe(
      false,
    );

    // Fails monotonicity only (bounds are untouched and still satisfied).
    const monotonicityViolator: EngineConfig = {
      ...baseline,
      stabilitySmoothing: 0.01,
      stabilityGrowthRate: 5,
      minRetrievability: 0.5,
      maxRetrievability: 0.99,
    };
    expect(satisfiesBoundsConstraints(monotonicityViolator)).toBe(true);
    expect(isValidCandidate(monotonicityViolator)).toBe(false);
  });
});

describe('sampleCandidate', () => {
  it('is deterministic for a given seed', () => {
    const a = sampleCandidate(createRng(123), DEFAULT_SEARCH_RANGES);
    const b = sampleCandidate(createRng(123), DEFAULT_SEARCH_RANGES);
    expect(a).toEqual(b);
  });

  it('fixes targetRetrievability at the value 3.9.1 excludes from fitting', () => {
    const candidate = sampleCandidate(createRng(1), DEFAULT_SEARCH_RANGES);
    expect(candidate.targetRetrievability).toBe(
      FIXED_ENGINE_PARAMS.targetRetrievability,
    );
  });

  it('draws every field within its declared range, across many samples', () => {
    const rng = createRng(999);
    for (let i = 0; i < 500; i++) {
      const candidate = sampleCandidate(rng, DEFAULT_SEARCH_RANGES);

      const numericChecks: [number, [number, number]][] = [
        [
          candidate.responseTimeConstant,
          DEFAULT_SEARCH_RANGES.responseTimeConstant,
        ],
        [candidate.minRetrievability, DEFAULT_SEARCH_RANGES.minRetrievability],
        [candidate.maxRetrievability, DEFAULT_SEARCH_RANGES.maxRetrievability],
        [
          candidate.stabilitySmoothing,
          DEFAULT_SEARCH_RANGES.stabilitySmoothing,
        ],
        [
          candidate.stabilityGrowthRate,
          DEFAULT_SEARCH_RANGES.stabilityGrowthRate,
        ],
        [
          candidate.minIntervalForCorrection,
          DEFAULT_SEARCH_RANGES.minIntervalForCorrection,
        ],
        [
          candidate.maxStabilityChangePerReview,
          DEFAULT_SEARCH_RANGES.maxStabilityChangePerReview,
        ],
        [candidate.lapseFactor, DEFAULT_SEARCH_RANGES.lapseFactor],
        [candidate.stabilityFloor, DEFAULT_SEARCH_RANGES.stabilityFloor],
        [candidate.stabilityMax, DEFAULT_SEARCH_RANGES.stabilityMax],
        [
          candidate.defaultPriorStability,
          DEFAULT_SEARCH_RANGES.defaultPriorStability,
        ],
      ];
      for (const [value, [min, max]] of numericChecks) {
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThanOrEqual(max);
      }

      expect(Number.isInteger(candidate.coldStartItemReviews)).toBe(true);
      expect(candidate.coldStartItemReviews).toBeGreaterThanOrEqual(
        DEFAULT_SEARCH_RANGES.coldStartItemReviews[0],
      );
      expect(candidate.coldStartItemReviews).toBeLessThanOrEqual(
        DEFAULT_SEARCH_RANGES.coldStartItemReviews[1],
      );

      expect(Number.isInteger(candidate.coldStartLearnerReviews)).toBe(true);
      expect(candidate.coldStartLearnerReviews).toBeGreaterThanOrEqual(
        DEFAULT_SEARCH_RANGES.coldStartLearnerReviews[0],
      );
      expect(candidate.coldStartLearnerReviews).toBeLessThanOrEqual(
        DEFAULT_SEARCH_RANGES.coldStartLearnerReviews[1],
      );
    }
  });
});

describe('selectCandidate', () => {
  const stat = (
    meanRetention: number,
    convergenceRate: number,
    meanReviews: number,
  ) => ({ config: baseline, meanRetention, convergenceRate, meanReviews });

  it('picks the cheapest candidate meeting both floors', () => {
    const cheap = stat(0.8, 0.95, 10);
    const pricey = stat(0.9, 0.99, 20);
    const result = selectCandidate([pricey, cheap, stat(0.7, 1, 5)]);
    expect(result.rule).toBe('both-floors');
    expect(result.winner).toBe(cheap);
  });

  it('falls back to the highest convergence among retentive candidates when none meets both floors', () => {
    const best = stat(0.8, 0.6, 30);
    const tieButPricier = stat(0.85, 0.6, 40);
    const result = selectCandidate([stat(0.8, 0.3, 5), tieButPricier, best]);
    expect(result.rule).toBe('convergence-fallback');
    expect(result.winner).toBe(best);
  });

  it('returns no winner when nothing meets the retention floor', () => {
    const result = selectCandidate([stat(0.5, 1, 5)]);
    expect(result.rule).toBe('none');
    expect(result.winner).toBeNull();
  });
});
