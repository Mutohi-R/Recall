/**
 * Task 5 (Week 2): runs the day-by-day loop across many synthetic learners
 * and items, for both scheduling policies (adaptive vs sm2-only) and both
 * generative conditions (matched vs mismatched), and reports the retention,
 * review-count, and convergence numbers thesis 3.9.1 asks for.
 *
 * Usage: npx tsx scripts/run-simulation.ts
 */
import { createRng } from '../lib/simulation/rng';
import {
  createSyntheticLearner,
  createSyntheticItemState,
} from '../lib/simulation/synthetic-learner';
import {
  simulateLearnerDayLoop,
  DEFAULT_DAY_LOOP_CONFIG,
  type SchedulerPolicy,
  type DayLoopResult,
} from '../lib/simulation/day-loop';
import type { GenerativeCondition } from '../lib/simulation/generative-models';
import type { EngineConfig } from '../lib/scheduling/types';

const SEED = 20260201;
const LEARNERS = 50;
const ITEMS_PER_LEARNER = 20;

// Fitted by scripts/fit-parameters.ts (Task 6), on a fitting set generated
// from a seed range distinct from this script's own SEED below, under the
// 'matched' condition only, per 3.9.1's fit/evaluate separation requirement.
// Selection rule: lowest mean reviews/item among candidates with mean
// retention >= 0.75 (see fit-parameters.ts for why 0.75 rather than the
// original 0.85 - that floor turned out not to be reachable under
// defensible parameter ranges). Refitted after the simulation was changed so
// that a learner's items share one learner state (response-time statistics
// and the learner prior), as the deployed application does. Only 2 of the 300
// valid candidates met the floor; the winner reached mean retention 0.833 at
// 81.9 reviews/item on the fitting set itself.
const engineConfig: EngineConfig = {
  targetRetrievability: 0.9,
  responseTimeConstant: 0.18445288515649738,
  minRetrievability: 0.6656369260745123,
  maxRetrievability: 0.922449569918681,
  incorrectRetrievability: 0.1872634220169857,
  stabilitySmoothing: 0.42140473050530997,
  stabilityGrowthRate: 0.43911433578468856,
  minIntervalForCorrection: 2.119048347021453,
  maxStabilityChangePerReview: 15.974363404791802,
  lapseFactor: 0.9213599127717316,
  stabilityFloor: 17.859769777860492,
  stabilityMax: 36080.01780243241,
  coldStartItemReviews: 5,
  coldStartLearnerReviews: 16,
  defaultPriorStability: 5.398961414815858,
};

interface Aggregate {
  policy: SchedulerPolicy;
  condition: GenerativeCondition;
  results: DayLoopResult[];
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function runAll(): Aggregate[] {
  const policies: SchedulerPolicy[] = [
    'adaptive',
    'adaptive-default-prior',
    'sm2-only',
  ];
  const conditions: GenerativeCondition[] = ['matched', 'mismatched'];

  const aggregates: Aggregate[] = [];
  for (const condition of conditions) {
    for (const policy of policies) {
      aggregates.push({ policy, condition, results: [] });
    }
  }

  // One rng stream per (learner, item, condition), recreated from the same
  // seed for each policy, so both policies are evaluated against exactly the
  // same synthetic learners, items, and outcome draws - otherwise a
  // difference could just be sampling noise rather than a scheduling-policy
  // effect. All of one learner's items are simulated together, sharing one
  // scheduler-side learner state (response-time statistics and the learner
  // prior), as in the deployed application (3.7.3, 3.7.6).
  for (let l = 0; l < LEARNERS; l++) {
    for (const condition of conditions) {
      const learnerSeed = SEED + l * 7919 + (condition === 'matched' ? 0 : 1);
      const learnerRng = createRng(learnerSeed);
      const learner = createSyntheticLearner(
        `learner-${l}`,
        condition,
        learnerRng,
      );

      const itemSpecs = Array.from({ length: ITEMS_PER_LEARNER }, (_, i) => {
        const itemSeed = learnerSeed + i * 104729;
        const itemRng = createRng(itemSeed);
        const initialItem = createSyntheticItemState(
          learner,
          `card-${i}`,
          itemRng,
        );
        return { initialItem, itemSeed };
      });

      for (const policy of policies) {
        const { results } = simulateLearnerDayLoop({
          learner,
          items: itemSpecs.map(({ initialItem, itemSeed }) => ({
            initialItem,
            rng: createRng(itemSeed), // identical stream per item across policies
          })),
          policy,
          engineConfig,
          dayLoopConfig: DEFAULT_DAY_LOOP_CONFIG,
        });
        const aggregate = aggregates.find(
          (a) => a.policy === policy && a.condition === condition,
        )!;
        aggregate.results.push(...results);
      }
    }
  }

  return aggregates;
}

function report(aggregates: Aggregate[]): void {
  console.log(
    `\nSimulation: ${LEARNERS} learners x ${ITEMS_PER_LEARNER} items, ` +
      `${DEFAULT_DAY_LOOP_CONFIG.studyPeriodDays}-day study period, ` +
      `+${DEFAULT_DAY_LOOP_CONFIG.testPointGapDays}-day retention gap, seed ${SEED}\n`,
  );

  console.log(
    'condition'.padEnd(12) +
      'policy'.padEnd(24) +
      'reviews/item'.padEnd(16) +
      'retention'.padEnd(12) +
      'converged %'.padEnd(14) +
      'median conv. review'.padEnd(22) +
      'transitions w/ prior %',
  );

  for (const { policy, condition, results } of aggregates) {
    const reviewCounts = results.map((r) => r.reviewCount);
    const retentionRate = mean(
      results.map((r) => (r.retentionCorrect ? 1 : 0)),
    );

    const convergedResults = results.filter(
      (r) => r.convergedAtReview !== null,
    );
    const convergedPct = (convergedResults.length / results.length) * 100;
    const medianConvergedReview =
      convergedResults.length > 0
        ? median(convergedResults.map((r) => r.convergedAtReview as number))
        : NaN;

    // Of the items that left the SM-2 fallback, how many found a learner
    // prior already formed by the learner's other items (3.7.6) rather than
    // falling back on the global default.
    const transitioned = results.filter(
      (r) => r.transitionUsedLearnerPrior !== null,
    );
    const priorPct =
      transitioned.length > 0
        ? (
            (transitioned.filter((r) => r.transitionUsedLearnerPrior).length /
              transitioned.length) *
            100
          ).toFixed(1)
        : 'n/a';

    console.log(
      condition.padEnd(12) +
        policy.padEnd(24) +
        mean(reviewCounts).toFixed(1).padEnd(16) +
        retentionRate.toFixed(3).padEnd(12) +
        convergedPct.toFixed(1).padEnd(14) +
        (Number.isNaN(medianConvergedReview)
          ? 'n/a'
          : medianConvergedReview.toFixed(1)
        ).padEnd(22) +
        priorPct,
    );
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

const aggregates = runAll();
report(aggregates);
