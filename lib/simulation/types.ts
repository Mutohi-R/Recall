import type { GenerativeCondition } from './generative-models';

export interface SyntheticLearner {
  learnerId: string;
  condition: GenerativeCondition;
  trueMeanLogResponseTime: number; // ground-truth typical response speed, log seconds
  trueStdLogResponseTime: number; // ground-truth response time variability
  responseTimeSignalNoise: number; // per-learner: how strongly rt actually reflects true R
  trueStabilityScale: number; // per-learner: scales the starting stability of their items
  meanTrueDifficulty: number; // per-learner: average FSRS difficulty of their items (memory-model.ts)
}

export interface SyntheticItemState {
  learnerId: string;
  cardId: string;
  trueStability: number; // exponential time constant, days (3.7.1 units)
  trueDifficulty: number; // FSRS difficulty, 1-10 (memory-model.ts)
  lastReviewedAt: Date | null;
}

export interface GeneratedReview {
  correct: boolean;
  responseTimeMs: number;
  trueRetrievability: number;
}
