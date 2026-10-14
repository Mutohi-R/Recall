import type { EngineConfig } from './types';

// 3.7.3: R̂ for a CORRECT response. Incorrect responses never reach this
// function: a lapse is handled by the multiplicative rule in 3.7.5, which does
// not use a retrievability estimate at all.
export function estimateRetrievability(
  responseTimeMs: number,
  learnerMeanLogRt: number | null,
  learnerStdLogRt: number | null,
  learnerRtCount: number,
  config: EngineConfig,
): number {
  const insufficientHistory =
    learnerRtCount < config.coldStartLearnerReviews ||
    learnerMeanLogRt === null ||
    learnerStdLogRt === null ||
    learnerStdLogRt <= 0; // guard: can't standardise against zero spread

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
