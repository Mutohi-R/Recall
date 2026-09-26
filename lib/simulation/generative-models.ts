// The "ground truth" forgetting curves used to generate synthetic review data —
// never seen by the scheduler under test. See 3.9.1.

export type GenerativeCondition = 'matched' | 'mismatched';

// FSRS's own power-law form — the specific curve your thesis cites as the reason
// the exponential model may not hold (FSRS v4+). DECAY and FACTOR are fixed so
// that R(S, S) = 0.9 exactly, matching FSRS's own definition of "stability."
const POWER_LAW_DECAY = -0.5;
const POWER_LAW_FACTOR = Math.pow(0.9, 1 / POWER_LAW_DECAY) - 1; // = 19/81

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
