import type { EngineConfig } from './types';

// Step 6 (3.7.4): correction, then growth, then the per-review change cap.
// Only called for a correct response; a lapse uses applyLapse instead.
//
// Two details keep 3.7.7's monotonicity requirement (a faster correct answer
// never earns a shorter next interval than a slower one) true in practice,
// not just in the closed-form check:
//  - The change cap is proportional and is applied to the combined result of
//    correction and growth. An earlier version capped only the correction,
//    in days, and then applied growth on top. For mature items that let the
//    (larger) growth from a slow answer outweigh its capped correction, so
//    slow answers earned longer intervals than typical ones.
//  - When the review is too soon for the correction to be trusted
//    (elapsedDays < Δt_min), growth uses θ rather than the speed-based R̂.
//    Growth alone rises as R̂ falls, so using R̂ there would again reward
//    slower answers; at such short intervals the speed signal is not used.
export function applyStabilityUpdate(
  currentStability: number,
  elapsedDays: number,
  rHat: number,
  config: EngineConfig,
): number {
  let stability = currentStability;
  let growthRetrievability = config.targetRetrievability;

  if (elapsedDays >= config.minIntervalForCorrection) {
    const observed = -elapsedDays / Math.log(rHat);
    stability =
      (1 - config.stabilitySmoothing) * currentStability +
      config.stabilitySmoothing * observed;
    growthRetrievability = rHat;
  }

  stability =
    stability * (1 + config.stabilityGrowthRate * (1 - growthRetrievability));

  stability = clampProportionalChange(
    stability,
    currentStability,
    config.maxStabilityChangePerReview,
  );

  return Math.min(config.stabilityMax, stability);
}

// Step 4 (3.7.5): a lapse on the adaptive path. Stability is multiplied by λ
// and floored, but a lapse can never RAISE stability: if stability is already
// below the floor (possible for an item initialised from a low prior), it is
// left where it is. The floor exists to stop repeated lapses driving
// stability towards zero, not to reward a failure.
export function applyLapse(
  currentStability: number,
  config: EngineConfig,
): number {
  return Math.min(
    currentStability,
    Math.max(config.stabilityFloor, config.lapseFactor * currentStability),
  );
}

export function clampProportionalChange(
  newValue: number,
  oldValue: number,
  maxChange: number,
): number {
  const upper = oldValue * (1 + maxChange);
  const lower = oldValue / (1 + maxChange);
  return Math.min(upper, Math.max(lower, newValue));
}
