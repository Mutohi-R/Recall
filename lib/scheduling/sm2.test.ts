import { describe, it, expect } from 'vitest';
import { createInitialItemState, applySM2, nextReviewDate } from './sm2';

const review = (correct: boolean, at = new Date('2026-01-01')) => ({
  correct,
  responseTimeMs: 2000,
  reviewedAt: at,
});

describe('SM-2 fallback', () => {
  it('first correct review sets a 1-day interval', () => {
    const state = createInitialItemState('l1', 'c1');
    const next = applySM2(state, review(true));
    expect(next.repetitions).toBe(1);
    expect(next.intervalDays).toBe(1);
  });

  it('second consecutive correct review sets a 6-day interval', () => {
    let state = createInitialItemState('l1', 'c1');
    state = applySM2(state, review(true));
    state = applySM2(state, review(true));
    expect(state.repetitions).toBe(2);
    expect(state.intervalDays).toBe(6);
  });

  it('an incorrect review resets repetitions and interval', () => {
    let state = createInitialItemState('l1', 'c1');
    state = applySM2(state, review(true));
    state = applySM2(state, review(true));
    state = applySM2(state, review(false));
    expect(state.repetitions).toBe(0);
    expect(state.intervalDays).toBe(1);
  });

  it('easiness factor never drops below 1.3', () => {
    let state = createInitialItemState('l1', 'c1');
    for (let i = 0; i < 10; i++) state = applySM2(state, review(false));
    expect(state.easinessFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('computes the next review date from the interval', () => {
    let state = createInitialItemState('l1', 'c1');
    state = applySM2(state, review(true, new Date('2026-01-01')));
    expect(nextReviewDate(state).toISOString().slice(0, 10)).toBe('2026-01-02');
  });

  // Wozniak's description is ambiguous about the E-Factor on a failure (step 5
  // updates it after every repetition; step 6 restarts "without changing the
  // E-Factor"). This implementation applies the step 5 formula to every grade,
  // with correct = 5 and incorrect = 0, so a correct answer adds 0.1 and a
  // failure subtracts 0.8 (down to the 1.3 floor).
  it('applies the E-Factor formula to every grade: +0.1 when correct, -0.8 on a failure', () => {
    let state = createInitialItemState('l1', 'c1');
    state = applySM2(state, review(true));
    expect(state.easinessFactor).toBeCloseTo(2.6, 10);
    state = applySM2(state, review(false));
    expect(state.easinessFactor).toBeCloseTo(1.8, 10);
  });
});
