import { processReview } from '../scheduling/engine';
import { computeMedianStability } from '../scheduling/learner-stats';
import type { EngineConfig, SchedulingPath } from '../scheduling/types';
import {
  ItemNotFoundError,
  ReviewConflictError,
  type ReviewStore,
} from '../persistence/store';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// 3.8: "the response times are within a plausible range". The thesis gives no
// numbers, so these are application choices. The response time covers reading
// the card, recalling, revealing and rating, so a value under 200 ms cannot be
// a real attempt, and five minutes means the learner was away.
export const MIN_RESPONSE_TIME_MS = 200;
export const MAX_RESPONSE_TIME_MS = 5 * 60 * 1000;

// Concurrent submissions for the same learner can interleave. A write that
// finds the rows changed is retried from a fresh read.
const MAX_ATTEMPTS = 3;

export class InvalidReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidReviewError';
  }
}

export class NotDueError extends Error {
  constructor() {
    super('item is not due for review');
    this.name = 'NotDueError';
  }
}

export interface ReviewSubmission {
  learnerId: string; // from the verified token, never from the request body
  itemStateId: string;
  correct: unknown;
  responseTimeMs: unknown;
}

export interface ReviewResult {
  nextReviewAt: Date;
  intervalDays: number;
  path: SchedulingPath;
}

export function validateSubmission(sub: ReviewSubmission): {
  correct: boolean;
  responseTimeMs: number;
} {
  if (typeof sub.correct !== 'boolean') {
    throw new InvalidReviewError('correct must be true or false');
  }
  const rt = sub.responseTimeMs;
  if (typeof rt !== 'number' || !Number.isFinite(rt)) {
    throw new InvalidReviewError('responseTimeMs must be a number');
  }
  const rounded = Math.round(rt);
  if (rounded < MIN_RESPONSE_TIME_MS || rounded > MAX_RESPONSE_TIME_MS) {
    throw new InvalidReviewError(
      `responseTimeMs must be between ${MIN_RESPONSE_TIME_MS} and ${MAX_RESPONSE_TIME_MS}`,
    );
  }
  return { correct: sub.correct, responseTimeMs: rounded };
}

// The review time is the time the server received the submission, not a
// value the browser reports, so a client cannot back-date or post-date a
// review and distort the elapsed time the algorithm uses.
export async function submitReview(
  store: ReviewStore,
  config: EngineConfig,
  sub: ReviewSubmission,
  now: Date = new Date(),
): Promise<ReviewResult> {
  const { correct, responseTimeMs } = validateSubmission(sub);

  for (let attempt = 1; ; attempt++) {
    const ctx = await store.loadForReview(sub.learnerId, sub.itemStateId);
    if (!ctx) throw new ItemNotFoundError();
    if (ctx.dueAt.getTime() > now.getTime()) throw new NotDueError();

    let outcome;
    try {
      outcome = processReview(
        ctx.item,
        ctx.learner,
        { correct, responseTimeMs, reviewedAt: now },
        config,
      );
    } catch (e) {
      if (e instanceof RangeError) throw new InvalidReviewError(e.message);
      throw e;
    }

    // 3.7.8: the learner prior is recomputed after every review, from the
    // stabilities of all the learner's adaptive-path items.
    const stabilities = [...ctx.otherStabilities];
    if (outcome.updatedItem.stability !== null) {
      stabilities.push(outcome.updatedItem.stability);
    }
    const updatedLearner = {
      ...outcome.updatedLearner,
      priorStability: computeMedianStability(stabilities),
    };

    const intervalDays =
      (outcome.nextReviewAt.getTime() - now.getTime()) / MS_PER_DAY;
    const elapsedDays = ctx.item.lastReviewedAt
      ? (now.getTime() - ctx.item.lastReviewedAt.getTime()) / MS_PER_DAY
      : null;

    try {
      await store.saveReview({
        learnerId: sub.learnerId,
        itemStateId: sub.itemStateId,
        expectedReviewCount: ctx.item.reviewCount,
        expectedRtCount: ctx.learner.rtCount,
        item: outcome.updatedItem,
        dueAt: outcome.nextReviewAt,
        learner: updatedLearner,
        log: {
          reviewedAt: now,
          correct,
          responseTimeMs,
          elapsedDays,
          path: outcome.pathUsed,
          intervalAssigned: intervalDays,
        },
      });
    } catch (e) {
      if (e instanceof ReviewConflictError && attempt < MAX_ATTEMPTS) continue;
      throw e;
    }

    return {
      nextReviewAt: outcome.nextReviewAt,
      intervalDays,
      path: outcome.pathUsed,
    };
  }
}
