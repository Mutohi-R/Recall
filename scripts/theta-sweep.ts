/**
 * Task 7 (Week 2): theta sweep, per 3.9.1's instruction that "Design
 * parameters such as theta will be evaluated separately across their
 * specified ranges rather than treated as fitted quantities" - this is why
 * theta is the one row of 3.7.7's table excluded from parameter-fitting.ts's
 * search (see FIXED_ENGINE_PARAMS there). 3.7.2 confirms the reason: theta
 * "can also be varied to examine how retention and review count respond to
 * different levels."
 *
 * No section of the thesis gives numeric levels for theta - only the Anki
 * citation in 3.7.2 (0.9 is the deployed default; above 0.9 workload
 * "increases very quickly," "overwhelming about 0.97"). THETA_LEVELS below is
 * therefore a simulation-harness choice, the same way 3.9.1 treats the
 * convergence tolerance/consecutive-count/max-reviews as harness choices
 * "reported with the results" rather than thesis-specified numbers.
 *
 * For each level, all 13 other free parameters are refit from scratch: their
 * valid ranges and the monotonicity condition both depend on theta (3.7.7's
 * 0 < R_min < theta < R_max < 1 bound, and the ln(theta) term in M(Rhat)), so
 * the theta=0.9 config from fit-parameters.ts is not reused here. Each
 * selected config is then evaluated at that same theta on an evaluation set
 * independent from the fitting set, exactly as fit-parameters.ts and
 * run-simulation.ts already keep those two sets separate (3.9.1).
 *
 * Two things surfaced while building this that changed it from a first draft
 * that just reused fit-parameters.ts's rule unmodified:
 *
 * - fit-parameters.ts's rule (cheapest config among those with mean retention
 *   >= 0.75) was tuned around theta=0.9. Applied across a sweep, low theta
 *   levels can have NO candidate ever clear a fixed 0.75 floor, and this is a
 *   real structural fact, not noise: at theta=0.70, a 5000-candidate search
 *   found a best of 0.733 retention - the scheduler intentionally reviews
 *   only once true retrievability has decayed to theta, so a fixed floor set
 *   above the achievable ceiling at low theta will always come back empty
 *   there, which would blank out exactly the low-review-count end of the
 *   trade-off curve theta 3.7.2 wants shown. So this script reports BOTH: the
 *   floor-gated winner (same rule as fit-parameters.ts, may legitimately be
 *   "none" at some levels) and the best retention found unconditionally
 *   (no floor), so every level has trade-off data even when the floor isn't
 *   reachable. The unconditional table is not filtered or re-selected to
 *   avoid this - at high theta it can pick a config that reviews nearly
 *   every day (over 300 reviews/item across the 365-day study period) to
 *   push retention slightly higher, which is a real, correctly-computed
 *   result, not a bug: it is exactly the "retention can be raised
 *   arbitrarily by reviewing constantly" case 3.9.1 names as the reason
 *   retention and review count must be reported together. Rows past
 *   NEAR_DAILY_REVIEW_THRESHOLD are labelled in the output so the number
 *   isn't later read out of context as a realistic operating point.
 * - 300 valid candidates (fit-parameters.ts's target) was demonstrated to be
 *   too small a sample for either of those numbers to be stable: rerunning
 *   with a different candidate seed at 300 flipped which of theta=0.75/0.80
 *   "passed" the floor. VALID_CANDIDATES_TARGET is 2000 here instead.
 *
 * Usage: npx tsx scripts/theta-sweep.ts
 */
import { createRng } from '../lib/simulation/rng';
import {
  createSyntheticLearner,
  createSyntheticItemState,
} from '../lib/simulation/synthetic-learner';
import {
  simulateItemDayLoop,
  DEFAULT_DAY_LOOP_CONFIG,
  type DayLoopResult,
} from '../lib/simulation/day-loop';
import {
  sampleCandidate,
  isValidCandidate,
  DEFAULT_SEARCH_RANGES,
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

// Raised from fit-parameters.ts's 300 - see the file header. Measured at
// roughly 4 minutes total for all six theta levels (two eval-set runs per
// level on top of the fitting search itself).
const VALID_CANDIDATES_TARGET = 2000;
const MAX_SAMPLE_ATTEMPTS = 200000;
const RETENTION_FLOOR = 0.75;

// Purely a reporting label, not a selection constraint: over the 365-day
// study period, averaging more than this many reviews per item means
// reviewing more often than roughly once every 3.65 days on average, well
// past what a spaced-repetition schedule should ever need once stability has
// grown past the first few reviews. Rows past this are flagged so a number
// like "362 reviews/item" is never read out of context as a realistic
// operating point - see the file header on why this is annotated rather than
// filtered out or re-selected against.
const NEAR_DAILY_REVIEW_THRESHOLD = 100;

interface SweepItem {
  learner: ReturnType<typeof createSyntheticLearner>;
  initialItem: ReturnType<typeof createSyntheticItemState>;
  itemSeed: number;
}

// A fixed item set, built once per (fitting|evaluation) role and reused
// across every theta level and every candidate within a level, so
// differences reflect the config under test and not sampling noise in who
// got simulated. Always the 'matched' condition, as fit-parameters.ts uses
// for fitting - the point of the mismatched condition is to stress-test an
// already-fitted algorithm, not to influence the fit itself.
function buildItemSet(
  seed: number,
  learners: number,
  itemsPerLearner: number,
  prefix: string,
): SweepItem[] {
  const items: SweepItem[] = [];
  for (let l = 0; l < learners; l++) {
    const learnerSeed = seed + l * 7919;
    const learnerRng = createRng(learnerSeed);
    const learner = createSyntheticLearner(
      `${prefix}-learner-${l}`,
      'matched',
      learnerRng,
    );

    for (let i = 0; i < itemsPerLearner; i++) {
      const itemSeed = learnerSeed + i * 104729;
      const itemRng = createRng(itemSeed);
      const initialItem = createSyntheticItemState(
        learner,
        `${prefix}-card-${i}`,
        itemRng,
      );
      items.push({ learner, initialItem, itemSeed });
    }
  }
  return items;
}

interface CandidateStats {
  config: EngineConfig;
  meanRetention: number;
  meanReviews: number;
}

function evaluateOn(config: EngineConfig, items: SweepItem[]): CandidateStats {
  const results: DayLoopResult[] = items.map(
    ({ learner, initialItem, itemSeed }) => {
      const runRng = createRng(itemSeed); // same stream per item across every candidate/level
      return simulateItemDayLoop({
        learner,
        initialItem,
        policy: 'adaptive',
        engineConfig: config,
        dayLoopConfig: DEFAULT_DAY_LOOP_CONFIG,
        rng: runRng,
      });
    },
  );

  const meanRetention =
    results.reduce((sum, r) => sum + (r.retentionCorrect ? 1 : 0), 0) /
    results.length;
  const meanReviews =
    results.reduce((sum, r) => sum + r.reviewCount, 0) / results.length;

  return { config, meanRetention, meanReviews };
}

interface LevelResult {
  theta: number;
  sampledCount: number;
  validCount: number;
  // Same rule as fit-parameters.ts: cheapest (fewest reviews) among
  // candidates with mean retention >= RETENTION_FLOOR. Null when no valid
  // candidate at this theta clears the floor - a real possible outcome, not
  // an error (see file header).
  floorWinner: CandidateStats | null;
  floorEval: CandidateStats | null;
  // Unconditional: whichever valid candidate had the highest mean retention
  // on the fitting set, regardless of the floor. Always present as long as
  // at least one valid candidate was found.
  bestRetention: CandidateStats | null;
  bestRetentionEval: CandidateStats | null;
}

function fitAtTheta(
  theta: number,
  fittingSet: SweepItem[],
): {
  floorWinner: CandidateStats | null;
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
  let floorWinner: CandidateStats | null = null;
  let bestRetention: CandidateStats | null = null;

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

    if (stats.meanRetention >= RETENTION_FLOOR) {
      if (!floorWinner || stats.meanReviews < floorWinner.meanReviews)
        floorWinner = stats;
    }
    if (!bestRetention || stats.meanRetention > bestRetention.meanRetention)
      bestRetention = stats;
  }

  return { floorWinner, bestRetention, validCount, sampledCount };
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
    const { floorWinner, bestRetention, validCount, sampledCount } = fitAtTheta(
      theta,
      fittingSet,
    );
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
    evalStats.meanReviews.toFixed(1);
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
    'eval reviews';

  console.log(
    `Floor-gated selection (mean retention >= ${RETENTION_FLOOR}, cheapest reviews) - same rule as fit-parameters.ts:`,
  );
  console.log(header);
  for (const {
    theta,
    sampledCount,
    validCount,
    floorWinner,
    floorEval,
  } of levels) {
    console.log(
      formatRow(theta, `${validCount}/${sampledCount}`, floorWinner, floorEval),
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
