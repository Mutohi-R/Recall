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

// Fixed before the FSRS-based synthetic world (memory-model.ts) was first
// run, and not adjusted afterwards. Three ranges changed from the previous
// harness, each for a stated reason rather than in response to results:
//  - stabilityGrowthRate [0.01, 5]: the upper limit on k comes from 3.7.7's
//    monotonicity condition, checked per candidate, so the range only needs to
//    be wide enough not to bind before that condition does.
//  - maxStabilityChangePerReview [0.1, 5]: now a proportion of the current
//    stability (at most x6 or /6 in one review) rather than a number of days.
//  - defaultPriorStability [1, 100]: items in the synthetic world start with
//    an exponential stability of about 12-80 days (5th-95th percentile;
//    median about 36), so the old [1, 10] range could not reach it.
export const DEFAULT_SEARCH_RANGES: SearchRanges = {
  responseTimeConstant: [0.02, 0.2],
  minRetrievability: [0.5, 0.85],
  maxRetrievability: [0.92, 0.99],
  stabilitySmoothing: [0.05, 0.9],
  stabilityGrowthRate: [0.01, 5],
  // Below ~1 day a lapse near the floor is followed by a forced next-day
  // review; above ~20 the floor would swallow the adaptive signal for most
  // items.
  stabilityFloor: [1, 20],
  // Keeps the Anki-cited 100-year figure (3.7.4) as an upper ceiling, while
  // letting the search pick a lower cap if that does better.
  stabilityMax: [365, 36500],
  minIntervalForCorrection: [0.1, 3],
  maxStabilityChangePerReview: [0.1, 5],
  // Kept strictly below 1 per 3.7.7 (lambda in (0,1)).
  lapseFactor: [0.2, 0.95],
  coldStartItemReviews: [2, 8],
  coldStartLearnerReviews: [3, 30],
  defaultPriorStability: [1, 100],
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
  if (!(stabilitySmoothing > 0 && stabilitySmoothing <= 1)) return false;
  if (!(lapseFactor > 0 && lapseFactor < 1)) return false;
  if (!(stabilityGrowthRate > 0)) return false;
  if (!(stabilityFloor > 0)) return false;
  if (!(stabilityMax > stabilityFloor)) return false;
  if (!(config.maxStabilityChangePerReview > 0)) return false;
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
// The per-review change cap is proportional and applies to the combined
// result (stability.ts), so the actual multiplier for an on-time review is
// clamp(M(rHat), 1/(1+Δmax), 1+Δmax). That is what is checked below. Because
// both M and the cap are proportions, the check still does not depend on
// stability or elapsed time, which is why 3.7.7 can state it per candidate
// rather than per item. (Under the earlier day-based cap on the correction
// alone, no such stability-free check existed, and the condition failed for
// mature items even though the closed-form M passed.)
//
// The condition is that the capped multiplier is non-decreasing as rHat
// increases across the allowed range [minRetrievability, maxRetrievability].
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
  const { minRetrievability, maxRetrievability, maxStabilityChangePerReview } =
    config;
  const lowerCap = 1 / (1 + maxStabilityChangePerReview);
  const upperCap = 1 + maxStabilityChangePerReview;

  let previousM = -Infinity;
  for (let i = 0; i < R_HAT_SAMPLES; i++) {
    const rHat =
      minRetrievability +
      ((maxRetrievability - minRetrievability) * i) / (R_HAT_SAMPLES - 1);
    const m = Math.min(
      upperCap,
      Math.max(lowerCap, computeMonotonicityMultiplier(rHat, config)),
    );
    if (m < previousM - 1e-9) return false; // a decrease - violates monotonicity
    previousM = m;
  }
  return true;
}

export function isValidCandidate(config: EngineConfig): boolean {
  return satisfiesBoundsConstraints(config) && satisfiesMonotonicity(config);
}

// ---------------------------------------------------------------------------
// Selection rule, shared by scripts/fit-parameters.ts and scripts/theta-sweep.ts
// so the two can never disagree.
//
// Among valid candidates, keep those whose mean retention at the held-out
// test point is >= RETENTION_FLOOR and whose convergence rate is >=
// CONVERGENCE_FLOOR, and pick the one with the fewest reviews per item.
// 3.9.1 asks for retention, review count and convergence to be reported
// together, so the rule looks at all three. The fallback was fixed before the
// current synthetic world was first run: if no candidate meets both floors,
// take the candidate with the highest convergence among those meeting the
// retention floor (fewer reviews breaks a tie), and report that the
// convergence floor was not met.

export const RETENTION_FLOOR = 0.75;
export const CONVERGENCE_FLOOR = 0.9;

export interface CandidateStats {
  config: EngineConfig;
  meanRetention: number;
  meanReviews: number;
  convergenceRate: number; // share of items meeting the 3.9.1 convergence criterion
}

export type SelectionRule = 'both-floors' | 'convergence-fallback' | 'none';

export function selectCandidate(stats: CandidateStats[]): {
  winner: CandidateStats | null;
  rule: SelectionRule;
} {
  const retentive = stats.filter((s) => s.meanRetention >= RETENTION_FLOOR);
  const both = retentive.filter((s) => s.convergenceRate >= CONVERGENCE_FLOOR);
  if (both.length > 0) {
    return {
      winner: both.reduce((best, s) =>
        s.meanReviews < best.meanReviews ? s : best,
      ),
      rule: 'both-floors',
    };
  }
  if (retentive.length > 0) {
    return {
      winner: retentive.reduce((best, s) =>
        s.convergenceRate > best.convergenceRate ||
        (s.convergenceRate === best.convergenceRate &&
          s.meanReviews < best.meanReviews)
          ? s
          : best,
      ),
      rule: 'convergence-fallback',
    };
  }
  return { winner: null, rule: 'none' };
}
