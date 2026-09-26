import type { GenerativeCondition } from './generative-models';

export interface SyntheticLearner {
  learnerId: string;
  condition: GenerativeCondition;
  trueMeanLogResponseTime: number; // ground-truth typical response speed, log seconds
  trueStdLogResponseTime: number; // ground-truth response time variability
  responseTimeSignalNoise: number; // per-learner: how strongly rt actually reflects true R
  trueStabilityScale: number; // per-learner: how quickly they generally forget
}

export interface SyntheticItemState {
  learnerId: string;
  cardId: string;
  trueStability: number;
  lastReviewedAt: Date | null;
}

export interface GeneratedReview {
  correct: boolean;
  responseTimeMs: number;
  trueRetrievability: number;
}
