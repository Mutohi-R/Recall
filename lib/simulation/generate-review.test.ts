import { describe, it, expect } from 'vitest';
import { createRng } from './rng';
import { generateReview } from './generate-review';
import {
  createSyntheticLearner,
  createSyntheticItemState,
} from './synthetic-learner';

const config = { targetRetrievability: 0.9, responseTimeConstant: 0.3 };

describe('generateReview', () => {
  it('is deterministic for a given seed', () => {
    const learner = createSyntheticLearner('l1', 'matched', createRng(1));
    const item = createSyntheticItemState(learner, 'c1', createRng(2));
    const a = generateReview(learner, item, 5, config, createRng(7));
    const b = generateReview(learner, item, 5, config, createRng(7));
    expect(a).toEqual(b);
  });

  it('draws correctness at roughly the true retrievability rate over many trials', () => {
    const learner = createSyntheticLearner('l1', 'matched', createRng(1));
    const trueStability = 20;
    const elapsedDays = 20; // matched condition => trueR = 1/e ≈ 0.368
    const rng = createRng(123);
    const n = 20000;
    let correctCount = 0;
    for (let i = 0; i < n; i++) {
      const item = {
        learnerId: 'l1',
        cardId: 'c1',
        trueStability,
        lastReviewedAt: null,
      };
      if (generateReview(learner, item, elapsedDays, config, rng).correct)
        correctCount++;
    }
    expect(correctCount / n).toBeCloseTo(1 / Math.E, 1);
  });

  it('generates faster-than-typical responses on average when true retrievability exceeds theta', () => {
    const learner = createSyntheticLearner('l1', 'matched', createRng(1));
    const typicalMs = Math.exp(learner.trueMeanLogResponseTime) * 1000;
    const rng = createRng(55);
    const n = 5000;
    let total = 0;
    let correctCount = 0;
    for (let i = 0; i < n; i++) {
      // elapsed = 0 => trueR = 1, comfortably above theta (0.9) => responses should skew fast
      const item = {
        learnerId: 'l1',
        cardId: 'c1',
        trueStability: 20,
        lastReviewedAt: null,
      };
      const review = generateReview(learner, item, 0, config, rng);
      if (review.correct) {
        total += review.responseTimeMs;
        correctCount++;
      }
    }
    expect(total / correctCount).toBeLessThan(typicalMs);
  });

  it('keeps correct-response times bounded even when the implied z-score is extreme', () => {
    // theta - trueR up to ~0.9, divided by a tiny c => impliedZ in the dozens
    // if uncapped. With MAX_IMPLIED_Z = 4 and this learner/config, the most
    // extreme a *correct* response can be is mean + std*(4 + noise) on the
    // log scale; noise alone (responseTimeSignalNoise up to 1.5) could in
    // principle push a single draw further, but across many draws the
    // average implied contribution from z should never blow up the way an
    // unbounded z would.
    const learner = createSyntheticLearner('l1', 'matched', createRng(1));
    const tinyC = { targetRetrievability: 0.9, responseTimeConstant: 0.01 };
    const rng = createRng(99);
    const n = 2000;
    let maxLogMs = -Infinity;
    for (let i = 0; i < n; i++) {
      // elapsed far beyond stability => trueR near 0, so theta - trueR ~ 0.9,
      // and with c = 0.01 the unclamped impliedZ would be ~90.
      const item = {
        learnerId: 'l1',
        cardId: 'c1',
        trueStability: 1,
        lastReviewedAt: null,
      };
      const review = generateReview(learner, item, 50, tinyC, rng);
      if (review.correct) {
        maxLogMs = Math.max(maxLogMs, Math.log(review.responseTimeMs));
      }
    }
    // Bound: mean + std*(MAX_IMPLIED_Z + a generous allowance for noise), on
    // the log-ms scale (trueMeanLogResponseTime is in log-seconds).
    const bound =
      learner.trueMeanLogResponseTime +
      Math.log(1000) +
      learner.trueStdLogResponseTime *
        (4 + 6 * learner.responseTimeSignalNoise);
    expect(maxLogMs).toBeLessThan(bound);
  });

  it('draws incorrect-response times from the baseline distribution, independent of true R', () => {
    const learner = createSyntheticLearner('l1', 'matched', createRng(1));
    const typicalLogMs = learner.trueMeanLogResponseTime + Math.log(1000);
    const rng = createRng(77);
    const n = 5000;
    let totalLog = 0;
    let incorrectCount = 0;
    for (let i = 0; i < n; i++) {
      // huge elapsed time => trueR ~ 0, virtually guaranteed incorrect
      const item = {
        learnerId: 'l1',
        cardId: 'c1',
        trueStability: 1,
        lastReviewedAt: null,
      };
      const review = generateReview(learner, item, 500, config, rng);
      if (!review.correct) {
        totalLog += Math.log(review.responseTimeMs);
        incorrectCount++;
      }
    }
    expect(totalLog / incorrectCount).toBeCloseTo(typicalLogMs, 0);
  });
});
