/**
 * Task 6 (Week 2): random-search parameter fitting for the free constants in
 * EngineConfig, per thesis 3.7.7 (hard validity constraints on any candidate)
 * and 3.9.1 (parameters must be selected on a fitting set of synthetic
 * learners distinct from the set used for the final SM2 comparison).
 *
 * Fitting is done under the 'matched' condition only (the algorithm's own
 * assumed forgetting shape) - the point of the mismatched condition is to
 * test the fitted algorithm somewhere it was never tuned for, so it must not
 * influence the fit.
 *
 * Selection rule (chosen from the presented options): among candidates whose
 * mean retention (at the held-out test point) is >= RETENTION_FLOOR, pick the
 * one with the lowest mean reviews per item.
 *
 * RETENTION_FLOOR was originally set at 0.85, before it was known what this
 * simulation setup (365-day study period, 30-day held-out gap, this
 * synthetic-learner population) could actually deliver. Two rounds of
 * evidence showed 0.85 wasn't reachable under defensible parameter ranges:
 *   - With stabilityGrowthRate in [0.01, 0.3] and lapseFactor in [0.2, 0.8],
 *     the best of 300 valid candidates reached 0.400 retention (mean 0.076).
 *   - Widening to [0.01, 0.6] and [0.2, 0.95] raised the best to 0.800 (mean
 *     0.258) - but the top candidates again sat within a few percent of the
 *     new range edges, the same signal as before.
 * A third widening would have to push lapseFactor toward ~0.98 (a lapse that
 * barely reduces stability at all) specifically to manufacture 0.85, which
 * would no longer describe a plausible lapse per 3.7.5 ("evidence that the
 * stored stability was higher than the learner's actual memory strength
 * justified") - at that point the ranges are being fit to the target rather
 * than the target being evaluated against defensible ranges. RETENTION_FLOOR
 * is set to 0.75 instead: comfortably inside the 0.80 ceiling found above (so
 * the winner isn't just whichever candidate happened to be the single best of
 * 300), using the same [0.01, 0.6] / [0.2, 0.95] ranges as that ceiling run.
 *
 * Usage: npx tsx scripts/fit-parameters.ts
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

// Distinct seed range from run-simulation.ts's evaluation set (SEED =
// 20260201), so the winning parameters aren't selected on the same synthetic
// learners they're later judged against.
const FITTING_SEED = 20260301;
const CANDIDATE_SEED = 20260401;

const FITTING_LEARNERS = 15;
const FITTING_ITEMS_PER_LEARNER = 10;
const VALID_CANDIDATES_TARGET = 300;
const MAX_SAMPLE_ATTEMPTS = 20000; // safety cap in case the validity rate is very low

const RETENTION_FLOOR = 0.75;

interface FittingItem {
  learner: ReturnType<typeof createSyntheticLearner>;
  initialItem: ReturnType<typeof createSyntheticItemState>;
  itemSeed: number;
}

// A fixed fitting set, built once and reused (with the same rng seed per
// item) across every candidate, so differences between candidates reflect
// the candidate's EngineConfig and not sampling noise in who/what got
// simulated.
function buildFittingSet(): FittingItem[] {
  const items: FittingItem[] = [];
  for (let l = 0; l < FITTING_LEARNERS; l++) {
    const learnerSeed = FITTING_SEED + l * 7919;
    const learnerRng = createRng(learnerSeed);
    const learner = createSyntheticLearner(
      `fit-learner-${l}`,
      'matched',
      learnerRng,
    );

    for (let i = 0; i < FITTING_ITEMS_PER_LEARNER; i++) {
      const itemSeed = learnerSeed + i * 104729;
      const itemRng = createRng(itemSeed);
      const initialItem = createSyntheticItemState(
        learner,
        `fit-card-${i}`,
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

function evaluateCandidate(
  config: EngineConfig,
  fittingSet: FittingItem[],
): CandidateStats {
  const results: DayLoopResult[] = fittingSet.map(
    ({ learner, initialItem, itemSeed }) => {
      const runRng = createRng(itemSeed); // same stream per item across every candidate
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

interface FitResult {
  winner: CandidateStats | null;
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

  const survivors = allStats.filter((s) => s.meanRetention >= RETENTION_FLOOR);
  const winner =
    survivors.length > 0
      ? survivors.reduce((best, s) =>
          s.meanReviews < best.meanReviews ? s : best,
        )
      : null;

  return { winner, validCount, sampledCount, allStats };
}

function report(result: FitResult): void {
  const { winner, validCount, sampledCount, allStats } = result;

  console.log(
    `\nParameter fitting: ${FITTING_LEARNERS} learners x ${FITTING_ITEMS_PER_LEARNER} items ` +
      `(matched condition only), fitting seed ${FITTING_SEED}, candidate seed ${CANDIDATE_SEED}\n`,
  );
  console.log(
    `Sampled ${sampledCount} candidates; ${validCount} passed 3.7.7's validity constraints.`,
  );

  const meetingFloor = allStats.filter(
    (s) => s.meanRetention >= RETENTION_FLOOR,
  ).length;
  console.log(
    `${meetingFloor}/${validCount} valid candidates met the retention floor (${RETENTION_FLOOR}).\n`,
  );

  if (!winner) {
    console.log(
      'No valid candidate met the retention floor. Consider widening DEFAULT_SEARCH_RANGES, ' +
        'raising VALID_CANDIDATES_TARGET, or reconsidering the retention floor.',
    );
    return;
  }

  console.log(
    `Winning config: mean retention ${winner.meanRetention.toFixed(3)}, ` +
      `mean reviews/item ${winner.meanReviews.toFixed(1)}\n`,
  );
  console.log(JSON.stringify(winner.config, null, 2));
}

report(fit());
