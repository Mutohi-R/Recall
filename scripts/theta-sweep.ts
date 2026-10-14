/**
 * Theta sweep, per 3.9.1's instruction that "Design parameters such as theta
 * will be evaluated separately across their specified ranges rather than
 * treated as fitted quantities" (and 3.7.2: theta "can also be varied to
 * examine how retention and review count respond to different levels").
 *
 * No section of the thesis gives numeric levels for theta - only the Anki
 * citation in 3.7.2 (0.9 is the deployed default; above 0.9 workload
 * "increases very quickly," "overwhelming about 0.97"). THETA_LEVELS is
 * therefore a harness choice, reported with the results.
 *
 * For each level, all the other free parameters are refit from scratch with
 * the same search and the same selection rule as fit-parameters.ts
 * (selectCandidate in parameter-fitting.ts): their valid ranges and the
 * monotonicity condition both depend on theta (3.7.7). Each selected config
 * is then evaluated at that theta on an evaluation set independent of the
 * fitting set (3.9.1).
 *
 * The synthetic learners are the same at every level: their memory and their
 * response times do not depend on theta or on any candidate's parameters
 * (memory-model.ts, generate-review.ts). In particular, a typical response
 * speed always corresponds to a true recall probability of 0.9, so at levels
 * other than 0.9 the anchoring assumption of 3.7.3 holds only approximately,
 * which is part of what the sweep shows.
 *
 * Besides the selected configuration, the sweep reports the highest-retention
 * candidate found at each level, regardless of cost. That table can pick a
 * configuration that reviews very often to push retention up; rows past
 * NEAR_DAILY_REVIEW_THRESHOLD are flagged rather than excluded, since that is
 * exactly the "retention can be raised arbitrarily by reviewing constantly"
 * case 3.9.1 gives as the reason retention and review count are reported
 * together.
 *
 * Usage: npx tsx scripts/theta-sweep.ts
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
import type { EngineConfig } from '../lib/scheduling/types';

const THETA_LEVELS = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95];

// Same seeds and set sizes as fit-parameters.ts (fitting) and
// run-simulation.ts (evaluation), reused unchanged at every theta level, so
// a difference across levels reflects theta rather than a different sample
// of synthetic learners.
const FITTING_SEED = 20260301;
const CANDIDATE_SEED = 20260401;
const EVAL_SEED = 20260201;

const FITTING_LEARNERS = 15;
const FITTING_ITEMS_PER_LEARNER = 10;
const EVAL_LEARNERS = 50;
const EVAL_ITEMS_PER_LEARNER = 20;

// Same as fit-parameters.ts, so the theta = 0.90 row reproduces its winner.
const VALID_CANDIDATES_TARGET = 2000;
const MAX_SAMPLE_ATTEMPTS = 200000;

// Purely a reporting label, not a selection constraint: over the 365-day
// study period, averaging more than this many reviews per item means
// reviewing more often than roughly once every 3.65 days on average, well
// past what a spaced-repetition schedule should ever need once stability has
// grown past the first few reviews. Rows past this are flagged so a number
// like "362 reviews/item" is never read out of context as a realistic
// operating point - see the file header on why this is annotated rather than
// filtered out or re-selected against.
const NEAR_DAILY_REVIEW_THRESHOLD = 100;

interface SweepLearner {
  learner: ReturnType<typeof createSyntheticLearner>;
  items: {
    initialItem: ReturnType<typeof createSyntheticItemState>;
    itemSeed: number;
  }[];
}

// A fixed learner set, built once per (fitting|evaluation) role and reused
// across every theta level and every candidate within a level, so
// differences reflect the config under test and not sampling noise in who
// got simulated. Always the 'matched' condition, as fit-parameters.ts uses
// for fitting - the point of the mismatched condition is to stress-test an
// already-fitted algorithm, not to influence the fit itself. A learner's
// items are kept together because they are simulated together, sharing one
// scheduler-side learner state (3.7.3, 3.7.6).
function buildItemSet(
  seed: number,
  learners: number,
  itemsPerLearner: number,
  prefix: string,
): SweepLearner[] {
  const set: SweepLearner[] = [];
  for (let l = 0; l < learners; l++) {
    const learnerSeed = seed + l * 7919;
    const learnerRng = createRng(learnerSeed);
    const learner = createSyntheticLearner(
      `${prefix}-learner-${l}`,
      'matched',
      learnerRng,
    );

    const items = [];
    for (let i = 0; i < itemsPerLearner; i++) {
      const itemSeed = learnerSeed + i * 104729;
      const itemRng = createRng(itemSeed);
      const initialItem = createSyntheticItemState(
        learner,
        `${prefix}-card-${i}`,
        itemRng,
      );
      items.push({ initialItem, itemSeed });
    }
    set.push({ learner, items });
  }
  return set;
}

function evaluateOn(
  config: EngineConfig,
  learners: SweepLearner[],
): CandidateStats {
  const results: DayLoopResult[] = learners.flatMap(
    ({ learner, items }) =>
      simulateLearnerDayLoop({
        learner,
        items: items.map(({ initialItem, itemSeed }) => ({
          initialItem,
          rng: createRng(itemSeed), // same stream per item across every candidate/level
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

interface LevelResult {
  theta: number;
  sampledCount: number;
  validCount: number;
  // Same rule as fit-parameters.ts (selectCandidate). Null when no valid
  // candidate at this theta meets the retention floor.
  floorWinner: CandidateStats | null;
  rule: SelectionRule;
  floorEval: CandidateStats | null;
  // Unconditional: whichever valid candidate had the highest mean retention
  // on the fitting set, regardless of the floor. Always present as long as
  // at least one valid candidate was found.
  bestRetention: CandidateStats | null;
  bestRetentionEval: CandidateStats | null;
}

function fitAtTheta(
  theta: number,
  fittingSet: SweepLearner[],
): {
  floorWinner: CandidateStats | null;
  rule: SelectionRule;
  bestRetention: CandidateStats | null;
  validCount: number;
  sampledCount: number;
} {
  // Same candidate seed at every level: this is not the same *sequence* of
  // candidates (sampleCandidate's draws depend on theta only through the
  // fixed targetRetrievability field, not through the rng stream), but reuses
  // the same underlying random draws for the other 13 parameters at each
  // level, for comparability.
  const candidateRng = createRng(CANDIDATE_SEED);
  let validCount = 0;
  let sampledCount = 0;
  let bestRetention: CandidateStats | null = null;
  const allStats: CandidateStats[] = [];

  while (
    validCount < VALID_CANDIDATES_TARGET &&
    sampledCount < MAX_SAMPLE_ATTEMPTS
  ) {
    sampledCount++;
    const candidate = sampleCandidate(
      candidateRng,
      DEFAULT_SEARCH_RANGES,
      theta,
    );
    if (!isValidCandidate(candidate)) continue;
    validCount++;

    const stats = evaluateOn(candidate, fittingSet);
    allStats.push(stats);
    if (!bestRetention || stats.meanRetention > bestRetention.meanRetention)
      bestRetention = stats;
  }

  const { winner: floorWinner, rule } = selectCandidate(allStats);
  return { floorWinner, rule, bestRetention, validCount, sampledCount };
}

function runSweep(): LevelResult[] {
  const fittingSet = buildItemSet(
    FITTING_SEED,
    FITTING_LEARNERS,
    FITTING_ITEMS_PER_LEARNER,
    'fit',
  );
  const evalSet = buildItemSet(
    EVAL_SEED,
    EVAL_LEARNERS,
    EVAL_ITEMS_PER_LEARNER,
    'eval',
  );

  return THETA_LEVELS.map((theta) => {
    const { floorWinner, rule, bestRetention, validCount, sampledCount } =
      fitAtTheta(theta, fittingSet);
    const floorEval = floorWinner
      ? evaluateOn(floorWinner.config, evalSet)
      : null;
    const bestRetentionEval = bestRetention
      ? evaluateOn(bestRetention.config, evalSet)
      : null;
    return {
      theta,
      sampledCount,
      validCount,
      floorWinner,
      rule,
      floorEval,
      bestRetention,
      bestRetentionEval,
    };
  });
}

function formatRow(
  theta: number,
  validStr: string,
  stats: CandidateStats | null,
  evalStats: CandidateStats | null,
): string {
  if (!stats || !evalStats) {
    return theta.toFixed(2).padEnd(8) + validStr.padEnd(16) + 'none';
  }
  const row =
    theta.toFixed(2).padEnd(8) +
    validStr.padEnd(16) +
    stats.meanRetention.toFixed(3).padEnd(16) +
    stats.meanReviews.toFixed(1).padEnd(14) +
    evalStats.meanRetention.toFixed(3).padEnd(16) +
    evalStats.meanReviews.toFixed(1).padEnd(14) +
    `${(stats.convergenceRate * 100).toFixed(0)}% / ${(evalStats.convergenceRate * 100).toFixed(0)}%`;
  const nearDaily =
    stats.meanReviews > NEAR_DAILY_REVIEW_THRESHOLD ||
    evalStats.meanReviews > NEAR_DAILY_REVIEW_THRESHOLD;
  return nearDaily
    ? `${row}   <- near-daily reviewing, not a realistic operating point`
    : row;
}

function report(levels: LevelResult[]): void {
  console.log(
    `\nTheta sweep: ${THETA_LEVELS.length} levels (${THETA_LEVELS.join(', ')}); ` +
      `${FITTING_LEARNERS}x${FITTING_ITEMS_PER_LEARNER} fitting set, ` +
      `${EVAL_LEARNERS}x${EVAL_ITEMS_PER_LEARNER} evaluation set (separate from fitting, per 3.9.1); ` +
      `${VALID_CANDIDATES_TARGET} valid candidates per level\n`,
  );

  const header =
    'theta'.padEnd(8) +
    'valid/sampled'.padEnd(16) +
    'fit retention'.padEnd(16) +
    'fit reviews'.padEnd(14) +
    'eval retention'.padEnd(16) +
    'eval reviews'.padEnd(14) +
    'converged fit/eval';

  console.log(
    `Selected configuration (same rule as fit-parameters.ts: retention >= ${RETENTION_FLOOR} and convergence >= ` +
      `${CONVERGENCE_FLOOR * 100}%, cheapest; '*' = fallback rule, highest convergence among retention-floor candidates):`,
  );
  console.log(header);
  for (const {
    theta,
    sampledCount,
    validCount,
    floorWinner,
    floorEval,
    rule,
  } of levels) {
    console.log(
      formatRow(
        theta,
        `${validCount}/${sampledCount}${rule === 'convergence-fallback' ? ' *' : ''}`,
        floorWinner,
        floorEval,
      ),
    );
  }

  console.log(
    `\nBest retention found (unconditional, no floor - rows above ${NEAR_DAILY_REVIEW_THRESHOLD} reviews/item are ` +
      'flagged rather than excluded; see the file header):',
  );
  console.log(header);
  for (const {
    theta,
    sampledCount,
    validCount,
    bestRetention,
    bestRetentionEval,
  } of levels) {
    console.log(
      formatRow(
        theta,
        `${validCount}/${sampledCount}`,
        bestRetention,
        bestRetentionEval,
      ),
    );
  }
  console.log();
}

report(runSweep());
