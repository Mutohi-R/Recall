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
    const impliedZ =
      (config.targetRetrievability - trueRetrievability) /
      config.responseTimeConstant;
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
