import { describe, it, expect } from 'vitest';
import {
  trueRetrievabilityExponential,
  trueRetrievabilityPowerLaw,
  computeTrueRetrievability,
} from './generative-models';

describe('trueRetrievabilityExponential', () => {
  it('is 1 immediately after review', () => {
    expect(trueRetrievabilityExponential(0, 20)).toBe(1);
  });

  it('falls to 1/e when elapsed equals stability', () => {
    expect(trueRetrievabilityExponential(20, 20)).toBeCloseTo(1 / Math.E, 10);
  });
});

describe('trueRetrievabilityPowerLaw', () => {
  it('is 1 immediately after review', () => {
    expect(trueRetrievabilityPowerLaw(0, 20)).toBeCloseTo(1, 10);
  });

  it('falls to exactly 0.9 when elapsed equals stability, by construction', () => {
    expect(trueRetrievabilityPowerLaw(20, 20)).toBeCloseTo(0.9, 10);
  });

  it('decays more slowly than the exponential at long intervals (the fat tail)', () => {
    const longElapsed = 200;
    const stability = 20;
    const powerLawR = trueRetrievabilityPowerLaw(longElapsed, stability);
    const exponentialR = trueRetrievabilityExponential(longElapsed, stability);
    expect(powerLawR).toBeGreaterThan(exponentialR);
  });
});

describe('computeTrueRetrievability', () => {
  it('dispatches to the exponential curve for the matched condition', () => {
    expect(computeTrueRetrievability('matched', 20, 20)).toBeCloseTo(
      1 / Math.E,
      10,
    );
  });

  it('dispatches to the power-law curve for the mismatched condition', () => {
    expect(computeTrueRetrievability('mismatched', 20, 20)).toBeCloseTo(
      0.9,
      10,
    );
  });
});
