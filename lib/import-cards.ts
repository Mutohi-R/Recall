import { MAX_CARD_TEXT_LENGTH } from './validation';

// a JSON list of cards, each with a
// front and a back. It returns the cleaned cards, or the problem in words the
// learner can act on. The Import dialog uses it to show what is wrong before
// anything is sent, and the server can use it again so the same rules apply on
// both sides.

export const MAX_IMPORT_CARDS = 500;

export interface ImportCard {
  front: string;
  back: string;
}

export interface ImportProblem {
  title: string;
  lines: string[];
}

export type ImportParse =
  | { ok: true; cards: ImportCard[] }
  | { ok: false; problem: ImportProblem };

const MAX_PROBLEM_LINES = 5;

export function cardCountText(n: number): string {
  return n === 1 ? '1 card' : `${n} cards`;
}

// The line of a JSON syntax error
function errorLine(error: unknown, text: string): number | undefined {
  const message = error instanceof Error ? error.message : '';
  const direct = /\(line (\d+) column \d+\)|at line (\d+) column/.exec(message);
  if (direct) return Number(direct[1] ?? direct[2]);
  const at = /position (\d+)/.exec(message);
  if (at) return text.slice(0, Number(at[1])).split('\n').length;
  return undefined;
}

function cardProblems(value: unknown, n: number): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [`Card ${n} is not an object with a front and a back.`];
  }
  const card = value as Record<string, unknown>;
  const lines: string[] = [];
  for (const side of ['front', 'back'] as const) {
    const text = card[side];
    if (text === undefined || text === null) {
      lines.push(`Card ${n} has no ${side}.`);
    } else if (typeof text !== 'string') {
      lines.push(`Card ${n}: the ${side} must be text.`);
    } else if (text.trim() === '') {
      lines.push(`Card ${n} has no ${side}.`);
    } else if (text.trim().length > MAX_CARD_TEXT_LENGTH) {
      lines.push(
        `Card ${n}: the ${side} is longer than ${MAX_CARD_TEXT_LENGTH} characters.`,
      );
    }
  }
  return lines;
}

export function parseImportCards(text: string): ImportParse {
  if (text.trim() === '') {
    return {
      ok: false,
      problem: {
        title: 'There is nothing to import',
        lines: ['Paste a list of cards or choose a .json file.'],
      },
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const line = errorLine(e, text);
    return {
      ok: false,
      problem: {
        title: 'The text is not valid JSON',
        lines: [
          line === undefined
            ? 'Check for a missing comma or bracket.'
            : `Check for a missing comma or bracket near line ${line}.`,
        ],
      },
    };
  }

  return checkImportCards(data);
}

// The same checks on data that is already parsed, for the server, which gets
// the list inside a JSON request body.
export function checkImportCards(data: unknown): ImportParse {
  if (!Array.isArray(data)) {
    return {
      ok: false,
      problem: {
        title: 'The JSON is not a list of cards',
        lines: [
          'Start with [ and end with ], with one { "front", "back" } object for each card.',
        ],
      },
    };
  }
  if (data.length === 0) {
    return {
      ok: false,
      problem: {
        title: 'The list has no cards',
        lines: ['Add at least one card with a front and a back.'],
      },
    };
  }
  if (data.length > MAX_IMPORT_CARDS) {
    return {
      ok: false,
      problem: {
        title: 'The list has too many cards',
        lines: [
          `Import up to ${MAX_IMPORT_CARDS} cards at a time. This list has ${data.length}.`,
        ],
      },
    };
  }

  const problems: string[] = [];
  let badCards = 0;
  data.forEach((value, i) => {
    const found = cardProblems(value, i + 1);
    if (found.length > 0) badCards += 1;
    problems.push(...found);
  });

  if (badCards > 0) {
    const shown = problems.slice(0, MAX_PROBLEM_LINES);
    const hidden = problems.length - shown.length;
    return {
      ok: false,
      problem: {
        title: `${cardCountText(badCards)} cannot be imported`,
        lines: [
          ...shown,
          ...(hidden > 0 ? [`And ${hidden} more.`] : []),
          'Fix these in the JSON, then import again.',
        ],
      },
    };
  }

  return {
    ok: true,
    cards: (data as { front: string; back: string }[]).map((c) => ({
      front: c.front.trim(),
      back: c.back.trim(),
    })),
  };
}

export function importProblemMessage(problem: ImportProblem): string {
  return `${problem.title}: ${problem.lines.join(' ')}`;
}