import { deckColour } from './deck-colours';

export const CHART = {
  ink: '#1b1b1f',
  grid: '#e7e1d3',
  muted: '#5e5e66',
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  sans: "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif",
  dot: deckColour(1).fill,
  curve: {
    stronger: deckColour(7).fill,
    typical: deckColour(8).fill,
    weaker: deckColour(6).fill,
  },
} as const;
