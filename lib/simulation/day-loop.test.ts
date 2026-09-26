import { describe, it, expect } from 'vitest';
import { createRng } from './rng';
import {
  createSyntheticLearner,
  createSyntheticItemState,
} from './synthetic-learner';
import { simulateItemDayLoop, DEFAULT_DAY_LOOP_CONFIG } from './day-loop';
import type { EngineConfig } from './../scheduling/types';

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

describe('simulateItemDayLoop', () => {
  it('routes the first coldStartItemReviews reviews through sm2, then adaptive, under the adaptive policy', () => {
    const rng = createRng(1);
    const learner = createSyntheticLearner('l1', 'matched', rng);
    const item = createSyntheticItemState(learner, 'c1', rng);

    const result = simulateItemDayLoop({
      learner,
      initialItem: item,
      policy: 'adaptive',
      engineConfig: config,
      dayLoopConfig: { ...DEFAULT_DAY_LOOP_CONFIG, studyPeriodDays: 60 },
      rng,
    });

    const reviews = result.trace.filter((e) => e.kind === 'review');
    expect(reviews.length).toBeGreaterThanOrEqual(config.coldStartItemReviews);
    for (let i = 0; i < config.coldStartItemReviews; i++) {
      expect(reviews[i].path).toBe('sm2');
    }
    for (let i = config.coldStartItemReviews; i < reviews.length; i++) {
      expect(reviews[i].path).toBe('adaptive');
    }
  });

  it('never leaves sm2 under the sm2-only policy', () => {
    const rng = createRng(2);
    const learner = createSyntheticLearner('l1', 'matched', rng);
    const item = createSyntheticItemState(learner, 'c1', rng);

    const result = simulateItemDayLoop({
      learner,
      initialItem: item,
      policy: 'sm2-only',
      engineConfig: config,
      dayLoopConfig: { ...DEFAULT_DAY_LOOP_CONFIG, studyPeriodDays: 60 },
      rng,
    });

    const reviews = result.trace.filter((e) => e.kind === 'review');
    expect(reviews.length).toBeGreaterThan(0);
    for (const r of reviews) expect(r.path).toBe('sm2');
  });

  it('excludes the test-point probe from reviewCount and records exactly one probe entry', () => {
    const rng = createRng(3);
    const learner = createSyntheticLearner('l1', 'matched', rng);
    const item = createSyntheticItemState(learner, 'c1', rng);

    const result = simulateItemDayLoop({
      learner,
      initialItem: item,
      policy: 'adaptive',
      engineConfig: config,
      dayLoopConfig: { ...DEFAULT_DAY_LOOP_CONFIG, studyPeriodDays: 60 },
      rng,
    });

    const reviews = result.trace.filter((e) => e.kind === 'review');
    const probes = result.trace.filter((e) => e.kind === 'probe');
    expect(reviews.length).toBe(result.reviewCount);
    expect(probes.length).toBe(1);
    expect(probes[0].reviewIndex).toBeNull();
  });

  it('the test-point probe reads true stability without updating it', () => {
    const rng = createRng(4);
    const learner = createSyntheticLearner('l1', 'matched', rng);
    const item = createSyntheticItemState(learner, 'c1', rng);

    const result = simulateItemDayLoop({
      learner,
      initialItem: item,
      policy: 'adaptive',
      engineConfig: config,
      dayLoopConfig: { ...DEFAULT_DAY_LOOP_CONFIG, studyPeriodDays: 60 },
      rng,
    });

    const reviews = result.trace.filter((e) => e.kind === 'review');
    const lastReview = reviews[reviews.length - 1];
    const probe = result.trace.find((e) => e.kind === 'probe')!;
    expect(probe.trueStabilityAfter).toBe(lastReview.trueStabilityAfter);
  });

  it('is recorded as not converged when the tolerance band is unreachably narrow', () => {
    const rng = createRng(5);
    const learner = createSyntheticLearner('l1', 'matched', rng);
    const item = createSyntheticItemState(learner, 'c1', rng);

    const result = simulateItemDayLoop({
      learner,
      initialItem: item,
      policy: 'adaptive',
      engineConfig: config,
      dayLoopConfig: {
        ...DEFAULT_DAY_LOOP_CONFIG,
        studyPeriodDays: 365,
        convergenceToleranceBand: 0, // impossible to land on theta exactly
        convergenceMaxReviews: 5,
      },
      rng,
    });

    expect(result.convergedAtReview).toBeNull();
    expect(result.didNotConverge).toBe(true);
  });

  it('converges on the first adaptive-path review when the tolerance band covers the full [0,1] range', () => {
    const rng = createRng(6);
    const learner = createSyntheticLearner('l1', 'matched', rng);
    const item = createSyntheticItemState(learner, 'c1', rng);

    const result = simulateItemDayLoop({
      learner,
      initialItem: item,
      policy: 'adaptive',
      engineConfig: { ...config, coldStartItemReviews: 1 }, // reach adaptive quickly
      dayLoopConfig: {
        ...DEFAULT_DAY_LOOP_CONFIG,
        studyPeriodDays: 30,
        convergenceToleranceBand: 1, // any true retrievability in [0,1] qualifies
        convergenceConsecutiveRequired: 1,
      },
      rng,
    });

    expect(result.convergedAtReview).toBe(1);
    expect(result.didNotConverge).toBe(false);
  });

  it('produces at least as many reviews over a longer study period as a shorter one, from the same seed', () => {
    const learner = createSyntheticLearner('l1', 'matched', createRng(7));
    const item = createSyntheticItemState(learner, 'c1', createRng(8));

    const short = simulateItemDayLoop({
      learner,
      initialItem: item,
      policy: 'adaptive',
      engineConfig: config,
      dayLoopConfig: { ...DEFAULT_DAY_LOOP_CONFIG, studyPeriodDays: 30 },
      rng: createRng(9),
    });
    const long = simulateItemDayLoop({
      learner,
      initialItem: item,
      policy: 'adaptive',
      engineConfig: config,
      dayLoopConfig: { ...DEFAULT_DAY_LOOP_CONFIG, studyPeriodDays: 300 },
      rng: createRng(9),
    });

    expect(long.reviewCount).toBeGreaterThanOrEqual(short.reviewCount);
  });

  it('produces a probeTrueRetrievability in [0,1] and a boolean retentionCorrect', () => {
    const rng = createRng(10);
    const learner = createSyntheticLearner('l1', 'mismatched', rng);
    const item = createSyntheticItemState(learner, 'c1', rng);

    const result = simulateItemDayLoop({
      learner,
      initialItem: item,
      policy: 'sm2-only',
      engineConfig: config,
      dayLoopConfig: { ...DEFAULT_DAY_LOOP_CONFIG, studyPeriodDays: 60 },
      rng,
    });

    expect(result.probeTrueRetrievability).toBeGreaterThanOrEqual(0);
    expect(result.probeTrueRetrievability).toBeLessThanOrEqual(1);
    expect(typeof result.retentionCorrect).toBe('boolean');
  });

  it('carries the learner condition through to the result', () => {
    const rng = createRng(11);
    const learner = createSyntheticLearner('l1', 'mismatched', rng);
    const item = createSyntheticItemState(learner, 'c1', rng);

    const result = simulateItemDayLoop({
      learner,
      initialItem: item,
      policy: 'adaptive',
      engineConfig: config,
      dayLoopConfig: { ...DEFAULT_DAY_LOOP_CONFIG, studyPeriodDays: 30 },
      rng,
    });

    expect(result.condition).toBe('mismatched');
  });
});
