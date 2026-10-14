/**
 * Runs the day-by-day loop across the evaluation set of synthetic learners,
 * for three policies (the adaptive algorithm; the same algorithm with the
 * learner prior switched off, which tests the 3.7.6 claim; and SM-2 alone)
 * under both generative conditions (matched and mismatched), and reports the
 * retention, review-count and convergence measures thesis 3.9.1 asks for.
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

// Fitted by scripts/fit-parameters.ts on a fitting set generated from a
// seed range distinct from this script's own SEED, under the 'matched'
// condition only, per 3.9.1's fit/evaluate separation requirement. The
// synthetic world (memory-model.ts, generate-review.ts) does not depend on
// this configuration. Every one of the 2,000 valid candidates met the 0.75
// retention floor, none met the 90% convergence floor (best 46.7%), so the
// winner was chosen by the pre-set fallback: highest convergence among
// candidates meeting the retention floor. On the fitting set it reached
// retention 0.907 at 10.4 reviews/item, with 46.7% of items converging.
const engineConfig: EngineConfig = {
  targetRetrievability: 0.9,
  responseTimeConstant: 0.1344033803418279,
  minRetrievability: 0.8189361217082478,
  maxRetrievability: 0.9516600485960953,
  stabilitySmoothing: 0.5528757312917151,
  stabilityGrowthRate: 4.101142177383881,
  minIntervalForCorrection: 0.8719145046081394,
  maxStabilityChangePerReview: 3.915218826523051,
  lapseFactor: 0.4338994357851334,
  stabilityFloor: 19.268873857799917,
  stabilityMax: 6210.85663505597,
  coldStartItemReviews: 4,
  coldStartLearnerReviews: 24,
  defaultPriorStability: 78.94485344178975,
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
      'unresolved %'.padEnd(15) +
      'true R at adaptive reviews (mean / in band %)'.padEnd(48) +
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

    // Items that neither converged nor used up the maximum number of adaptive
    // reviews: the study period ended first, so the outcome is unknown rather
    // than a failure to converge.
    const unresolvedPct =
      (results.filter((r) => r.convergedAtReview === null && !r.didNotConverge)
        .length /
        results.length) *
      100;

    // How close the scheduler actually came to its target: the true recall
    // probability at every adaptive-path review.
    const adaptiveR = results.flatMap((r) =>
      r.trace
        .filter((e) => e.kind === 'review' && e.path === 'adaptive')
        .map((e) => e.trueRetrievability),
    );
    const band = DEFAULT_DAY_LOOP_CONFIG.convergenceToleranceBand;
    const theta = engineConfig.targetRetrievability;
    const rSummary =
      adaptiveR.length > 0
        ? `${mean(adaptiveR).toFixed(3)} / ${(
            (adaptiveR.filter((r) => Math.abs(r - theta) <= band).length /
              adaptiveR.length) *
            100
          ).toFixed(1)}%`
        : 'n/a';

    console.log(
      condition.padEnd(12) +
        policy.padEnd(24) +
        mean(reviewCounts).toFixed(1).padEnd(16) +
        retentionRate.toFixed(3).padEnd(12) +
        (policy === 'sm2-only' ? 'n/a' : convergedPct.toFixed(1)).padEnd(14) +
        (Number.isNaN(medianConvergedReview)
          ? 'n/a'
          : medianConvergedReview.toFixed(1)
        ).padEnd(22) +
        (policy === 'sm2-only' ? 'n/a' : unresolvedPct.toFixed(1)).padEnd(15) +
        rSummary.padEnd(48) +
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

// Paired differences between two policies, learner by learner. Both policies
// see the same learners, items and random draws, so the difference for each
// learner isolates the policy. Items within one learner are not independent
// (they share the learner's response-time statistics and prior), so the
// learner, not the item, is the unit: 50 paired differences per comparison,
// summarised as a mean with a 95% interval (mean +- 1.96 standard errors).
function perLearner(results: DayLoopResult[]): {
  reviews: number;
  retention: number;
}[] {
  const out = [];
  for (let start = 0; start < results.length; start += ITEMS_PER_LEARNER) {
    const chunk = results.slice(start, start + ITEMS_PER_LEARNER);
    out.push({
      reviews: mean(chunk.map((r) => r.reviewCount)),
      retention: mean(chunk.map((r) => (r.retentionCorrect ? 1 : 0))),
    });
  }
  return out;
}

function interval(diffs: number[]): string {
  const m = mean(diffs);
  const sd = Math.sqrt(
    diffs.reduce((sum, d) => sum + (d - m) ** 2, 0) / (diffs.length - 1),
  );
  const half = (1.96 * sd) / Math.sqrt(diffs.length);
  return `${m >= 0 ? '+' : ''}${m.toFixed(3)} +- ${half.toFixed(3)}`;
}

function reportPaired(aggregates: Aggregate[]): void {
  console.log(
    `\nPaired differences per learner (${LEARNERS} learners; mean +- 95% interval):`,
  );
  const comparisons: [SchedulerPolicy, SchedulerPolicy][] = [
    ['adaptive', 'sm2-only'],
    ['adaptive', 'adaptive-default-prior'],
  ];
  for (const condition of ['matched', 'mismatched'] as GenerativeCondition[]) {
    for (const [a, b] of comparisons) {
      const find = (policy: SchedulerPolicy) =>
        perLearner(
          aggregates.find(
            (x) => x.policy === policy && x.condition === condition,
          )!.results,
        );
      const pa = find(a);
      const pb = find(b);
      console.log(
        `${condition.padEnd(12)}${`${a} - ${b}`.padEnd(36)}` +
          `reviews/item ${interval(pa.map((x, i) => x.reviews - pb[i].reviews))}   ` +
          `retention ${interval(pa.map((x, i) => x.retention - pb[i].retention))}`,
      );
    }
  }
  console.log();
}

const aggregates = runAll();
report(aggregates);
reportPaired(aggregates);
