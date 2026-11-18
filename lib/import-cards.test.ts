import { describe, it, expect } from 'vitest';
import {
  parseImportCards,
  checkImportCards,
  importProblemMessage,
  cardCountText,
  MAX_IMPORT_CARDS,
} from './import-cards';
import { MAX_CARD_TEXT_LENGTH } from './validation';

function problem(text: string) {
  const result = parseImportCards(text);
  if (result.ok) throw new Error('expected a problem');
  return result.problem;
}

describe('parseImportCards', () => {
  it('accepts a list of cards and trims them', () => {
    const result = parseImportCards(
      JSON.stringify([
        { front: '  Which nerve? ', back: ' The facial nerve (VII) ' },
        { front: 'Q2', back: 'A2', extra: 'ignored' },
      ]),
    );
    expect(result).toEqual({
      ok: true,
      cards: [
        { front: 'Which nerve?', back: 'The facial nerve (VII)' },
        { front: 'Q2', back: 'A2' },
      ],
    });
  });

  it('accepts text at exactly the limit and refuses one character more', () => {
    const edge = 'a'.repeat(MAX_CARD_TEXT_LENGTH);
    expect(
      parseImportCards(JSON.stringify([{ front: edge, back: 'b' }])).ok,
    ).toBe(true);
    const p = problem(JSON.stringify([{ front: edge + 'a', back: 'b' }]));
    expect(p.lines[0]).toBe(
      `Card 1: the front is longer than ${MAX_CARD_TEXT_LENGTH} characters.`,
    );
  });

  it('says there is nothing to import for empty text', () => {
    expect(problem('').title).toBe('There is nothing to import');
    expect(problem('  \n ').title).toBe('There is nothing to import');
  });

  it('points to the line of a syntax error', () => {
    const text = [
      '[',
      '  {',
      '    "front": "Q1",',
      '    "back": "A1"',
      '  }',
      '  {',
      '    "front": "Q2",',
      '    "back": "A2"',
      '  }',
      ']',
    ].join('\n');
    const p = problem(text);
    expect(p.title).toBe('The text is not valid JSON');
    expect(p.lines[0]).toMatch(
      /^Check for a missing comma or bracket( near line 6)?\.$/,
    );
  });

  it('refuses JSON that is not a list, or is an empty list', () => {
    expect(problem('{"front":"a","back":"b"}').title).toBe(
      'The JSON is not a list of cards',
    );
    expect(problem('"text"').title).toBe('The JSON is not a list of cards');
    expect(problem('[]').title).toBe('The list has no cards');
  });

  it('refuses a list longer than the import limit', () => {
    const cards = Array.from({ length: MAX_IMPORT_CARDS + 1 }, () => ({
      front: 'a',
      back: 'b',
    }));
    const p = problem(JSON.stringify(cards));
    expect(p.title).toBe('The list has too many cards');
    expect(p.lines[0]).toContain(`${MAX_IMPORT_CARDS + 1}`);
    expect(
      parseImportCards(JSON.stringify(cards.slice(0, MAX_IMPORT_CARDS))).ok,
    ).toBe(true);
  });

  it('names each bad card and counts the cards, not the problems', () => {
    const cards = [
      { front: 'Q1', back: 'A1' },
      { front: 'Q2' },
      ...Array.from({ length: 4 }, () => ({ front: 'Q', back: 'A' })),
      { front: 'a'.repeat(MAX_CARD_TEXT_LENGTH + 1), back: 'A7' },
    ];
    const p = problem(JSON.stringify(cards));
    expect(p.title).toBe('2 cards cannot be imported');
    expect(p.lines).toEqual([
      'Card 2 has no back.',
      `Card 7: the front is longer than ${MAX_CARD_TEXT_LENGTH} characters.`,
      'Fix these in the JSON, then import again.',
    ]);
  });

  it('uses the singular for one bad card and lists both sides of a card', () => {
    const p = problem(JSON.stringify([{ front: ' ', back: 3 }]));
    expect(p.title).toBe('1 card cannot be imported');
    expect(p.lines.slice(0, 2)).toEqual([
      'Card 1 has no front.',
      'Card 1: the back must be text.',
    ]);
  });

  it('reports cards that are not objects', () => {
    const p = problem(JSON.stringify([null, 'text', ['a', 'b'], 5]));
    expect(p.title).toBe('4 cards cannot be imported');
    expect(p.lines[0]).toBe('Card 1 is not an object with a front and a back.');
  });

  it('shows the first problems in full and counts the rest', () => {
    const cards = Array.from({ length: 10 }, () => ({ front: 'Q' }));
    const p = problem(JSON.stringify(cards));
    expect(p.title).toBe('10 cards cannot be imported');
    expect(p.lines).toHaveLength(7);
    expect(p.lines[5]).toBe('And 5 more.');
    expect(p.lines[6]).toBe('Fix these in the JSON, then import again.');
  });
});

describe('cardCountText', () => {
  it('uses the singular for one', () => {
    expect(cardCountText(1)).toBe('1 card');
    expect(cardCountText(0)).toBe('0 cards');
    expect(cardCountText(24)).toBe('24 cards');
  });
});

describe('checkImportCards', () => {
  it('applies the same rules to data that is already parsed', () => {
    expect(checkImportCards([{ front: ' Q ', back: 'A' }])).toEqual({
      ok: true,
      cards: [{ front: 'Q', back: 'A' }],
    });
    for (const bad of [undefined, null, 'text', 5, {}, [], [{ front: 'Q' }]]) {
      expect(checkImportCards(bad).ok).toBe(false);
    }
  });

  it('turns a problem into one line for an error message', () => {
    const result = checkImportCards([{ front: 'Q' }]);
    if (result.ok) throw new Error('expected a problem');
    expect(importProblemMessage(result.problem)).toBe(
      '1 card cannot be imported: Card 1 has no back. Fix these in the JSON, then import again.',
    );
  });
});