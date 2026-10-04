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

  // The power law is calibrated to agree with the exponential at the one
  // point that matters to the scheduler: t = -S*ln(0.9), the elapsed time at
  // which the exponential itself reaches 0.9 (3.7.2). It is deliberately NOT
  // calibrated to reach 0.9 at t = S — see the comment in generative-models.ts.
  it('reaches 0.9 at the same elapsed time the exponential does, not at t = S', () => {
    const stability = 20;
    const tAtTheta = -stability * Math.log(0.9);
    expect(trueRetrievabilityPowerLaw(tAtTheta, stability)).toBeCloseTo(
      0.9,
      10,
    );
    expect(trueRetrievabilityExponential(tAtTheta, stability)).toBeCloseTo(
      0.9,
      10,
    );
    // at t = S itself, the two curves now deliberately disagree
    expect(trueRetrievabilityPowerLaw(stability, stability)).not.toBeCloseTo(
      0.9,
      2,
    );
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

  it('dispatches to the power-law curve for the mismatched condition, agreeing with the exponential at theta', () => {
    const stability = 20;
    const tAtTheta = -stability * Math.log(0.9);
    expect(
      computeTrueRetrievability('mismatched', tAtTheta, stability),
    ).toBeCloseTo(0.9, 10);
  });
});
