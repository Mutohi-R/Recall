import { describe, it, expect } from 'vitest';
import { createRng } from './rng';
import {
  createSyntheticLearner,
  createSyntheticItemState,
} from './synthetic-learner';
import {
  simulateLearnerDayLoop,
  DEFAULT_DAY_LOOP_CONFIG,
  type DayLoopConfig,
  type SchedulerPolicy,
} from './day-loop';
import { computeMedianStability } from '../scheduling/learner-stats';
import type { SyntheticLearner, SyntheticItemState } from './types';
import type { Rng } from './rng';
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

// The single-item cases below are a learner with exactly one item, which is
// the situation the earlier one-item-at-a-time version of the loop modelled.
function simulateItemDayLoop(options: {
  learner: SyntheticLearner;
  initialItem: SyntheticItemState;
  policy: SchedulerPolicy;
  engineConfig: EngineConfig;
  dayLoopConfig: DayLoopConfig;
  rng: Rng;
}) {
  const { initialItem, rng, ...rest } = options;
  return simulateLearnerDayLoop({
    ...rest,
    items: [{ initialItem, rng }],
  }).results[0];
}

describe('simulateItemDayLoop (a learner with one item)', () => {
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

describe('simulateLearnerDayLoop (several items sharing one learner state)', () => {
  // Builds `count` items for one learner, each with its own seeded random
  // stream, the way scripts/run-simulation.ts does. Fresh streams are made on
  // every call so two runs can be compared on identical draws.
  const buildItems = (
    learner: SyntheticLearner,
    count: number,
    seedBase: number,
  ) =>
    Array.from({ length: count }, (_, i) => {
      const itemSeed = seedBase + i * 104729;
      return {
        initialItem: createSyntheticItemState(
          learner,
          `c${i}`,
          createRng(itemSeed),
        ),
        rng: createRng(itemSeed),
      };
    });

  const smallN = {
    ...config,
    coldStartItemReviews: 2,
    coldStartLearnerReviews: 5,
  };
  const cfg = { ...DEFAULT_DAY_LOOP_CONFIG, studyPeriodDays: 200 };

  it('returns one result per item, in input order', () => {
    const learner = createSyntheticLearner('l1', 'matched', createRng(21));
    const out = simulateLearnerDayLoop({
      learner,
      items: buildItems(learner, 5, 1000),
      policy: 'adaptive',
      engineConfig: smallN,
      dayLoopConfig: cfg,
    });
    expect(out.results.length).toBe(5);
    for (const r of out.results) expect(r.condition).toBe('matched');
  });

  it("pools response-time statistics across the learner's items, not per item", () => {
    const learner = createSyntheticLearner('l1', 'matched', createRng(22));
    const out = simulateLearnerDayLoop({
      learner,
      items: buildItems(learner, 4, 2000),
      policy: 'adaptive',
      engineConfig: smallN,
      dayLoopConfig: cfg,
    });

    const correctPerItem = out.results.map(
      (r) => r.trace.filter((e) => e.kind === 'review' && e.correct).length,
    );
    const totalCorrect = correctPerItem.reduce((a, b) => a + b, 0);

    // Response-time statistics are updated on every correct review, on both
    // paths, so the shared count must equal the correct reviews of all items
    // together - and so be larger than any one item's own count.
    expect(out.finalLearner.rtCount).toBe(totalCorrect);
    expect(out.finalLearner.rtCount).toBeGreaterThan(
      Math.max(...correctPerItem),
    );
  });

  it("ends with a prior equal to the median of the learner's adaptive-path stabilities", () => {
    const learner = createSyntheticLearner('l1', 'matched', createRng(23));
    const out = simulateLearnerDayLoop({
      learner,
      items: buildItems(learner, 6, 3000),
      policy: 'adaptive',
      engineConfig: smallN,
      dayLoopConfig: cfg,
    });

    // An item's final scheduler-side stability is the estimate recorded at its
    // last review; it is null for an item that never left the fallback.
    const finalStabilities = out.results
      .map((r) => {
        const reviews = r.trace.filter((e) => e.kind === 'review');
        return reviews[reviews.length - 1].estimatedStability;
      })
      .filter((s): s is number => s !== null);

    expect(finalStabilities.length).toBeGreaterThan(0);
    expect(out.finalLearner.priorStability).toBeCloseTo(
      computeMedianStability(finalStabilities)!,
      10,
    );
  });

  it('gives the first item to leave the fallback the global default, and a later item the learner prior', () => {
    const learner = createSyntheticLearner('l1', 'matched', createRng(24));
    const out = simulateLearnerDayLoop({
      learner,
      items: buildItems(learner, 6, 4000),
      policy: 'adaptive',
      engineConfig: smallN,
      dayLoopConfig: cfg,
    });

    // Order items by when they first reach the adaptive path (earliest day
    // first, input order breaking ties, which is the order the loop uses).
    const transitions = out.results
      .map((r, index) => ({
        index,
        day: r.trace.find((e) => e.path === 'adaptive')?.day ?? Infinity,
        usedPrior: r.transitionUsedLearnerPrior,
      }))
      .filter((t) => t.usedPrior !== null)
      .sort((a, b) => a.day - b.day || a.index - b.index);

    expect(transitions.length).toBeGreaterThanOrEqual(2);
    // Before any item is on the adaptive path no prior exists...
    expect(transitions[0].usedPrior).toBe(false);
    // ...and once one is, the next item to leave the fallback can use it.
    expect(transitions.slice(1).some((t) => t.usedPrior === true)).toBe(true);
  });

  it('never forms a learner prior under adaptive-default-prior, but still pools response times', () => {
    const learner = createSyntheticLearner('l1', 'matched', createRng(27));
    const out = simulateLearnerDayLoop({
      learner,
      items: buildItems(learner, 6, 7000),
      policy: 'adaptive-default-prior',
      engineConfig: smallN,
      dayLoopConfig: cfg,
    });

    expect(out.finalLearner.priorStability).toBeNull();
    expect(out.finalLearner.rtCount).toBeGreaterThan(0);
    const transitions = out.results.filter(
      (r) => r.transitionUsedLearnerPrior !== null,
    );
    expect(transitions.length).toBeGreaterThan(0);
    for (const r of transitions)
      expect(r.transitionUsedLearnerPrior).toBe(false);
  });

  it('matches adaptive exactly for a learner with a single item, since no other item can form a prior', () => {
    // The prior is the median over the learner's other adaptive items as well
    // as the current one, but it is only ever read at a transition review,
    // before the item has any stability of its own, so with one item it is
    // always null and the two variants must behave identically.
    const learner = createSyntheticLearner('l1', 'matched', createRng(28));
    const run = (policy: SchedulerPolicy) =>
      simulateLearnerDayLoop({
        learner,
        items: buildItems(learner, 1, 8000),
        policy,
        engineConfig: smallN,
        dayLoopConfig: cfg,
      }).results[0];
    expect(run('adaptive-default-prior').trace).toEqual(run('adaptive').trace);
  });

  it('does not touch the shared learner state under the sm2-only policy', () => {
    const learner = createSyntheticLearner('l1', 'matched', createRng(25));
    const out = simulateLearnerDayLoop({
      learner,
      items: buildItems(learner, 3, 5000),
      policy: 'sm2-only',
      engineConfig: smallN,
      dayLoopConfig: cfg,
    });
    expect(out.finalLearner.rtCount).toBe(0);
    expect(out.finalLearner.priorStability).toBeNull();
    for (const r of out.results)
      expect(r.transitionUsedLearnerPrior).toBeNull();
  });

  it("leaves an sm2-only item's outcome unchanged by the other items alongside it", () => {
    const learner = createSyntheticLearner('l1', 'matched', createRng(26));
    const alone = simulateLearnerDayLoop({
      learner,
      items: buildItems(learner, 1, 6000),
      policy: 'sm2-only',
      engineConfig: smallN,
      dayLoopConfig: cfg,
    }).results[0];
    const together = simulateLearnerDayLoop({
      learner,
      items: buildItems(learner, 4, 6000), // item 0 uses the same seed as above
      policy: 'sm2-only',
      engineConfig: smallN,
      dayLoopConfig: cfg,
    }).results[0];

    expect(together.reviewCount).toBe(alone.reviewCount);
    expect(together.retentionCorrect).toBe(alone.retentionCorrect);
    expect(together.trace).toEqual(alone.trace);
  });
});
