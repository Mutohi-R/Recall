import type { Rng } from './rng';
import type { SyntheticLearner, SyntheticItemState } from './types';
import { generateReview } from './generate-review';
import { processReview } from '../scheduling/engine';
import { createInitialItemState, applySM2 } from '../scheduling/sm2';
import { refreshPriorStability } from '../scheduling/learner-stats';
import type {
  EngineConfig,
  ItemState,
  LearnerState,
  ReviewEvent,
  SchedulingPath,
} from '../scheduling/types';

// The matched/mismatched distinction (3.9.1) is about the *within-review*
// decay shape (generative-models.ts: exponential vs power law) - not about
// whether memory is strengthened by review at all. 2.2.3's own argument for
// why spacing works ("a review does more to strengthen the memory") applies
// regardless of curve shape, so the true, underlying stability-like scale
// fed to computeTrueRetrievability evolves via the *same* growth/lapse
// mechanic 3.7.4/3.7.5 describe, using the same constants as whatever
// EngineConfig is under test. This is what "the matched condition's
// assumptions hold exactly" (3.9.1) means: not just the curve shape, but the
// whole update rule - so there is deliberately no separate, independent set
// of "true dynamics" constants here (an earlier version of this file had
// one, and it produced a synthetic population whose real memory grew at a
// rate disconnected from whatever the algorithm assumed, guaranteeing
// systematic over- or under-scheduling regardless of tuning).
//
// No correction term is used: correction exists only to let a noisy
// *estimator* close in on a value it doesn't already know, and the
// generator knows the true state exactly at every point.
function applyTrueStabilityUpdate(
  trueStability: number,
  trueRetrievability: number,
  correct: boolean,
  engineConfig: EngineConfig,
): number {
  if (!correct) {
    return Math.max(
      engineConfig.stabilityFloor,
      engineConfig.lapseFactor * trueStability,
    );
  }
  const grown =
    trueStability *
    (1 + engineConfig.stabilityGrowthRate * (1 - trueRetrievability));
  return Math.min(engineConfig.stabilityMax, grown);
}

// 'adaptive-default-prior' is the adaptive algorithm with exactly one thing
// switched off: the learner prior of 3.7.6 is never formed, so every item
// that leaves the SM-2 fallback starts from the fixed global default
// stability. Response-time statistics are still pooled across the learner's
// items. It exists only so the claim in 3.9.1 - that initialising from a
// learner prior improves on a fixed default - can be tested as a comparison
// against 'adaptive' rather than just assumed.
export type SchedulerPolicy =
  | 'adaptive'
  | 'adaptive-default-prior'
  | 'sm2-only';

// Not fixed by the thesis text (3.9.1 leaves these as "will be reported with
// the results") — agreed defaults, not derived values.
export interface DayLoopConfig {
  studyPeriodDays: number;
  testPointGapDays: number;
  convergenceToleranceBand: number;
  convergenceConsecutiveRequired: number;
  convergenceMaxReviews: number;
}

export const DEFAULT_DAY_LOOP_CONFIG: DayLoopConfig = {
  studyPeriodDays: 365,
  testPointGapDays: 30,
  convergenceToleranceBand: 0.05,
  convergenceConsecutiveRequired: 3,
  convergenceMaxReviews: 50,
};

export interface DayLoopTraceEntry {
  day: number;
  reviewIndex: number | null; // null for the test-point probe
  kind: 'review' | 'probe';
  path: SchedulingPath | null; // null for the probe and for the sm2-only policy's own bookkeeping
  correct: boolean;
  responseTimeMs: number;
  trueRetrievability: number;
  estimatedStability: number | null;
  trueStabilityAfter: number;
}

export interface DayLoopResult {
  policy: SchedulerPolicy;
  condition: SyntheticLearner['condition'];
  reviewCount: number; // during the study period only — the probe is not a review
  retentionCorrect: boolean; // outcome of the single held-out probe at the test point
  probeTrueRetrievability: number;
  convergedAtReview: number | null; // 1-based index among adaptive-path reviews; null if never
  didNotConverge: boolean; // true once convergenceMaxReviews adaptive reviews passed with no convergence
  // Whether the learner prior (3.7.6) existed at the moment this item left the
  // SM-2 fallback and had its stability initialised. true = initialised from
  // the learner's median stability; false = no other item was on the adaptive
  // path yet, so the global default was used; null = the item never reached
  // the adaptive path (or the policy is sm2-only).
  transitionUsedLearnerPrior: boolean | null;
  trace: DayLoopTraceEntry[];
}

export interface DayLoopItemInput {
  initialItem: SyntheticItemState;
  // Each item draws from its own random stream, so an item's outcomes depend
  // only on its own review history and not on how many reviews other items
  // happened to receive. This is what lets the two policies be compared on
  // identical draws (see scripts/run-simulation.ts).
  rng: Rng;
}

export interface LearnerDayLoopResult {
  results: DayLoopResult[]; // one per input item, in input order
  finalLearner: LearnerState; // the shared scheduler-side learner state at the end
}

function dateFromDay(day: number): Date {
  return new Date(Date.UTC(2026, 0, 1) + day * 24 * 60 * 60 * 1000);
}

// Everything the loop tracks for one item. The scheduler-side learner state
// is deliberately NOT in here: it belongs to the learner and is shared by
// all of that learner's items.
interface ItemRun {
  cardId: string;
  rng: Rng;
  schedulerItem: ItemState;
  trueStability: number;
  lastReviewedDay: number | null;
  dueDay: number;
  reviewCount: number;
  adaptiveReviewIndex: number;
  consecutiveWithinBand: number;
  convergedAtReview: number | null;
  didNotConverge: boolean;
  transitionUsedLearnerPrior: boolean | null;
  trace: DayLoopTraceEntry[];
}

/**
 * Simulates one synthetic learner and all of their items, under one
 * scheduling policy, as a literal day-by-day loop (thesis 3.9.1: "moved
 * through a timeline day by day... items that become due will be reviewed"),
 * followed by a single held-out retention probe per item at the test point.
 * The probe never updates scheduler or ground-truth state - it only measures.
 *
 * The learner's items share ONE scheduler-side LearnerState, as in the
 * deployed application (3.7.3, 3.7.6):
 *  - the response-time mean and spread (mu, sigma) and the count n_rt pool the
 *    correct responses from every item the learner reviews;
 *  - the learner prior S-bar is the median stability of the learner's items
 *    already on the adaptive path, recomputed after every review (3.7.8), so
 *    an item that leaves the fallback later is initialised from whatever the
 *    learner's other items have reached by then.
 * Items are all introduced on day 0 (as in the earlier one-item-at-a-time
 * version of this loop), and items due on the same day are reviewed in input
 * order, so on a day when several items leave the fallback together, the
 * earlier ones in that order are initialised first and later ones can use
 * the prior they have just helped to form.
 *
 * processReview already handles the cold-start/adaptive routing internally
 * (it returns pathUsed: 'sm2' while item.reviewCount < coldStartItemReviews),
 * so the 'adaptive' policy here always just calls processReview - this loop
 * doesn't need to replicate that branch. The 'sm2-only' baseline bypasses
 * processReview entirely and always calls applySM2 directly; it never reads
 * or writes the shared learner state, so each of its items behaves
 * independently of the others.
 */
export function simulateLearnerDayLoop(options: {
  learner: SyntheticLearner;
  items: DayLoopItemInput[];
  policy: SchedulerPolicy;
  engineConfig: EngineConfig;
  dayLoopConfig: DayLoopConfig;
}): LearnerDayLoopResult {
  const { learner, items, policy, engineConfig, dayLoopConfig } = options;

  let learnerState: LearnerState = {
    learnerId: learner.learnerId,
    meanLogResponseTime: null,
    stdLogResponseTime: null,
    logResponseTimeM2: 0,
    rtCount: 0,
    priorStability: null,
  };

  const runs: ItemRun[] = items.map(({ initialItem, rng }) => ({
    cardId: initialItem.cardId,
    rng,
    schedulerItem: createInitialItemState(
      learner.learnerId,
      initialItem.cardId,
    ),
    trueStability: initialItem.trueStability,
    lastReviewedDay: null,
    dueDay: 0, // every item is introduced, and first becomes due, on day 0
    reviewCount: 0,
    adaptiveReviewIndex: 0,
    consecutiveWithinBand: 0,
    convergedAtReview: null,
    didNotConverge: false,
    transitionUsedLearnerPrior: null,
    trace: [],
  }));

  const reviewOnce = (run: ItemRun, day: number): void => {
    const elapsedDays =
      run.lastReviewedDay === null ? 0 : day - run.lastReviewedDay;

    const generated = generateReview(
      learner,
      {
        learnerId: learner.learnerId,
        cardId: run.cardId,
        trueStability: run.trueStability,
        lastReviewedAt: null,
      },
      elapsedDays,
      {
        targetRetrievability: engineConfig.targetRetrievability,
        responseTimeConstant: engineConfig.responseTimeConstant,
      },
      run.rng,
    );

    run.reviewCount += 1;

    const event: ReviewEvent = {
      correct: generated.correct,
      responseTimeMs: generated.responseTimeMs,
      reviewedAt: dateFromDay(day),
    };

    let path: SchedulingPath;
    let estimatedStability: number | null = null;
    let nextDueDay: number;

    if (policy === 'sm2-only') {
      run.schedulerItem = applySM2(run.schedulerItem, event);
      path = 'sm2';
      nextDueDay = day + Math.max(1, run.schedulerItem.intervalDays);
    } else {
      // The transition review is the one that finds reviewCount equal to the
      // threshold; record whether a learner prior existed for it to use.
      if (
        run.schedulerItem.reviewCount === engineConfig.coldStartItemReviews &&
        run.transitionUsedLearnerPrior === null
      ) {
        run.transitionUsedLearnerPrior = learnerState.priorStability !== null;
      }

      const outcome = processReview(
        run.schedulerItem,
        learnerState,
        event,
        engineConfig,
      );
      run.schedulerItem = outcome.updatedItem;
      // Item-level values first, then learner-level (3.7.8): response-time
      // statistics come back from processReview, and the prior is recomputed
      // from every item of this learner, including the one just updated.
      learnerState =
        policy === 'adaptive-default-prior'
          ? outcome.updatedLearner // prior never formed: stays null
          : refreshPriorStability(
              outcome.updatedLearner,
              runs.map((r) => r.schedulerItem),
            );
      path = outcome.pathUsed;
      estimatedStability = run.schedulerItem.stability;

      const intervalDays =
        (outcome.nextReviewAt.getTime() - dateFromDay(day).getTime()) /
        (1000 * 60 * 60 * 24);
      nextDueDay = day + Math.max(1, Math.round(intervalDays));

      if (path === 'adaptive' && !run.didNotConverge) {
        run.adaptiveReviewIndex += 1;

        const lower =
          engineConfig.targetRetrievability -
          dayLoopConfig.convergenceToleranceBand;
        const upper =
          engineConfig.targetRetrievability +
          dayLoopConfig.convergenceToleranceBand;
        const withinBand =
          generated.trueRetrievability >= lower &&
          generated.trueRetrievability <= upper;

        if (withinBand) {
          run.consecutiveWithinBand += 1;
          if (
            run.convergedAtReview === null &&
            run.consecutiveWithinBand >=
              dayLoopConfig.convergenceConsecutiveRequired
          ) {
            run.convergedAtReview = run.adaptiveReviewIndex;
          }
        } else {
          run.consecutiveWithinBand = 0;
        }

        if (
          run.convergedAtReview === null &&
          run.adaptiveReviewIndex >= dayLoopConfig.convergenceMaxReviews
        ) {
          run.didNotConverge = true;
        }
      }
    }

    run.trueStability = applyTrueStabilityUpdate(
      run.trueStability,
      generated.trueRetrievability,
      generated.correct,
      engineConfig,
    );

    run.trace.push({
      day,
      reviewIndex: run.reviewCount,
      kind: 'review',
      path,
      correct: generated.correct,
      responseTimeMs: generated.responseTimeMs,
      trueRetrievability: generated.trueRetrievability,
      estimatedStability,
      trueStabilityAfter: run.trueStability,
    });

    run.lastReviewedDay = day;
    run.dueDay = nextDueDay;
  };

  for (let day = 0; day <= dayLoopConfig.studyPeriodDays; day++) {
    for (const run of runs) {
      if (run.dueDay > day) continue; // not due yet - nothing happens today for this item
      reviewOnce(run, day);
    }
  }

  // Retention test point: a single held-out probe per item, testPointGapDays
  // after the study period ends. Does not feed back into scheduler or
  // true-stability state.
  const testDay =
    dayLoopConfig.studyPeriodDays + dayLoopConfig.testPointGapDays;

  const results: DayLoopResult[] = runs.map((run) => {
    const elapsedAtProbe =
      run.lastReviewedDay === null ? testDay : testDay - run.lastReviewedDay;
    const probe = generateReview(
      learner,
      {
        learnerId: learner.learnerId,
        cardId: run.cardId,
        trueStability: run.trueStability,
        lastReviewedAt: null,
      },
      elapsedAtProbe,
      {
        targetRetrievability: engineConfig.targetRetrievability,
        responseTimeConstant: engineConfig.responseTimeConstant,
      },
      run.rng,
    );

    run.trace.push({
      day: testDay,
      reviewIndex: null,
      kind: 'probe',
      path: null,
      correct: probe.correct,
      responseTimeMs: probe.responseTimeMs,
      trueRetrievability: probe.trueRetrievability,
      estimatedStability: null,
      trueStabilityAfter: run.trueStability,
    });

    return {
      policy,
      condition: learner.condition,
      reviewCount: run.reviewCount,
      retentionCorrect: probe.correct,
      probeTrueRetrievability: probe.trueRetrievability,
      convergedAtReview: run.convergedAtReview,
      didNotConverge: run.didNotConverge,
      transitionUsedLearnerPrior: run.transitionUsedLearnerPrior,
      trace: run.trace,
    };
  });

  return { results, finalLearner: learnerState };
}
