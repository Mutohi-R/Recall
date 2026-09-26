// Parameter search for the free constants in EngineConfig, per thesis 3.7.7
// (hard constraints on any candidate) and 3.9.1 (which parameters are fixed
// vs. fitted, and how). Per 3.9.1: "Design parameters such as theta will be
// evaluated separately across their specified ranges rather than treated as
// fitted quantities" - theta is the only parameter excluded from this search.
// Every other row of 3.7.7's table - including stabilityFloor, stabilityMax,
// coldStartItemReviews and coldStartLearnerReviews, which an earlier version
// of this file wrongly fixed in advance - is meant to be selected by this
// same fitting procedure. It does not name a selection objective among valid
// candidates - that's supplied by the caller (fit-parameters.ts).

import type { EngineConfig } from '../scheduling/types';
import type { Rng } from './rng';

// theta is a design choice, not a fitted quantity (3.9.1): "Design parameters
// such as theta will be evaluated separately across their specified ranges
// rather than treated as fitted quantities." Fixed here at the value used in
// the deployed application (3.7.2). A separate sweep across theta values,
// re-running this same search at each one, is a further step - not part of
// this search.
export const FIXED_ENGINE_PARAMS = {
  targetRetrievability: 0.9,
} as const;

export interface SearchRanges {
  responseTimeConstant: [number, number];
  minRetrievability: [number, number];
  maxRetrievability: [number, number];
  incorrectRetrievability: [number, number];
  stabilitySmoothing: [number, number];
  stabilityGrowthRate: [number, number];
  minIntervalForCorrection: [number, number];
  maxStabilityChangePerReview: [number, number];
  lapseFactor: [number, number];
  stabilityFloor: [number, number];
  stabilityMax: [number, number];
  coldStartItemReviews: [number, number]; // integer, inclusive
  coldStartLearnerReviews: [number, number]; // integer, inclusive
  defaultPriorStability: [number, number];
}

export const DEFAULT_SEARCH_RANGES: SearchRanges = {
  responseTimeConstant: [0.02, 0.2],
  minRetrievability: [0.5, 0.85],
  maxRetrievability: [0.92, 0.99],
  incorrectRetrievability: [0.05, 0.5],
  stabilitySmoothing: [0.05, 0.9],
  // Widened from an original [0.01, 0.3]: the first full search run kept
  // placing its best candidates within a few percent of that ceiling
  // (0.28-0.29), meaning the range itself - not the monotonicity
  // constraint - was the binding limit. k's real ceiling still comes from
  // 3.7.7's monotonicity condition (which depends on alpha and the R
  // bounds), so widening the range just lets the search find where that
  // numerically-checked limit actually falls instead of guessing it in
  // advance.
  stabilityGrowthRate: [0.01, 0.6],
  // Below ~1 day, a lapse near the floor is followed by a forced next-day
  // review at very low true retrievability (a "floor spiral" - see the
  // fitting notes); above ~20 the floor would swallow the adaptive signal
  // for most items. Widened slightly from [1, 15] alongside the other two
  // changes here, since the first run's best candidates sat close to 15.
  stabilityFloor: [1, 20],
  // Keeps the Anki-cited 100-year figure (3.7.4) as an upper ceiling, while
  // letting the search pick a lower cap if that does better.
  stabilityMax: [365, 36500],
  minIntervalForCorrection: [0.1, 3],
  maxStabilityChangePerReview: [1, 50],
  // Widened from [0.2, 0.8]: the first run's best candidates sat at
  // 0.77-0.79, against the same ceiling-effect as stabilityGrowthRate above.
  // Kept strictly below 1 per 3.7.7 (lambda in (0,1)).
  lapseFactor: [0.2, 0.95],
  coldStartItemReviews: [2, 8],
  coldStartLearnerReviews: [3, 30],
  defaultPriorStability: [1, 10],
};

function uniform(rng: Rng, [min, max]: [number, number]): number {
  return min + rng.next() * (max - min);
}

// Inclusive integer draw, for the two parameters 3.7.7 requires to be
// positive integers (n_item, n_rt).
function uniformInt(rng: Rng, [min, max]: [number, number]): number {
  return Math.min(max, Math.floor(uniform(rng, [min, max + 1])));
}

export function sampleCandidate(
  rng: Rng,
  ranges: SearchRanges = DEFAULT_SEARCH_RANGES,
  targetRetrievability: number = FIXED_ENGINE_PARAMS.targetRetrievability,
): EngineConfig {
  return {
    targetRetrievability,
    responseTimeConstant: uniform(rng, ranges.responseTimeConstant),
    minRetrievability: uniform(rng, ranges.minRetrievability),
    maxRetrievability: uniform(rng, ranges.maxRetrievability),
    incorrectRetrievability: uniform(rng, ranges.incorrectRetrievability),
    stabilitySmoothing: uniform(rng, ranges.stabilitySmoothing),
    stabilityGrowthRate: uniform(rng, ranges.stabilityGrowthRate),
    minIntervalForCorrection: uniform(rng, ranges.minIntervalForCorrection),
    maxStabilityChangePerReview: uniform(
      rng,
      ranges.maxStabilityChangePerReview,
    ),
    lapseFactor: uniform(rng, ranges.lapseFactor),
    stabilityFloor: uniform(rng, ranges.stabilityFloor),
    stabilityMax: uniform(rng, ranges.stabilityMax),
    coldStartItemReviews: uniformInt(rng, ranges.coldStartItemReviews),
    coldStartLearnerReviews: uniformInt(rng, ranges.coldStartLearnerReviews),
    defaultPriorStability: uniform(rng, ranges.defaultPriorStability),
  };
}

// 3.7.7's bounds constraints (everything except monotonicity, checked separately below).
export function satisfiesBoundsConstraints(config: EngineConfig): boolean {
  const {
    minRetrievability,
    maxRetrievability,
    targetRetrievability,
    incorrectRetrievability,
    stabilitySmoothing,
    lapseFactor,
    stabilityGrowthRate,
    stabilityFloor,
    stabilityMax,
  } = config;

  if (!(minRetrievability > 0 && minRetrievability < targetRetrievability))
    return false;
  if (!(maxRetrievability < 1 && maxRetrievability > targetRetrievability))
    return false;
  if (!(incorrectRetrievability < minRetrievability)) return false;
  if (!(stabilitySmoothing > 0 && stabilitySmoothing <= 1)) return false;
  if (!(lapseFactor > 0 && lapseFactor < 1)) return false;
  if (!(stabilityGrowthRate > 0)) return false;
  if (!(stabilityFloor > 0)) return false;
  if (!(stabilityMax > stabilityFloor)) return false;
  if (!(config.defaultPriorStability > 0)) return false;
  if (
    !(
      Number.isInteger(config.coldStartItemReviews) &&
      config.coldStartItemReviews >= 2
    )
  )
    return false;
  if (
    !(
      Number.isInteger(config.coldStartLearnerReviews) &&
      config.coldStartLearnerReviews >= 1
    )
  )
    return false;
  return true;
}

// 3.7.4/3.7.7's monotonicity condition, in the thesis's own words: "holding
// the elapsed interval fixed, a faster correct response results in a longer
// next interval than a slower one." 3.7.7 gives this as a closed-form
// multiplier on stability, obtained by substituting the *scheduled* elapsed
// interval (elapsedDays = -stability * ln(theta), i.e. a review landing
// exactly on time) into the correction step. That substitution cancels
// stability out of the formula entirely and leaves the
// maxStabilityChangePerReview clamp out of the picture too - the clamp is a
// separate constraint (how much a single review can move stability) that
// this condition simply doesn't involve:
//
//   M(rHat) = [(1 - alpha) + alpha * ln(theta) / ln(rHat)] * (1 + k * (1 - rHat))
//
// The condition is that M is non-decreasing as rHat increases across the
// allowed range [minRetrievability, maxRetrievability]. It depends only on
// targetRetrievability, stabilitySmoothing (alpha), stabilityGrowthRate (k)
// and the R bounds - not on stability, elapsed time, or the clamp - which is
// why 3.7.7 says the limit "cannot be expressed as a fixed threshold" on k
// alone but must be checked numerically per candidate.
const R_HAT_SAMPLES = 200;

export function computeMonotonicityMultiplier(
  rHat: number,
  config: Pick<
    EngineConfig,
    'targetRetrievability' | 'stabilitySmoothing' | 'stabilityGrowthRate'
  >,
): number {
  const correction =
    1 -
    config.stabilitySmoothing +
    config.stabilitySmoothing *
      (Math.log(config.targetRetrievability) / Math.log(rHat));
  const growth = 1 + config.stabilityGrowthRate * (1 - rHat);
  return correction * growth;
}

export function satisfiesMonotonicity(config: EngineConfig): boolean {
  const { minRetrievability, maxRetrievability } = config;

  let previousM = -Infinity;
  for (let i = 0; i < R_HAT_SAMPLES; i++) {
    const rHat =
      minRetrievability +
      ((maxRetrievability - minRetrievability) * i) / (R_HAT_SAMPLES - 1);
    const m = computeMonotonicityMultiplier(rHat, config);
    if (m < previousM - 1e-9) return false; // a decrease - violates monotonicity
    previousM = m;
  }
  return true;
}

export function isValidCandidate(config: EngineConfig): boolean {
  return satisfiesBoundsConstraints(config) && satisfiesMonotonicity(config);
}
