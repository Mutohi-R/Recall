import type { Rng } from './rng';
import type { GenerativeCondition } from './generative-models';
import type { SyntheticLearner, SyntheticItemState } from './types';
import {
  FSRS_DAYS_PER_EXP_UNIT,
  FSRS_INITIAL_STABILITY_GOOD,
} from './memory-model';

const MEAN_LOG_RT_RANGE: [number, number] = [Math.log(1.5), Math.log(6)]; // ~1.5s–6s typical speed
const STD_LOG_RT_RANGE: [number, number] = [0.2, 0.6];
const SIGNAL_NOISE_RANGE: [number, number] = [0.2, 1.5]; // low = strong rt/R link, high = weak
const STABILITY_SCALE_RANGE: [number, number] = [0.5, 3]; // learner-level multiplier on starting stability
// Learners differ lastingly in how fast they forget through FSRS difficulty,
// which slows growth after every successful review (memory-model.ts). FSRS's
// own defaults put a first "Good" at about 2.1 and a first "Again" at about
// 6.4, so learner averages are drawn across roughly that span.
const MEAN_DIFFICULTY_RANGE: [number, number] = [1.5, 6.5];
const ITEM_DIFFICULTY_STD = 1;
const DIFFICULTY_BOUNDS: [number, number] = [1, 10];
// Starting stability: FSRS's default after a first "Good" (2.31 days to
// R = 0.9), converted to the exponential time constant used everywhere else
// (about 21.9 days), then scaled per learner and per item.
const BASE_INITIAL_STABILITY_DAYS =
  FSRS_INITIAL_STABILITY_GOOD / FSRS_DAYS_PER_EXP_UNIT;
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
    meanTrueDifficulty: uniform(rng, MEAN_DIFFICULTY_RANGE),
  };
}

export function createSyntheticItemState(
  learner: SyntheticLearner,
  cardId: string,
  rng: Rng,
): SyntheticItemState {
  const jitter = Math.exp(rng.normal(0, ITEM_JITTER_STD));
  const difficulty = rng.normal(
    learner.meanTrueDifficulty,
    ITEM_DIFFICULTY_STD,
  );
  return {
    learnerId: learner.learnerId,
    cardId,
    trueStability:
      BASE_INITIAL_STABILITY_DAYS * learner.trueStabilityScale * jitter,
    trueDifficulty: Math.min(
      DIFFICULTY_BOUNDS[1],
      Math.max(DIFFICULTY_BOUNDS[0], difficulty),
    ),
    lastReviewedAt: null,
  };
}
