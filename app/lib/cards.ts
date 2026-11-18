import type { CardRecord } from '~~/lib/persistence/content';
import { cardsLabel } from './decks';

export const MAX_CARD_TEXT = 2000;

export type CardSide = 'front' | 'back';

export function cardRequiredMessage(side: CardSide): string {
  return side === 'front' ? 'Front is required' : 'Back is required';
}

export function cardLimitMessage(side: CardSide): string {
  return `The ${side} is limited to ${MAX_CARD_TEXT} characters.`;
}

export function filterCards<T extends Pick<CardRecord, 'front' | 'back'>>(cards: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return cards;
  return cards.filter((c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q));
}

export function addedText(createdAt: string, now: Date): string {
  const d = new Date(createdAt);
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d);
  return d.getFullYear() === now.getFullYear() ? `Added ${day}` : `Added ${day} ${d.getFullYear()}`;
}

export function importedText(count: number, deckName: string): string {
  return `${cardsLabel(count)} added to ${deckName}`;
}
