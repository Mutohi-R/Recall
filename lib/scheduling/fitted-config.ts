import type { EngineConfig } from './types';

// The configuration selected by the parameter search (Table 4.2). The
// simulation (scripts/run-simulation.ts) and the application server both
// import it from here, so the algorithm that was evaluated and the one a
// learner uses are configured identically.
//
// Fitted by scripts/fit-parameters.ts on a fitting set generated from a
// seed range distinct from this script's own SEED, under the 'matched'
// condition only, per 3.9.1's fit/evaluate separation requirement. The
// synthetic world (memory-model.ts, generate-review.ts) does not depend on
// this configuration. Every one of the 2,000 valid candidates met the 0.75
// retention floor, none met the 90% convergence floor (best 46.7%), so the
// winner was chosen by the pre-set fallback: highest convergence among
// candidates meeting the retention floor. On the fitting set it reached
// retention 0.907 at 10.4 reviews/item, with 46.7% of items converging.
export const fittedEngineConfig: EngineConfig = {
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
