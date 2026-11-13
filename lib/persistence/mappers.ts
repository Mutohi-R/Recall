import type { ItemState, LearnerState } from '../scheduling/types';
import type { ReviewWrite } from './store';

// Row shapes as PostgREST returns them (Tables 3.1 and 3.4).
export interface ItemStateRow {
  id: string;
  learner_id: string;
  card_id: string;
  stability: number | null;
  review_count: number;
  last_reviewed: string | null;
  due_at: string;
  sm2_easiness: number;
  sm2_interval: number;
  sm2_repetitions: number;
}

export interface LearnerRow {
  id: string;
  prior_stability: number | null;
  log_rt_mean: number | null;
  log_rt_sd: number | null;
  rt_count: number;
}

export function itemFromRow(row: ItemStateRow): ItemState {
  return {
    learnerId: row.learner_id,
    cardId: row.card_id,
    stability: row.stability,
    reviewCount: row.review_count,
    repetitions: row.sm2_repetitions,
    easinessFactor: row.sm2_easiness,
    intervalDays: row.sm2_interval,
    lastReviewedAt: row.last_reviewed ? new Date(row.last_reviewed) : null,
  };
}

// Table 3.1 stores the mean and standard deviation of log response time but
// not the running sum of squared differences that the incremental update
// (Welford's algorithm) carries. The engine takes the standard deviation as
// sqrt(M2 / n), so M2 is recovered as sd^2 * n (equal up to floating-point rounding).
export function learnerFromRow(row: LearnerRow): LearnerState {
  const n = row.rt_count;
  const sd = row.log_rt_sd;
  return {
    learnerId: row.id,
    meanLogResponseTime: row.log_rt_mean,
    stdLogResponseTime: sd,
    logResponseTimeM2: sd === null ? 0 : sd * sd * n,
    rtCount: n,
    priorStability: row.prior_stability,
  };
}

// Argument object for the record_review function, named after its parameters.
export function toRecordReviewArgs(w: ReviewWrite) {
  return {
    p_learner_id: w.learnerId,
    p_item_state_id: w.itemStateId,
    p_expected_review_count: w.expectedReviewCount,
    p_expected_rt_count: w.expectedRtCount,
    p_stability: w.item.stability,
    p_review_count: w.item.reviewCount,
    p_last_reviewed: w.item.lastReviewedAt!.toISOString(),
    p_due_at: w.dueAt.toISOString(),
    p_sm2_easiness: w.item.easinessFactor,
    p_sm2_interval: w.item.intervalDays,
    p_sm2_repetitions: w.item.repetitions,
    p_prior_stability: w.learner.priorStability,
    p_log_rt_mean: w.learner.meanLogResponseTime,
    p_log_rt_sd: w.learner.stdLogResponseTime,
    p_rt_count: w.learner.rtCount,
    p_correct: w.log.correct,
    p_response_time_ms: w.log.responseTimeMs,
    p_elapsed_days: w.log.elapsedDays,
    p_path: w.log.path,
    p_interval_assigned: w.log.intervalAssigned,
  };
}
