import { describe, it, expect } from 'vitest';
import {
  updateResponseTimeStats,
  computeMedianStability,
} from './learner-stats';
import type { LearnerState } from './types';

const emptyLearner: LearnerState = {
  learnerId: 'l1',
  meanLogResponseTime: null,
  stdLogResponseTime: null,
  logResponseTimeM2: 0,
  rtCount: 0,
  priorStability: null,
};

describe('updateResponseTimeStats', () => {
  it('after one observation, mean equals that observation and std is 0', () => {
    const l = updateResponseTimeStats(emptyLearner, 1000); // ln(1) = 0
    expect(l.rtCount).toBe(1);
    expect(l.meanLogResponseTime).toBeCloseTo(0, 10);
    expect(l.stdLogResponseTime).toBeCloseTo(0, 10);
  });

  it('after two observations, computes running mean and std correctly', () => {
    let l = updateResponseTimeStats(emptyLearner, 1000); // ln(1) = 0
    l = updateResponseTimeStats(l, Math.exp(2) * 1000); // ln(e^2) = 2
    expect(l.rtCount).toBe(2);
    expect(l.meanLogResponseTime).toBeCloseTo(1, 10); // (0+2)/2
    expect(l.stdLogResponseTime).toBeCloseTo(1, 10); // population std of [0,2]
  });
});

describe('computeMedianStability', () => {
  it('returns null for an empty list', () => {
    expect(computeMedianStability([])).toBeNull();
  });

  it('returns the middle value for an odd-length list', () => {
    expect(computeMedianStability([3, 1, 2])).toBe(2);
  });

  it('averages the two middle values for an even-length list', () => {
    expect(computeMedianStability([1, 2, 3, 4])).toBe(2.5);
  });
});
