import type { LearnerState } from './types';

export function updateResponseTimeStats(
  learner: LearnerState,
  responseTimeMs: number,
): LearnerState {
  const x = Math.log(responseTimeMs / 1000); // log seconds, per 3.7.3
  const n = learner.rtCount + 1;
  const meanOld = learner.meanLogResponseTime ?? 0;
  const m2Old = learner.logResponseTimeM2;

  const delta = x - meanOld;
  const meanNew = meanOld + delta / n;
  const delta2 = x - meanNew;
  const m2New = m2Old + delta * delta2;

  return {
    ...learner,
    rtCount: n,
    meanLogResponseTime: meanNew,
    logResponseTimeM2: m2New,
    stdLogResponseTime: Math.sqrt(m2New / n),
  };
}

export function computeMedianStability(stabilities: number[]): number | null {
    if (stabilities.length === 0) return null;
    const sorted = [...stabilities].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
