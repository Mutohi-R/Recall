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
  simulateItemDayLoop,
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
// defensible parameter ranges). This fitted run reached mean retention
// 0.767 at 57.5 reviews/item on the fitting set itself.
const engineConfig: EngineConfig = {
  targetRetrievability: 0.9,
  responseTimeConstant: 0.129713098583743,
  minRetrievability: 0.5604161683353596,
  maxRetrievability: 0.9834710553055629,
  incorrectRetrievability: 0.20307390495436267,
  stabilitySmoothing: 0.5617471293080598,
  stabilityGrowthRate: 0.5079927656729705,
  minIntervalForCorrection: 2.3586574717657642,
  maxStabilityChangePerReview: 30.099107412155718,
  lapseFactor: 0.9230757016222924,
  stabilityFloor: 16.996259023901075,
  stabilityMax: 5571.329655721784,
  coldStartItemReviews: 5,
  coldStartLearnerReviews: 21,
  defaultPriorStability: 9.634129844838753,
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
  const policies: SchedulerPolicy[] = ['adaptive', 'sm2-only'];
  const conditions: GenerativeCondition[] = ['matched', 'mismatched'];

  const aggregates: Aggregate[] = [];
  for (const condition of conditions) {
    for (const policy of policies) {
      aggregates.push({ policy, condition, results: [] });
    }
  }

  // One shared rng stream per (learner, item, condition), reused across the
  // two policies so both are evaluated against exactly the same synthetic
  // learners, items, and outcome draws - otherwise a difference could just
  // be sampling noise rather than a scheduling-policy effect.
  for (let l = 0; l < LEARNERS; l++) {
    for (const condition of conditions) {
      const learnerSeed = SEED + l * 7919 + (condition === 'matched' ? 0 : 1);
      const learnerRng = createRng(learnerSeed);
      const learner = createSyntheticLearner(
        `learner-${l}`,
        condition,
        learnerRng,
      );

      for (let i = 0; i < ITEMS_PER_LEARNER; i++) {
        const itemSeed = learnerSeed + i * 104729;
        const itemRng = createRng(itemSeed);
        const initialItem = createSyntheticItemState(
          learner,
          `card-${i}`,
          itemRng,
        );

        for (const policy of policies) {
          const runRng = createRng(itemSeed); // identical stream per (learner, item, condition) across policies
          const result = simulateItemDayLoop({
            learner,
            initialItem,
            policy,
            engineConfig,
            dayLoopConfig: DEFAULT_DAY_LOOP_CONFIG,
            rng: runRng,
          });
          const aggregate = aggregates.find(
            (a) => a.policy === policy && a.condition === condition,
          )!;
          aggregate.results.push(result);
        }
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
      'policy'.padEnd(12) +
      'reviews/item'.padEnd(16) +
      'retention'.padEnd(12) +
      'converged %'.padEnd(14) +
      'median conv. review',
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

    console.log(
      condition.padEnd(12) +
        policy.padEnd(12) +
        mean(reviewCounts).toFixed(1).padEnd(16) +
        retentionRate.toFixed(3).padEnd(12) +
        convergedPct.toFixed(1).padEnd(14) +
        (Number.isNaN(medianConvergedReview)
          ? 'n/a'
          : medianConvergedReview.toFixed(1)),
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
