import type { Rng } from './rng';
import { computeTrueRetrievability } from './generative-models';
import type {
  SyntheticLearner,
  SyntheticItemState,
  GeneratedReview,
} from './types';

// How response time relates to true retrievability in the synthetic world.
// These are FIXED properties of the synthetic learners, not values taken from
// the configuration under test. An earlier version generated response times
// by inverting the engine's own 3.7.3 mapping with the candidate's c and
// theta, so each candidate (and each theta level in the sweep) was tested
// against learners built to match it exactly.
//
// The form is still the linear one 3.7.3 assumes (that is what makes the
// matched condition "matched"): a learner answering at their typical speed
// has a true R of TRUE_RT_ANCHOR, and each standard deviation of extra speed
// corresponds to TRUE_RT_SENSITIVITY of retrievability. Both are harness
// choices, reported with the results: the anchor is the deployed theta
// (3.7.2), and the sensitivity sits in the middle of the range the parameter
// search explores for c, so how close the fitted c comes to it is a check on
// whether the fitting recovers a known value.
export const TRUE_RT_ANCHOR = 0.9;
export const TRUE_RT_SENSITIVITY = 0.1;

// 3.9.1: in the mismatched condition, "noise will be added to the
// relationship between retrievability and response time". This is added on
// top of each learner's own noise level, which applies in both conditions.
export const MISMATCH_EXTRA_RT_NOISE = 0.5;

// impliedZ = (anchor - trueR) / sensitivity is unbounded: for an item reviewed
// very late (trueR near 0) it reaches 9. Left uncapped, that lands
// logResponseTime many multiples of the std away from the mean, a response
// time hundreds of times the learner's typical speed, which is not a
// plausible "slow but correct" answer. Capping at +-4 keeps the worst case at
// roughly 10x typical while leaving the ordinary range untouched.
const MAX_IMPLIED_Z = 4;

function clamp(value: number, bound: number): number {
  return Math.max(-bound, Math.min(bound, value));
}

export function generateReview(
  learner: SyntheticLearner,
  item: SyntheticItemState,
  elapsedDays: number,
  rng: Rng,
): GeneratedReview {
  const trueRetrievability = computeTrueRetrievability(
    learner.condition,
    elapsedDays,
    item.trueStability,
  );
  const correct = rng.next() < trueRetrievability;

  let logResponseTime: number;
  if (correct) {
    const impliedZ = clamp(
      (TRUE_RT_ANCHOR - trueRetrievability) / TRUE_RT_SENSITIVITY,
      MAX_IMPLIED_Z,
    );
    let noisyZ = impliedZ + rng.normal(0, learner.responseTimeSignalNoise);
    if (learner.condition === 'mismatched') {
      noisyZ += rng.normal(0, MISMATCH_EXTRA_RT_NOISE);
    }
    logResponseTime =
      learner.trueMeanLogResponseTime + learner.trueStdLogResponseTime * noisyZ;
  } else {
    // 3.7.3: response time on a failure isn't assumed to carry a usable signal,
    // so it's drawn from the learner's baseline distribution with no link to R.
    logResponseTime = rng.normal(
      learner.trueMeanLogResponseTime,
      learner.trueStdLogResponseTime,
    );
  }

  return {
    correct,
    // at least 1 ms: the engine rejects a non-positive response time
    responseTimeMs: Math.max(1, Math.round(Math.exp(logResponseTime) * 1000)),
    trueRetrievability,
  };
}
