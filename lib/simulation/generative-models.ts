// The "ground truth" forgetting curves used to generate synthetic review data —
// never seen by the scheduler under test. See 3.9.1.

export type GenerativeCondition = 'matched' | 'mismatched';

// FSRS's own power-law form — the specific curve your thesis cites as the reason
// the exponential model may not hold (FSRS v4+).
//
// CALIBRATION_THETA/POWER_LAW_DECAY fix the curve so it reaches
// CALIBRATION_THETA at the *same elapsed time* the exponential does, rather
// than at t = S. 3.7.1/3.7.2 define S as the exponential's time constant,
// not as "the interval at which R = 0.9" — under this thesis's own
// exponential, R(t) = e^(-t/S) only reaches 0.9 at t = -S*ln(0.9) ≈ 0.105*S;
// R(S) itself is 1/e ≈ 0.368. FSRS's own convention anchors stability at
// R(S) = 0.9 instead, which is a different definition of S. An earlier
// version of this file used FSRS's convention directly (R(S,S) = 0.9), which
// meant that for the same numeric "true stability" value, the power-law
// curve took about 9.5x longer in absolute days to decay to 0.9 than the
// exponential did — a large, unintended difference in timescale between the
// matched and mismatched conditions, on top of the intended difference in
// curve shape. Anchoring both curves at the same (t, R) point — the point
// that actually matters to the algorithm under test, since it's where the
// scheduler expects retrievability to be when an item is reviewed on time —
// removes that confound while still letting the curves diverge away from
// it, which is the comparison 3.9.1 actually wants.
const CALIBRATION_THETA = 0.9;
const POWER_LAW_DECAY = -0.5;
const POWER_LAW_FACTOR =
  (Math.pow(CALIBRATION_THETA, 1 / POWER_LAW_DECAY) - 1) /
  -Math.log(CALIBRATION_THETA);

export function trueRetrievabilityExponential(
  elapsedDays: number,
  trueStability: number,
): number {
  return Math.exp(-elapsedDays / trueStability);
}

export function trueRetrievabilityPowerLaw(
  elapsedDays: number,
  trueStability: number,
): number {
  return Math.pow(
    1 + (POWER_LAW_FACTOR * elapsedDays) / trueStability,
    POWER_LAW_DECAY,
  );
}

export function computeTrueRetrievability(
  condition: GenerativeCondition,
  elapsedDays: number,
  trueStability: number,
): number {
  return condition === 'matched'
    ? trueRetrievabilityExponential(elapsedDays, trueStability)
    : trueRetrievabilityPowerLaw(elapsedDays, trueStability);
}
