import type { Rng } from './rng';
import { computeTrueRetrievability } from './generative-models';
import type {
  SyntheticLearner,
  SyntheticItemState,
  GeneratedReview,
} from './types';

export interface ResponseTimeMappingConfig {
  targetRetrievability: number; // theta
  responseTimeConstant: number; // c
}

// impliedZ = (theta - trueR) / c is unbounded: for an item reviewed very late
// (trueR near 0) with a small c, it can reach double digits. Left uncapped,
// that lands logResponseTime many multiples of the std away from the mean -
// e.g. z=10 with stdLogResponseTime=0.6 is +6 on the log scale, a response
// time ~400x the learner's typical speed, which is not a plausible "slow but
// correct" answer. Capping at +-4 keeps the worst case at roughly 10x typical
// (still clearly a slow response, not an impossible one) while leaving the
// ordinary range (|z| < 2-3 for most reviews) completely untouched.
const MAX_IMPLIED_Z = 4;

function clamp(value: number, bound: number): number {
  return Math.max(-bound, Math.min(bound, value));
}

export function generateReview(
  learner: SyntheticLearner,
  item: SyntheticItemState,
  elapsedDays: number,
  config: ResponseTimeMappingConfig,
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
    // Invert the algorithm's own 3.7.3 relationship to find the z-score implied by
    // the true retrievability, then draw around it with extra noise — response time
    // is an imperfect proxy for R, never a perfect one, even in the matched condition.
    const impliedZ = clamp(
      (config.targetRetrievability - trueRetrievability) /
        config.responseTimeConstant,
      MAX_IMPLIED_Z,
    );
    const noisyZ = impliedZ + rng.normal(0, learner.responseTimeSignalNoise);
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
    responseTimeMs: Math.round(Math.exp(logResponseTime) * 1000),
    trueRetrievability,
  };
}
