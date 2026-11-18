import { describe, it, expect } from 'vitest';
import { ApiError } from './api';
import {
  MAX_RESPONSE_TIME_MS,
  MIN_RESPONSE_TIME_MS,
  ReviewTimer,
  afterFailedAnswer,
  answerNotSavedText,
  clampResponseTime,
  dueCount,
  moreDueText,
  progressPercent,
  progressText,
  recalledPercent,
  resultToastText,
  reviewLoadErrorText,
  sessionEnding,
} from './review';
import * as server from '../../lib/services/submit-review';

describe('response time limits', () => {
  it('match the limits the server enforces', () => {
    expect(MIN_RESPONSE_TIME_MS).toBe(server.MIN_RESPONSE_TIME_MS);
    expect(MAX_RESPONSE_TIME_MS).toBe(server.MAX_RESPONSE_TIME_MS);
  });

  it('clamps and rounds', () => {
    expect(clampResponseTime(1234.6)).toBe(1235);
    expect(clampResponseTime(40)).toBe(200);
    expect(clampResponseTime(0)).toBe(200);
    expect(clampResponseTime(10 * 60 * 1000)).toBe(300_000);
    expect(clampResponseTime(NaN)).toBe(300_000);
  });
});

describe('ReviewTimer', () => {
  function fake() {
    let t = 1000;
    return { now: () => t, advance: (ms: number) => (t += ms) };
  }

  it('counts from start to stop', () => {
    const c = fake();
    const timer = new ReviewTimer(c.now);
    timer.start();
    c.advance(2500);
    expect(timer.stop()).toBe(2500);
  });

  it('does not count paused time', () => {
    const c = fake();
    const timer = new ReviewTimer(c.now);
    timer.start();
    c.advance(1000);
    timer.pause();
    c.advance(60_000);
    timer.resume();
    c.advance(500);
    expect(timer.stop()).toBe(1500);
  });

  it('start begins again from zero', () => {
    const c = fake();
    const timer = new ReviewTimer(c.now);
    timer.start();
    c.advance(900);
    timer.stop();
    timer.start();
    c.advance(300);
    expect(timer.stop()).toBe(300);
  });

  it('does not run again after stop, even if resumed', () => {
    const c = fake();
    const timer = new ReviewTimer(c.now);
    timer.start();
    c.advance(400);
    expect(timer.stop()).toBe(400);
    timer.resume();
    c.advance(5000);
    expect(timer.stop()).toBe(400);
  });
});

describe('progress and result wording', () => {
  it('numbers the cards and fills the bar with the answered share', () => {
    expect(progressText(4, 12)).toBe('Card 4 of 12');
    expect(progressPercent(3, 12)).toBe(25);
    expect(progressPercent(0, 12)).toBe(0);
    expect(progressPercent(12, 12)).toBe(100);
    expect(progressPercent(0, 0)).toBe(0);
  });

  it('says when the next review is', () => {
    const now = new Date(2026, 10, 18, 10, 0);
    const days = (n: number) => new Date(2026, 10, 18 + n, 10, 0).toISOString();
    expect(resultToastText(true, days(4), now)).toBe('Got it. Next review in 4 days');
    expect(resultToastText(false, days(1), now)).toBe('Missed it. Next review tomorrow');
    expect(resultToastText(false, new Date(2026, 10, 18, 10, 10).toISOString(), now)).toBe(
      'Missed it. Next review later today',
    );
  });
});

describe('session ending', () => {
  it('reads as in Figma when every card was reviewed', () => {
    const t = { got: 9, missed: 3, total: 12 };
    expect(recalledPercent(t)).toBe(75);
    expect(sessionEnding(t, false)).toEqual({
      title: 'Session complete',
      summary: 'You reviewed 12 cards.',
      note: '75% recalled. Cards you missed will come back sooner than they would have.',
    });
  });

  it('leaves out the missed-cards sentence when nothing was missed', () => {
    expect(sessionEnding({ got: 1, missed: 0, total: 1 }, false)).toEqual({
      title: 'Session complete',
      summary: 'You reviewed 1 card.',
      note: '100% recalled.',
    });
  });

  it('says what is still due when ended early', () => {
    expect(sessionEnding({ got: 4, missed: 1, total: 12 }, true)).toEqual({
      title: 'Session ended',
      summary: 'You reviewed 5 of 12 cards.',
      note: '80% recalled. The 7 cards you did not review are still due.',
    });
    expect(sessionEnding({ got: 1, missed: 0, total: 2 }, true).note).toBe(
      '100% recalled. The 1 card you did not review is still due.',
    );
  });
});

describe('more cards due after a session', () => {
  it('adds the count to a finished session only', () => {
    expect(sessionEnding({ got: 9, missed: 3, total: 12 }, false, 5).note).toBe(
      '75% recalled. Cards you missed will come back sooner than they would have. 5 more cards are due.',
    );
    expect(sessionEnding({ got: 1, missed: 0, total: 1 }, false, 1).note).toBe('100% recalled. 1 more card is due.');
    expect(sessionEnding({ got: 4, missed: 1, total: 12 }, true, 90).note).toBe(
      '80% recalled. The 7 cards you did not review are still due.',
    );
  });

  it('words the count', () => {
    expect(moreDueText(1)).toBe('1 more card is due.');
    expect(moreDueText(80)).toBe('80 more cards are due.');
  });

  it('sums the due cards of every deck, or of one', () => {
    const decks = [
      { id: 'a', dueCount: 12 },
      { id: 'b', dueCount: 30 },
    ];
    expect(dueCount(decks)).toBe(42);
    expect(dueCount(decks, 'b')).toBe(30);
    expect(dueCount(decks, 'zzz')).toBe(0);
  });
});

describe('failures', () => {
  it('words a failed load and a failed answer by cause', () => {
    expect(reviewLoadErrorText(new ApiError(0))).toContain('Check your connection');
    expect(reviewLoadErrorText(new ApiError(500))).toContain('Try again in a moment');
    expect(answerNotSavedText(new ApiError(0))).toBe(
      'Your answer was not saved. Check your connection, then try again.',
    );
    expect(answerNotSavedText(new ApiError(500))).toBe('Your answer was not saved. Try again in a moment.');
  });

  it('skips a card that can never be accepted and retries the rest', () => {
    expect(afterFailedAnswer(new ApiError(404, 'Not found'))).toBe('skip');
    expect(afterFailedAnswer(new ApiError(409, 'Item is not due for review'))).toBe('skip');
    expect(afterFailedAnswer(new ApiError(409, 'Please try again'))).toBe('retry');
    expect(afterFailedAnswer(new ApiError(0))).toBe('retry');
    expect(afterFailedAnswer(new ApiError(500))).toBe('retry');
  });
});
