/**
 * Early-review check for the monotonicity condition (3.7.7).
 *
 * The condition is checked in parameter-fitting.ts for reviews taken when
 * they are due. This script measures how far it can fail for a review taken
 * earlier than due, using the fitted configuration (Table 4.2) and the
 * engine's own applyStabilityUpdate.
 *
 * For each stability S and each elapsed time expressed as a fraction f of the
 * due interval (-S ln(theta)), correct responses of different speeds are
 * compared across the allowed range of R-hat. A faster answer means a higher
 * R-hat. The shortfall is the largest proportional fall in the updated
 * stability as R-hat rises. The next interval is proportional to the updated
 * stability, so it is also the shortfall in the next interval.
 *
 * Run with: npx tsx scripts/early-review-check.ts
 */
import { applyStabilityUpdate } from '../lib/scheduling/stability';
import type { EngineConfig } from '../lib/scheduling/types';

// Same values as engineConfig in scripts/run-simulation.ts.
const config: EngineConfig = {
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

const theta = config.targetRetrievability;
const dueInterval = (s: number) => -s * Math.log(theta);

const rGrid: number[] = [];
const R_STEPS = 400;
for (let i = 0; i <= R_STEPS; i++) {
  rGrid.push(
    config.minRetrievability +
      ((config.maxRetrievability - config.minRetrievability) * i) / R_STEPS,
  );
}

// Stabilities from 2 to 6,000 days, evenly spaced on a log scale.
const stabilities: number[] = [];
for (let x = Math.log(2); x <= Math.log(6000); x += 0.05) {
  stabilities.push(Math.exp(x));
}

function worstShortfall(s: number, elapsedDays: number): number {
  let runningMax = -Infinity;
  let worst = 0;
  for (const r of rGrid) {
    const updated = applyStabilityUpdate(s, elapsedDays, r, config);
    if (updated > runningMax) runningMax = updated;
    worst = Math.max(worst, (runningMax - updated) / runningMax);
  }
  return worst;
}

const fractions = [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.8, 0.9, 1.0, 1.5];
console.log('elapsed as a fraction of the due interval -> largest shortfall');
for (const f of fractions) {
  let worst = 0;
  let worstS = 0;
  for (const s of stabilities) {
    const w = worstShortfall(s, f * dueInterval(s));
    if (w > worst) {
      worst = w;
      worstS = s;
    }
  }
  console.log(
    `${(f * 100).toFixed(0).padStart(4)}%  ${(worst * 100).toFixed(3).padStart(8)}%  (at S = ${worstS.toFixed(0)} days)`,
  );
}