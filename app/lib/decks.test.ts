import { describe, it, expect } from 'vitest';
import { ApiError } from './api';
import {
  cardsLabel,
  caughtUpText,
  deckErrorText,
  deckListErrorText,
  dueSummary,
  nextDueText,
} from './decks';

describe('cardsLabel', () => {
  it('uses the singular for one card only', () => {
    expect(cardsLabel(0)).toBe('0 cards');
    expect(cardsLabel(1)).toBe('1 card');
    expect(cardsLabel(24)).toBe('24 cards');
  });
});

describe('dueSummary', () => {
  it('adds up the due cards and counts the decks they are in', () => {
    const s = dueSummary([
      { dueCount: 12 },
      { dueCount: 5 },
      { dueCount: 0 },
      { dueCount: 0 },
    ]);
    expect(s).toEqual({
      title: '17 cards due',
      detail: 'Across 2 decks. The oldest come first.',
      canStart: true,
    });
  });

  it('uses the singular for one card in one deck', () => {
    const s = dueSummary([{ dueCount: 1 }, { dueCount: 0 }]);
    expect(s.title).toBe('1 card due');
    expect(s.detail).toBe('Across 1 deck. The oldest come first.');
  });

  it('says nothing is due, and hides the button, when no deck has due cards or there are no decks', () => {
    for (const decks of [[], [{ dueCount: 0 }, { dueCount: 0 }]]) {
      const s = dueSummary(decks);
      expect(s.title).toBe('Nothing due');
      expect(s.canStart).toBe(false);
    }
  });
});

describe('deckListErrorText', () => {
  it('names the connection when the server could not be reached', () => {
    expect(deckListErrorText(new ApiError(0))).toMatch(
      /could not reach the server/,
    );
  });

  it('gives a general message for a server fault, never its own text', () => {
    const text = deckListErrorText(
      new ApiError(500, 'relation "decks" does not exist'),
    );
    expect(text).toMatch(/could not load your decks/);
    expect(text).not.toMatch(/relation/);
  });

  it('always says the cards are safe', () => {
    expect(deckListErrorText(new ApiError(0))).toMatch(/Your cards are safe/);
    expect(deckListErrorText(new ApiError(503))).toMatch(/Your cards are safe/);
  });
});

describe('nextDueText', () => {
  // Local times, so the tests hold in any time zone.
  const now = new Date(2026, 10, 18, 14, 30);
  const at = (days: number, hour = 9) =>
    new Date(2026, 10, 18 + days, hour, 0).toISOString();

  it('says later today for a time on the same day', () => {
    expect(nextDueText(at(0, 23), now)).toBe('later today');
  });

  it('counts calendar days, not hours', () => {
    expect(nextDueText(at(1, 9), now)).toBe('tomorrow');
    expect(nextDueText(at(1, 23), now)).toBe('tomorrow');
    expect(nextDueText(at(2, 0), now)).toBe('in 2 days');
    expect(nextDueText(at(13), now)).toBe('in 13 days');
  });

  it('moves to weeks, then months, for longer waits', () => {
    expect(nextDueText(at(14), now)).toBe('in 2 weeks');
    expect(nextDueText(at(30), now)).toBe('in 4 weeks');
    expect(nextDueText(at(59), now)).toBe('in 8 weeks');
    expect(nextDueText(at(60), now)).toBe('in 2 months');
    expect(nextDueText(at(200), now)).toBe('in 7 months');
  });

  it('has nothing to say without a time', () => {
    expect(nextDueText(null, now)).toBeNull();
  });
});

describe('caughtUpText', () => {
  const now = new Date(2026, 10, 18, 14, 30);
  it('adds when the next cards are due', () => {
    expect(caughtUpText(new Date(2026, 10, 19, 9).toISOString(), now)).toBe(
      'You are caught up with this deck. Its next cards are due tomorrow.',
    );
  });
  it('stops after the first sentence when there is no next time', () => {
    expect(caughtUpText(null, now)).toBe('You are caught up with this deck.');
  });
});

describe('deckErrorText', () => {
  it('words the single-deck page the same way as the list', () => {
    expect(deckErrorText(new ApiError(0))).toBe(
      deckListErrorText(new ApiError(0)),
    );
    expect(deckErrorText(new ApiError(500))).toMatch(
      /could not load this deck/,
    );
  });
});
