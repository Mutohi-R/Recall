import { describe, it, expect } from 'vitest';
import {
  MAX_CARD_TEXT,
  addedText,
  cardLimitMessage,
  cardRequiredMessage,
  filterCards,
  importedText,
} from './cards';

const cards = [
  { front: 'Which cranial nerve is the longest?', back: 'The vagus nerve (X)' },
  { front: 'Which nerve controls the lateral rectus muscle?', back: 'The abducens nerve (VI)' },
  { front: 'Which nerve supplies the superior oblique muscle?', back: 'The trochlear nerve (IV)' },
];

describe('filterCards', () => {
  it('keeps every card for an empty or blank search', () => {
    expect(filterCards(cards, '')).toHaveLength(3);
    expect(filterCards(cards, '   ')).toHaveLength(3);
  });

  it('matches part of the front or the back, ignoring case and outer spaces', () => {
    expect(filterCards(cards, 'LONGEST')).toEqual([cards[0]]);
    expect(filterCards(cards, ' abducens ')).toEqual([cards[1]]);
    expect(filterCards(cards, 'muscle')).toEqual([cards[1], cards[2]]);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterCards(cards, 'ulna')).toEqual([]);
  });
});

describe('card wording', () => {
  it('names the side in each message', () => {
    expect(cardRequiredMessage('front')).toBe('Front is required');
    expect(cardRequiredMessage('back')).toBe('Back is required');
    expect(cardLimitMessage('front')).toBe(`The front is limited to ${MAX_CARD_TEXT} characters.`);
    expect(cardLimitMessage('back')).toBe('The back is limited to 2000 characters.');
  });

  it('says when a card was added, with the year only for an earlier year', () => {
    const now = new Date(2026, 10, 18, 12);
    expect(addedText(new Date(2026, 10, 12, 9).toISOString(), now)).toBe('Added 12 Nov');
    expect(addedText(new Date(2025, 10, 12, 9).toISOString(), now)).toBe('Added 12 Nov 2025');
  });

  it('says how many cards an import added, and where', () => {
    expect(importedText(24, 'Cranial nerves')).toBe('24 cards added to Cranial nerves');
    expect(importedText(1, 'Anatomy')).toBe('1 card added to Anatomy');
  });
});
