import { describe, it, expect } from 'vitest';
import { createRng } from './rng';
import {
  createSyntheticLearner,
  createSyntheticItemState,
} from './synthetic-learner';

describe('createSyntheticLearner', () => {
  it('produces the requested learnerId and condition', () => {
    const learner = createSyntheticLearner('l1', 'mismatched', createRng(1));
    expect(learner.learnerId).toBe('l1');
    expect(learner.condition).toBe('mismatched');
  });

  it('is deterministic for a given seed', () => {
    const a = createSyntheticLearner('l1', 'matched', createRng(99));
    const b = createSyntheticLearner('l1', 'matched', createRng(99));
    expect(a).toEqual(b);
  });

  it('keeps generated parameters within their configured ranges', () => {
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) {
      const learner = createSyntheticLearner(`l${i}`, 'matched', rng);
      expect(learner.trueMeanLogResponseTime).toBeGreaterThanOrEqual(
        Math.log(1.5),
      );
      expect(learner.trueMeanLogResponseTime).toBeLessThanOrEqual(Math.log(6));
      expect(learner.trueStabilityScale).toBeGreaterThanOrEqual(0.5);
      expect(learner.trueStabilityScale).toBeLessThanOrEqual(3);
    }
  });
});

describe('createSyntheticItemState', () => {
  it('produces a positive initial stability', () => {
    const learner = createSyntheticLearner('l1', 'matched', createRng(2));
    const item = createSyntheticItemState(learner, 'c1', createRng(3));
    expect(item.trueStability).toBeGreaterThan(0);
    expect(item.lastReviewedAt).toBeNull();
  });

  it("scales roughly with the learner's trueStabilityScale", () => {
    const rng = createRng(10);
    const slowForgetter = {
      ...createSyntheticLearner('l1', 'matched', rng),
      trueStabilityScale: 3,
    };
    const fastForgetter = {
      ...createSyntheticLearner('l2', 'matched', rng),
      trueStabilityScale: 0.5,
    };
    // average over many items to smooth out the per-item jitter
    const avg = (learner: typeof slowForgetter) => {
      const r = createRng(42);
      const n = 500;
      let total = 0;
      for (let i = 0; i < n; i++)
        total += createSyntheticItemState(learner, `c${i}`, r).trueStability;
      return total / n;
    };
    expect(avg(slowForgetter)).toBeGreaterThan(avg(fastForgetter));
  });
});
