import type { EngineConfig } from './types';

// Step 6: correction (moving stability toward what this review implies) then growth.
// Only called for a correct response — a lapse uses applyLapse instead.
export function applyStabilityUpdate(
  currentStability: number,
  elapsedDays: number,
  rHat: number,
  config: EngineConfig,
): number {
  let stability = currentStability;

  if (elapsedDays >= config.minIntervalForCorrection) {
    const observed = -elapsedDays / Math.log(rHat);
    const corrected =
      (1 - config.stabilitySmoothing) * currentStability +
      config.stabilitySmoothing * observed;
    stability = clampChange(
      corrected,
      currentStability,
      config.maxStabilityChangePerReview,
    );
  }
  // Growth always applies on success, even when correction was skipped for being too soon.
  stability = stability * (1 + config.stabilityGrowthRate * (1 - rHat));

  return Math.min(config.stabilityMax, stability);
}

// Step 4: a lapse on the adaptive path — multiplicative reduction, floored, no EMA involved.
export function applyLapse(
  currentStability: number,
  config: EngineConfig,
): number {
  return Math.max(config.stabilityFloor, config.lapseFactor * currentStability);
}

function clampChange(
  newValue: number,
  oldValue: number,
  maxChange: number,
): number {
  const delta = Math.max(-maxChange, Math.min(maxChange, newValue - oldValue));
  return oldValue + delta;
}
