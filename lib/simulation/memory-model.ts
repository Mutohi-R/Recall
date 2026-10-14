// The synthetic learner's TRUE memory dynamics: how an item's real stability
// changes after each review. Never seen by the scheduler under test.
//
// Why this is a separate, fixed model (and not the scheduler's own update
// rule): an earlier version of the harness moved true stability with the
// growth and lapse rules of 3.7.4/3.7.5, using the k, lambda, S_floor and
// S_max of whichever configuration was being tested. Each candidate in the
// parameter search was therefore evaluated in a world it partly defined, and
// the search could raise retention by making the synthetic learners easier to
// teach rather than by scheduling them better. The fitted values drifted to
// the "easy world" edge of their ranges (an S_floor of 18.7 days meant a
// forgotten item became MORE stable than a typical new one). The world below
// depends on nothing the scheduler is configured with, so every candidate,
// every theta level, and SM-2 are all tested against the same learners.
//
// The model is FSRS's, with its published default parameters (FSRS-6, as
// shipped in the open-spaced-repetition py-fsrs package). FSRS is fitted to
// large volumes of real review data (2.3.3), which makes it a defensible
// stand-in for "how memory actually behaves" that was not designed around
// the algorithm under test. Every answer is treated as FSRS's "Good" when
// correct and "Again" when not, since the simulated reviews, like the real
// application, record only correct or incorrect.
//
// Only FSRS's update rules (stability after a success or a lapse, and
// difficulty) are used here. Its own forgetting curve is NOT used: recall
// probability between reviews comes from generative-models.ts, exponential in
// the matched condition and a power law in the mismatched one, as 3.9.1
// specifies. FSRS replaced its exponential curve with a power law at version
// 4 (decay -1); the decay of -0.5 used here is the one FSRS-4.5 and FSRS-5
// used. FSRS-6 fits a flatter curve (decay 0.1542 by default), so its default
// parameters are used here slightly outside the curve they were fitted with.
//
// Units. FSRS defines stability as the number of days until recall
// probability falls to 0.9. The rest of this harness (and the engine) uses
// the exponential time constant S of 3.7.1, for which R falls to 0.9 at
// t = -S ln(0.9). The two are converted with FSRS_DAYS_PER_EXP_UNIT. The
// forgetting curves in generative-models.ts are already anchored at that same
// point, so the conversion keeps both conditions consistent with FSRS's own
// definition.

export const FSRS_DEFAULT_PARAMETERS = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
  0.1542,
] as const;

const w = FSRS_DEFAULT_PARAMETERS;

// FSRS stability (days to R = 0.9) per unit of exponential stability.
export const FSRS_DAYS_PER_EXP_UNIT = -Math.log(0.9);

const FSRS_STABILITY_MIN = 0.001; // py-fsrs's own lower clamp, in FSRS days
const FSRS_STABILITY_MAX = 36500; // 100 years, in FSRS days
const DIFFICULTY_MIN = 1;
const DIFFICULTY_MAX = 10;

const RATING_AGAIN = 1;
const RATING_GOOD = 3;
const RATING_EASY = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// FSRS initial difficulty for a first rating (unclamped, as py-fsrs uses it
// inside mean reversion).
export function fsrsInitialDifficulty(rating: number): number {
  return w[4] - Math.exp(w[5] * (rating - 1)) + 1;
}

// FSRS initial stability for a first "Good", in FSRS days (w[2]).
export const FSRS_INITIAL_STABILITY_GOOD = w[2];

export interface TrueMemoryState {
  trueStability: number; // exponential time constant, in days (3.7.1 units)
  trueDifficulty: number; // FSRS difficulty, 1-10
}

/**
 * The true memory state after one review, given the true recall probability
 * at the moment of that review and whether it was answered correctly.
 */
export function nextTrueMemoryState(
  state: TrueMemoryState,
  trueRetrievability: number,
  correct: boolean,
): TrueMemoryState {
  const s = state.trueStability * FSRS_DAYS_PER_EXP_UNIT; // to FSRS days
  const d = state.trueDifficulty;
  const r = trueRetrievability;

  let nextS: number;
  if (correct) {
    nextS =
      s *
      (1 +
        Math.exp(w[8]) *
          (11 - d) *
          Math.pow(s, -w[9]) *
          (Math.exp((1 - r) * w[10]) - 1));
  } else {
    const longTerm =
      w[11] *
      Math.pow(d, -w[12]) *
      (Math.pow(s + 1, w[13]) - 1) *
      Math.exp((1 - r) * w[14]);
    const shortTerm = s / Math.exp(w[17] * w[18]);
    nextS = Math.min(longTerm, shortTerm);
  }
  nextS = clamp(nextS, FSRS_STABILITY_MIN, FSRS_STABILITY_MAX);

  const rating = correct ? RATING_GOOD : RATING_AGAIN;
  const deltaD = -w[6] * (rating - 3);
  const damped = d + ((10 - d) * deltaD) / 9;
  const nextD = clamp(
    w[7] * fsrsInitialDifficulty(RATING_EASY) + (1 - w[7]) * damped,
    DIFFICULTY_MIN,
    DIFFICULTY_MAX,
  );

  return {
    trueStability: nextS / FSRS_DAYS_PER_EXP_UNIT,
    trueDifficulty: nextD,
  };
}
