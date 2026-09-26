import type { ItemState, ReviewEvent } from './types';

const MIN_EASINESS = 1.3;
const DEFAULT_EASINESS = 2.5;

export function createInitialItemState(
  learnerId: string,
  cardId: string,
): ItemState {
  return {
    learnerId,
    cardId,
    stability: null,
    reviewCount: 0,
    repetitions: 0,
    easinessFactor: DEFAULT_EASINESS,
    intervalDays: 0,
    lastReviewedAt: null,
  };
}

// Classic SM-2, correctness treated as quality 5 (correct) or 0 (incorrect) —
// this is the cold-start fallback, so it deliberately ignores response time.
export function applySM2(state: ItemState, event: ReviewEvent): ItemState {
  const quality = event.correct ? 5 : 0;

  const nextEasiness = Math.max(
    MIN_EASINESS,
    state.easinessFactor +
      (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  if (!event.correct) {
    return {
      ...state,
      repetitions: 0,
      intervalDays: 1,
      easinessFactor: nextEasiness,
      lastReviewedAt: event.reviewedAt,
    };
  }

  const repetitions = state.repetitions + 1;
  let intervalDays: number;
  if (repetitions === 1) {
    intervalDays = 1;
  } else if (repetitions === 2) {
    intervalDays = 6;
  } else {
    intervalDays = Math.round(state.intervalDays * nextEasiness);
  }

  return {
    ...state,
    repetitions,
    intervalDays,
    easinessFactor: nextEasiness,
    lastReviewedAt: event.reviewedAt,
  };
}

export function nextReviewDate(state: ItemState): Date {
  if (!state.lastReviewedAt) throw new Error('Item has not been reviewed yet');
  const next = new Date(state.lastReviewedAt);
  next.setDate(next.getDate() + state.intervalDays);
  return next;
}
