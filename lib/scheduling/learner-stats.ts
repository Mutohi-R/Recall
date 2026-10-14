import type { ItemState, LearnerState } from './types';

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
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// 3.7.6: the learner prior S-bar is the median stability of that learner's
// items already on the adaptive path, and 3.7.8 says it is recomputed after
// every review so that an item introduced later is initialised from the most
// recent estimate. An item is on the adaptive path exactly when its stability
// is non-null. processReview cannot do this itself, because it sees one item
// at a time; whatever calls it (the application, or the simulation) passes in
// all of the learner's items and stores the returned state.
export function refreshPriorStability(
  learner: LearnerState,
  items: ItemState[],
): LearnerState {
  const stabilities = items
    .filter((item) => item.stability !== null)
    .map((item) => item.stability as number);
  return { ...learner, priorStability: computeMedianStability(stabilities) };
}
