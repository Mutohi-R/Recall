import { describe, it, expect } from 'vitest';
import {
  submitReview,
  validateSubmission,
  InvalidReviewError,
  NotDueError,
  MIN_RESPONSE_TIME_MS,
  MAX_RESPONSE_TIME_MS,
} from './submit-review';
import {
  ItemNotFoundError,
  ReviewConflictError,
  type ReviewContext,
  type ReviewStore,
  type ReviewWrite,
} from '../persistence/store';
import { createInitialItemState } from '../scheduling/sm2';
import { processReview } from '../scheduling/engine';
import { fittedEngineConfig } from '../scheduling/fitted-config';
import type { ItemState, LearnerState } from '../scheduling/types';

const LEARNER = 'learner-1';
const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-11-12T10:00:00Z');

function freshLearner(): LearnerState {
  return {
    learnerId: LEARNER,
    meanLogResponseTime: null,
    stdLogResponseTime: null,
    logResponseTimeM2: 0,
    rtCount: 0,
    priorStability: null,
  };
}

// An in-memory stand-in for the database that enforces the same expected-count
// check as record_review.
class FakeStore implements ReviewStore {
  items = new Map<string, { item: ItemState; dueAt: Date }>();
  learner: LearnerState = freshLearner();
  logs: ReviewWrite['log'][] = [];
  saves = 0;
  failNextSaves = 0;

  addItem(id: string, dueAt: Date = T0, item?: ItemState) {
    this.items.set(id, {
      item: item ?? createInitialItemState(LEARNER, `card-${id}`),
      dueAt,
    });
  }

  async loadForReview(
    learnerId: string,
    itemStateId: string,
  ): Promise<ReviewContext | null> {
    const entry = this.items.get(itemStateId);
    if (!entry || learnerId !== LEARNER) return null;
    const otherStabilities = [...this.items.entries()]
      .filter(([id, e]) => id !== itemStateId && e.item.stability !== null)
      .map(([, e]) => e.item.stability as number);
    return {
      itemStateId,
      item: structuredClone(entry.item),
      dueAt: entry.dueAt,
      learner: structuredClone(this.learner),
      otherStabilities,
    };
  }

  async saveReview(w: ReviewWrite): Promise<void> {
    this.saves++;
    if (this.failNextSaves > 0) {
      this.failNextSaves--;
      throw new ReviewConflictError();
    }
    const entry = this.items.get(w.itemStateId);
    if (!entry) throw new ItemNotFoundError();
    if (
      entry.item.reviewCount !== w.expectedReviewCount ||
      this.learner.rtCount !== w.expectedRtCount
    ) {
      throw new ReviewConflictError();
    }
    this.items.set(w.itemStateId, { item: w.item, dueAt: w.dueAt });
    this.learner = w.learner;
    this.logs.push(w.log);
  }
}

describe('validateSubmission', () => {
  const ok = { learnerId: LEARNER, itemStateId: 'i', correct: true, responseTimeMs: 1500 };

  it('accepts a plausible review and rounds the response time to an integer', () => {
    expect(validateSubmission({ ...ok, responseTimeMs: 1500.4 })).toEqual({
      correct: true,
      responseTimeMs: 1500,
    });
  });

  it.each([
    ['a string for correct', { correct: 'true' }],
    ['a missing correct', { correct: undefined }],
    ['a null response time', { responseTimeMs: null }],
    ['a string response time', { responseTimeMs: '1500' }],
    ['NaN', { responseTimeMs: NaN }],
    ['Infinity', { responseTimeMs: Infinity }],
    ['a negative response time', { responseTimeMs: -5 }],
    ['a response time below the minimum', { responseTimeMs: MIN_RESPONSE_TIME_MS - 1 }],
    ['a response time above the maximum', { responseTimeMs: MAX_RESPONSE_TIME_MS + 1 }],
  ])('rejects %s', (_name, override) => {
    expect(() => validateSubmission({ ...ok, ...override })).toThrow(InvalidReviewError);
  });

  it('accepts both limits exactly', () => {
    expect(() => validateSubmission({ ...ok, responseTimeMs: MIN_RESPONSE_TIME_MS })).not.toThrow();
    expect(() => validateSubmission({ ...ok, responseTimeMs: MAX_RESPONSE_TIME_MS })).not.toThrow();
  });
});

describe('submitReview', () => {
  it('schedules a first review on the SM-2 path and logs it', async () => {
    const store = new FakeStore();
    store.addItem('a');
    const res = await submitReview(
      store,
      fittedEngineConfig,
      { learnerId: LEARNER, itemStateId: 'a', correct: true, responseTimeMs: 2000 },
      T0,
    );
    expect(res.path).toBe('sm2');
    expect(res.intervalDays).toBe(1);
    expect(res.nextReviewAt.getTime()).toBe(T0.getTime() + DAY);

    const stored = store.items.get('a')!;
    expect(stored.item.reviewCount).toBe(1);
    expect(stored.dueAt.getTime()).toBe(T0.getTime() + DAY);
    expect(store.logs).toHaveLength(1);
    expect(store.logs[0]).toMatchObject({
      correct: true,
      responseTimeMs: 2000,
      elapsedDays: null,
      path: 'sm2',
      intervalAssigned: 1,
    });
    expect(store.learner.rtCount).toBe(1);
  });

  it('gives the same result as calling the engine directly, review after review', async () => {
    const store = new FakeStore();
    store.addItem('a');
    let item = createInitialItemState(LEARNER, 'card-a');
    let learner = freshLearner();
    let now = T0;
    const answers = [
      [true, 1800], [true, 1500], [false, 3000], [true, 1200],
      [true, 900], [true, 1100], [false, 2500], [true, 1000], [true, 800],
    ] as const;

    for (const [correct, rt] of answers) {
      const direct = processReview(item, learner, { correct, responseTimeMs: rt, reviewedAt: now }, fittedEngineConfig);
      const res = await submitReview(
        store,
        fittedEngineConfig,
        { learnerId: LEARNER, itemStateId: 'a', correct, responseTimeMs: rt },
        now,
      );
      expect(res.nextReviewAt.getTime()).toBe(direct.nextReviewAt.getTime());
      expect(store.items.get('a')!.item.stability).toBe(direct.updatedItem.stability);
      expect(res.path).toBe(direct.pathUsed);
      item = direct.updatedItem;
      learner = direct.updatedLearner;
      now = direct.nextReviewAt;
    }
    expect(store.logs.map((l) => l.path).slice(0, 4)).toEqual(['sm2', 'sm2', 'sm2', 'sm2']);
    expect(store.logs[4].path).toBe('adaptive');
  });

  it('records elapsed days from the second review on', async () => {
    const store = new FakeStore();
    store.addItem('a');
    await submitReview(store, fittedEngineConfig,
      { learnerId: LEARNER, itemStateId: 'a', correct: true, responseTimeMs: 1500 }, T0);
    const second = new Date(T0.getTime() + 1.5 * DAY);
    await submitReview(store, fittedEngineConfig,
      { learnerId: LEARNER, itemStateId: 'a', correct: true, responseTimeMs: 1500 }, second);
    expect(store.logs[1].elapsedDays).toBeCloseTo(1.5, 10);
  });

  it('initialises a transitioning item from the median of the learner\'s other adaptive items and refreshes the prior', async () => {
    const store = new FakeStore();
    const adaptive = (stability: number): ItemState => ({
      ...createInitialItemState(LEARNER, 'c'),
      reviewCount: 6,
      stability,
      lastReviewedAt: T0,
      intervalDays: 6,
    });
    store.addItem('x', new Date(T0.getTime() + 99 * DAY), adaptive(30));
    store.addItem('y', new Date(T0.getTime() + 99 * DAY), adaptive(90));
    // the item under review is at the transition point: n_item = 4 reviews done
    store.addItem('t', T0, {
      ...createInitialItemState(LEARNER, 'ct'),
      reviewCount: fittedEngineConfig.coldStartItemReviews,
      repetitions: 4,
      intervalDays: 15,
      lastReviewedAt: new Date(T0.getTime() - 15 * DAY),
    });
    store.learner = { ...freshLearner(), priorStability: 60 };

    const res = await submitReview(store, fittedEngineConfig,
      { learnerId: LEARNER, itemStateId: 't', correct: false, responseTimeMs: 2500 }, T0);

    expect(res.path).toBe('adaptive');
    const s = store.items.get('t')!.item.stability!;
    // a lapse from the prior (60): max(floor, lambda * 60), never above 60
    expect(s).toBe(Math.min(60, Math.max(fittedEngineConfig.stabilityFloor, fittedEngineConfig.lapseFactor * 60)));
    // prior is now the median of 30, 90 and the new stability
    const sorted = [30, 90, s].sort((a, b) => a - b);
    expect(store.learner.priorStability).toBe(sorted[1]);
  });

  it('refuses an item that is not due and writes nothing', async () => {
    const store = new FakeStore();
    store.addItem('a', new Date(T0.getTime() + 1000));
    await expect(
      submitReview(store, fittedEngineConfig,
        { learnerId: LEARNER, itemStateId: 'a', correct: true, responseTimeMs: 1500 }, T0),
    ).rejects.toThrow(NotDueError);
    expect(store.saves).toBe(0);
  });

  it('treats an item due exactly now as eligible', async () => {
    const store = new FakeStore();
    store.addItem('a', T0);
    await expect(
      submitReview(store, fittedEngineConfig,
        { learnerId: LEARNER, itemStateId: 'a', correct: true, responseTimeMs: 1500 }, T0),
    ).resolves.toBeDefined();
  });

  it('refuses an unknown item and another learner\'s item', async () => {
    const store = new FakeStore();
    store.addItem('a');
    await expect(
      submitReview(store, fittedEngineConfig,
        { learnerId: LEARNER, itemStateId: 'nope', correct: true, responseTimeMs: 1500 }, T0),
    ).rejects.toThrow(ItemNotFoundError);
    await expect(
      submitReview(store, fittedEngineConfig,
        { learnerId: 'someone-else', itemStateId: 'a', correct: true, responseTimeMs: 1500 }, T0),
    ).rejects.toThrow(ItemNotFoundError);
  });

  it('rejects invalid input before touching the store', async () => {
    const store = new FakeStore();
    store.addItem('a');
    await expect(
      submitReview(store, fittedEngineConfig,
        { learnerId: LEARNER, itemStateId: 'a', correct: 1, responseTimeMs: 1500 }, T0),
    ).rejects.toThrow(InvalidReviewError);
    expect(store.saves).toBe(0);
  });

  it('rejects a review dated before the item\'s previous review', async () => {
    const store = new FakeStore();
    store.addItem('a', T0, {
      ...createInitialItemState(LEARNER, 'ca'),
      reviewCount: 1,
      repetitions: 1,
      intervalDays: 1,
      lastReviewedAt: new Date(T0.getTime() + DAY),
    });
    await expect(
      submitReview(store, fittedEngineConfig,
        { learnerId: LEARNER, itemStateId: 'a', correct: true, responseTimeMs: 1500 }, T0),
    ).rejects.toThrow(InvalidReviewError);
    expect(store.saves).toBe(0);
  });

  it('retries from a fresh read after a conflict', async () => {
    const store = new FakeStore();
    store.addItem('a');
    store.failNextSaves = 2;
    await submitReview(store, fittedEngineConfig,
      { learnerId: LEARNER, itemStateId: 'a', correct: true, responseTimeMs: 1500 }, T0);
    expect(store.saves).toBe(3);
    expect(store.items.get('a')!.item.reviewCount).toBe(1);
    expect(store.logs).toHaveLength(1);
  });

  it('gives up after repeated conflicts', async () => {
    const store = new FakeStore();
    store.addItem('a');
    store.failNextSaves = 10;
    await expect(
      submitReview(store, fittedEngineConfig,
        { learnerId: LEARNER, itemStateId: 'a', correct: true, responseTimeMs: 1500 }, T0),
    ).rejects.toThrow(ReviewConflictError);
    expect(store.saves).toBe(3);
    expect(store.logs).toHaveLength(0);
  });

  it('a second submission for the same review is processed against the new state, not the old one', async () => {
    const store = new FakeStore();
    store.addItem('a');
    await submitReview(store, fittedEngineConfig,
      { learnerId: LEARNER, itemStateId: 'a', correct: true, responseTimeMs: 1500 }, T0);
    // the item is now due a day later, so the repeat is refused rather than counted twice
    await expect(
      submitReview(store, fittedEngineConfig,
        { learnerId: LEARNER, itemStateId: 'a', correct: true, responseTimeMs: 1500 }, T0),
    ).rejects.toThrow(NotDueError);
    expect(store.logs).toHaveLength(1);
  });
});
