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
