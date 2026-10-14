/**
 * Random-search parameter fitting for the free constants in EngineConfig, per
 * thesis 3.7.7 (hard validity constraints on any candidate) and 3.9.1
 * (parameters are selected on a fitting set of synthetic learners distinct
 * from the set used for the final SM-2 comparison).
 *
 * Fitting is done under the 'matched' condition only (the algorithm's own
 * assumed forgetting shape); the mismatched condition tests the fitted
 * algorithm somewhere it was never tuned for, so it must not influence the
 * fit.
 *
 * The synthetic learners' memory and response times are fixed properties of
 * the learners (lib/simulation/memory-model.ts, generate-review.ts) and do not
 * depend on the candidate being evaluated. The ranges, the world's settings
 * and the selection rule (selectCandidate in parameter-fitting.ts) were all
 * fixed before this world was first run.
 *
 * 2,000 valid candidates are evaluated, the same number and the same
 * candidate seed scripts/theta-sweep.ts uses at every theta level, so this
 * script's winner is, by construction, the theta = 0.90 row of that sweep.
 *
 * Usage: npx tsx scripts/fit-parameters.ts
 */
import { createRng } from '../lib/simulation/rng';
import {
  createSyntheticLearner,
  createSyntheticItemState,
} from '../lib/simulation/synthetic-learner';
import {
  simulateLearnerDayLoop,
  DEFAULT_DAY_LOOP_CONFIG,
  type DayLoopResult,
} from '../lib/simulation/day-loop';
import {
  sampleCandidate,
  isValidCandidate,
  selectCandidate,
  DEFAULT_SEARCH_RANGES,
  RETENTION_FLOOR,
  CONVERGENCE_FLOOR,
  type CandidateStats,
  type SelectionRule,
} from '../lib/simulation/parameter-fitting';
import { TRUE_RT_SENSITIVITY } from '../lib/simulation/generate-review';
import type { EngineConfig } from '../lib/scheduling/types';

// Distinct seed range from run-simulation.ts's evaluation set (SEED =
// 20260201), so the winning parameters aren't selected on the same synthetic
// learners they're later judged against.
const FITTING_SEED = 20260301;
const CANDIDATE_SEED = 20260401;

const FITTING_LEARNERS = 15;
const FITTING_ITEMS_PER_LEARNER = 10;
const VALID_CANDIDATES_TARGET = 2000;
const MAX_SAMPLE_ATTEMPTS = 200000; // safety cap in case the validity rate is very low

interface FittingLearner {
  learner: ReturnType<typeof createSyntheticLearner>;
  items: {
    initialItem: ReturnType<typeof createSyntheticItemState>;
    itemSeed: number;
  }[];
}

// A fixed fitting set, built once and reused (with the same rng seed per
// item) across every candidate, so differences between candidates reflect
// the candidate's EngineConfig and not sampling noise in who/what got
// simulated. Each learner's items are kept together because they are
// simulated together, sharing one scheduler-side learner state (3.7.3, 3.7.6).
function buildFittingSet(): FittingLearner[] {
  const learners: FittingLearner[] = [];
  for (let l = 0; l < FITTING_LEARNERS; l++) {
    const learnerSeed = FITTING_SEED + l * 7919;
    const learnerRng = createRng(learnerSeed);
    const learner = createSyntheticLearner(
      `fit-learner-${l}`,
      'matched',
      learnerRng,
    );

    const items = [];
    for (let i = 0; i < FITTING_ITEMS_PER_LEARNER; i++) {
      const itemSeed = learnerSeed + i * 104729;
      const itemRng = createRng(itemSeed);
      const initialItem = createSyntheticItemState(
        learner,
        `fit-card-${i}`,
        itemRng,
      );
      items.push({ initialItem, itemSeed });
    }
    learners.push({ learner, items });
  }
  return learners;
}

function evaluateCandidate(
  config: EngineConfig,
  fittingSet: FittingLearner[],
): CandidateStats {
  const results: DayLoopResult[] = fittingSet.flatMap(
    ({ learner, items }) =>
      simulateLearnerDayLoop({
        learner,
        items: items.map(({ initialItem, itemSeed }) => ({
          initialItem,
          rng: createRng(itemSeed), // same stream per item across every candidate
        })),
        policy: 'adaptive',
        engineConfig: config,
        dayLoopConfig: DEFAULT_DAY_LOOP_CONFIG,
      }).results,
  );

  const meanRetention =
    results.reduce((sum, r) => sum + (r.retentionCorrect ? 1 : 0), 0) /
    results.length;
  const meanReviews =
    results.reduce((sum, r) => sum + r.reviewCount, 0) / results.length;

  const convergenceRate =
    results.filter((r) => r.convergedAtReview !== null).length / results.length;

  return { config, meanRetention, meanReviews, convergenceRate };
}

interface FitResult {
  winner: CandidateStats | null;
  rule: SelectionRule;
  validCount: number;
  sampledCount: number;
  allStats: CandidateStats[];
}

function fit(): FitResult {
  const fittingSet = buildFittingSet();
  const candidateRng = createRng(CANDIDATE_SEED);

  const allStats: CandidateStats[] = [];
  let validCount = 0;
  let sampledCount = 0;

  while (
    validCount < VALID_CANDIDATES_TARGET &&
    sampledCount < MAX_SAMPLE_ATTEMPTS
  ) {
    sampledCount++;
    const candidate = sampleCandidate(candidateRng, DEFAULT_SEARCH_RANGES);
    if (!isValidCandidate(candidate)) continue;
    validCount++;
    allStats.push(evaluateCandidate(candidate, fittingSet));
  }

  const { winner, rule } = selectCandidate(allStats);
  return { winner, rule, validCount, sampledCount, allStats };
}

function report(result: FitResult): void {
  const { winner, rule, validCount, sampledCount, allStats } = result;

  console.log(
    `\nParameter fitting: ${FITTING_LEARNERS} learners x ${FITTING_ITEMS_PER_LEARNER} items ` +
      `(matched condition only), fitting seed ${FITTING_SEED}, candidate seed ${CANDIDATE_SEED}\n`,
  );
  console.log(
    `Sampled ${sampledCount} candidates; ${validCount} passed 3.7.7's validity constraints.`,
  );

  const meetingRetention = allStats.filter(
    (s) => s.meanRetention >= RETENTION_FLOOR,
  ).length;
  const meetingBoth = allStats.filter(
    (s) =>
      s.meanRetention >= RETENTION_FLOOR &&
      s.convergenceRate >= CONVERGENCE_FLOOR,
  ).length;
  console.log(
    `${meetingRetention}/${validCount} valid candidates met the retention floor (${RETENTION_FLOOR}); ` +
      `${meetingBoth} of those also met the convergence floor (${CONVERGENCE_FLOOR}).\n`,
  );

  const best = (key: 'meanRetention' | 'convergenceRate') =>
    Math.max(...allStats.map((s) => s[key]));
  console.log(
    `Best retention among valid candidates: ${best('meanRetention').toFixed(3)}; ` +
      `best convergence: ${(best('convergenceRate') * 100).toFixed(1)}%\n`,
  );

  if (!winner) {
    console.log('No valid candidate met the retention floor.');
    return;
  }

  console.log(
    rule === 'both-floors'
      ? 'Selected under the main rule (both floors met).'
      : 'No candidate met both floors: selected under the fallback rule ' +
          '(highest convergence among candidates meeting the retention floor).',
  );
  console.log(
    `Winning config: mean retention ${winner.meanRetention.toFixed(3)}, ` +
      `mean reviews/item ${winner.meanReviews.toFixed(1)}, ` +
      `converged ${(winner.convergenceRate * 100).toFixed(1)}%`,
  );
  console.log(
    `Fitted c = ${winner.config.responseTimeConstant.toFixed(4)} ` +
      `(the synthetic learners' true sensitivity is ${TRUE_RT_SENSITIVITY})\n`,
  );
  console.log(JSON.stringify(winner.config, null, 2));
}

report(fit());
