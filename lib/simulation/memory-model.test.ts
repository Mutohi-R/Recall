import { describe, it, expect } from 'vitest';
import {
  nextTrueMemoryState,
  fsrsInitialDifficulty,
  FSRS_DAYS_PER_EXP_UNIT,
  FSRS_DEFAULT_PARAMETERS as w,
} from './memory-model';

// Exponential stability whose FSRS equivalent (days to R = 0.9) is 10.
const S_EXP_FOR_FSRS_10 = 10 / FSRS_DAYS_PER_EXP_UNIT;

describe('nextTrueMemoryState', () => {
  it('matches the FSRS recall formula by hand on a correct answer', () => {
    // FSRS S = 10, D = 5, R = 0.9:
    // S' = 10 * (1 + e^w8 * (11 - 5) * 10^-w9 * (e^(0.1 * w10) - 1))
    const expectedFsrs =
      10 *
      (1 +
        Math.exp(w[8]) * 6 * Math.pow(10, -w[9]) * (Math.exp(0.1 * w[10]) - 1));
    const next = nextTrueMemoryState(
      { trueStability: S_EXP_FOR_FSRS_10, trueDifficulty: 5 },
      0.9,
      true,
    );
    expect(next.trueStability * FSRS_DAYS_PER_EXP_UNIT).toBeCloseTo(
      expectedFsrs,
      8,
    );
  });

  it('grows stability more after a harder (lower R) successful recall', () => {
    const state = { trueStability: S_EXP_FOR_FSRS_10, trueDifficulty: 5 };
    const hard = nextTrueMemoryState(state, 0.6, true).trueStability;
    const easy = nextTrueMemoryState(state, 0.95, true).trueStability;
    expect(hard).toBeGreaterThan(easy);
    expect(easy).toBeGreaterThan(state.trueStability);
  });

  it('grows stability less for a more difficult item', () => {
    const easyItem = nextTrueMemoryState(
      { trueStability: S_EXP_FOR_FSRS_10, trueDifficulty: 2 },
      0.9,
      true,
    ).trueStability;
    const hardItem = nextTrueMemoryState(
      { trueStability: S_EXP_FOR_FSRS_10, trueDifficulty: 8 },
      0.9,
      true,
    ).trueStability;
    expect(easyItem).toBeGreaterThan(hardItem);
  });

  it('never raises stability after a lapse, at any starting stability', () => {
    for (const fsrsDays of [0.01, 0.5, 2, 10, 100, 1000]) {
      const state = {
        trueStability: fsrsDays / FSRS_DAYS_PER_EXP_UNIT,
        trueDifficulty: 5,
      };
      for (const r of [0.05, 0.5, 0.9, 0.99]) {
        const next = nextTrueMemoryState(state, r, false);
        expect(next.trueStability).toBeLessThanOrEqual(state.trueStability);
      }
    }
  });

  it('makes an item more difficult after a lapse and keeps difficulty within 1-10', () => {
    const lapsed = nextTrueMemoryState(
      { trueStability: S_EXP_FOR_FSRS_10, trueDifficulty: 5 },
      0.9,
      false,
    );
    expect(lapsed.trueDifficulty).toBeGreaterThan(5);
    let state = { trueStability: S_EXP_FOR_FSRS_10, trueDifficulty: 9.9 };
    for (let i = 0; i < 10; i++) state = nextTrueMemoryState(state, 0.5, false);
    expect(state.trueDifficulty).toBeLessThanOrEqual(10);
    expect(state.trueDifficulty).toBeGreaterThanOrEqual(1);
  });

  it('leaves stability unchanged after a correct answer at R = 1 (an immediate re-check)', () => {
    const state = { trueStability: S_EXP_FOR_FSRS_10, trueDifficulty: 5 };
    expect(nextTrueMemoryState(state, 1, true).trueStability).toBeCloseTo(
      state.trueStability,
      10,
    );
  });
});

describe('fsrsInitialDifficulty', () => {
  it("gives FSRS's published starting difficulties", () => {
    expect(fsrsInitialDifficulty(1)).toBeCloseTo(w[4], 10); // Again
    expect(fsrsInitialDifficulty(3)).toBeCloseTo(
      w[4] - Math.exp(2 * w[5]) + 1,
      10,
    ); // Good, about 2.12
  });
});
