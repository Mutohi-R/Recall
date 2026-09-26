export interface ItemState {
  learnerId: string;
  cardId: string;
  stability: number | null; // null until the item leaves cold start
  reviewCount: number; // NEW — cumulative, every review, never resets
  repetitions: number; // SM-2's own consecutive-correct counter
  easinessFactor: number; // SM-2 fallback parameter
  intervalDays: number; // SM-2 fallback parameter
  lastReviewedAt: Date | null;
}

export interface ReviewEvent {
  correct: boolean;
  responseTimeMs: number;
  reviewedAt: Date;
}

export type SchedulingPath = 'sm2' | 'adaptive';

export interface SchedulingResult {
  nextReviewAt: Date;
  updatedState: ItemState;
  pathUsed: SchedulingPath;
}

export interface LearnerState {
  learnerId: string;
  meanLogResponseTime: number | null; // μ, over correct responses only
  stdLogResponseTime: number | null; // σ, over correct responses only
  logResponseTimeM2: number; // NEW — Welford running sum of squared diffs
  rtCount: number; // count of correct responses seen
  priorStability: number | null; // S̄, median stability across this learner's adaptive-path items
}

export interface EngineConfig {
  targetRetrievability: number; // θ, fixed at 0.9
  responseTimeConstant: number; // c — fitted in simulation
  minRetrievability: number; // R_min — fitted in simulation
  maxRetrievability: number; // R_max — fitted in simulation
  incorrectRetrievability: number; // fixed R̂ for incorrect responses, must be < R_min
  stabilitySmoothing: number; // α, EMA weight, (0, 1]
  stabilityGrowthRate: number; // k — fitted in simulation
  lapseFactor: number; // λ, (0, 1)
  stabilityFloor: number; // S_floor, in days
  stabilityMax: number; // S_max, in days
  minIntervalForCorrection: number; // Δt_min, in days
  maxStabilityChangePerReview: number; // Δ_max
  coldStartItemReviews: number; // n_item, ≥ 2
  coldStartLearnerReviews: number; // n_rt
  defaultPriorStability: number; // S̄_default, used when a learner has no adaptive-path items yet
}
