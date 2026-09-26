import type { EngineConfig } from './types';

export function estimateRetrievability(
  correct: boolean,
  responseTimeMs: number,
  learnerMeanLogRt: number | null,
  learnerStdLogRt: number | null,
  learnerRtCount: number,
  config: EngineConfig,
): number {
  if (!correct) return config.incorrectRetrievability;

  const insufficientHistory =
    learnerRtCount < config.coldStartLearnerReviews ||
    learnerMeanLogRt === null ||
    learnerStdLogRt === null ||
    learnerStdLogRt <= 0; // guard: can't standardize against zero spread;

  if (insufficientHistory) return config.targetRetrievability;

  const responseTimeSeconds = responseTimeMs / 1000;
  const z =
    (Math.log(responseTimeSeconds) - learnerMeanLogRt) / learnerStdLogRt;
  const raw = config.targetRetrievability - config.responseTimeConstant * z;

  return Math.min(
    config.maxRetrievability,
    Math.max(config.minRetrievability, raw),
  );
}
