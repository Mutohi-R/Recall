export const DECK_COLOURS = [
  { name: 'butter', fill: '#ffe08a' },
  { name: 'lilac', fill: '#cfc4ff' },
  { name: 'sky', fill: '#bfdfff' },
  { name: 'peach', fill: '#ffc9a3' },
  { name: 'orchid', fill: '#f4bee3' },
  { name: 'lime', fill: '#ddeb9a' },
  { name: 'butter-deep', fill: '#e0be4d' },
  { name: 'lilac-deep', fill: '#ada1ec' },
  { name: 'sky-deep', fill: '#93bfe7' },
  { name: 'peach-deep', fill: '#e6a575' },
  { name: 'orchid-deep', fill: '#dc98c8' },
  { name: 'lime-deep', fill: '#b7cb63' },
] as const;

export type DeckColour = (typeof DECK_COLOURS)[number];

// An index outside 0 to 11 wraps around instead of failing.
export function deckColour(index: number): DeckColour {
  const n = DECK_COLOURS.length;
  return DECK_COLOURS[((Math.trunc(index) % n) + n) % n]!;
}
