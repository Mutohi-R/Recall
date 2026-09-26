import type { Rng } from './rng';
import type { GenerativeCondition } from './generative-models';
import type { SyntheticLearner, SyntheticItemState } from './types';

const MEAN_LOG_RT_RANGE: [number, number] = [Math.log(1.5), Math.log(6)]; // ~1.5s–6s typical speed
const STD_LOG_RT_RANGE: [number, number] = [0.2, 0.6];
const SIGNAL_NOISE_RANGE: [number, number] = [0.2, 1.5]; // low = strong rt/R link, high = weak
const STABILITY_SCALE_RANGE: [number, number] = [0.5, 3]; // learner-level forgets-slowly/quickly multiplier
const BASE_INITIAL_STABILITY_DAYS = 2;
const ITEM_JITTER_STD = 0.3; // log-scale, so items within one learner still vary a bit

function uniform(rng: Rng, [min, max]: [number, number]): number {
  return min + rng.next() * (max - min);
}

export function createSyntheticLearner(
  learnerId: string,
  condition: GenerativeCondition,
  rng: Rng,
): SyntheticLearner {
  return {
    learnerId,
    condition,
    trueMeanLogResponseTime: uniform(rng, MEAN_LOG_RT_RANGE),
    trueStdLogResponseTime: uniform(rng, STD_LOG_RT_RANGE),
    responseTimeSignalNoise: uniform(rng, SIGNAL_NOISE_RANGE),
    trueStabilityScale: uniform(rng, STABILITY_SCALE_RANGE),
  };
}

export function createSyntheticItemState(
  learner: SyntheticLearner,
  cardId: string,
  rng: Rng,
): SyntheticItemState {
  const jitter = Math.exp(rng.normal(0, ITEM_JITTER_STD));
  return {
    learnerId: learner.learnerId,
    cardId,
    trueStability:
      BASE_INITIAL_STABILITY_DAYS * learner.trueStabilityScale * jitter,
    lastReviewedAt: null,
  };
}
