import type { DeckSummary } from '~~/lib/persistence/content';
import { toApiError } from './api';

export function cardsLabel(count: number): string {
  return count === 1 ? '1 card' : `${count} cards`;
}

export interface DueSummary {
  title: string;
  detail: string;
  canStart: boolean;
}

export function dueSummary(decks: Pick<DeckSummary, 'dueCount'>[]): DueSummary {
  const total = decks.reduce((sum, d) => sum + d.dueCount, 0);
  if (total === 0) {
    return {
      title: 'Nothing due',
      detail: 'You are caught up. Cards you add show up here straight away.',
      canStart: false,
    };
  }
  const withDue = decks.filter((d) => d.dueCount > 0).length;
  return {
    title: `${total} ${total === 1 ? 'card' : 'cards'} due`,
    detail: `Across ${withDue} ${withDue === 1 ? 'deck' : 'decks'}. The oldest come first.`,
    canStart: true,
  };
}

function loadErrorText(error: unknown, what: string): string {
  return toApiError(error).status === 0
    ? 'Recall could not reach the server. Check your connection, then try again. Your cards are safe.'
    : `Recall could not load ${what}. Try again in a moment. Your cards are safe.`;
}

export const deckListErrorText = (error: unknown) =>
  loadErrorText(error, 'your decks');
export const deckErrorText = (error: unknown) =>
  loadErrorText(error, 'this deck');

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function nextDueText(
  nextDueAt: string | null,
  now: Date,
): string | null {
  if (!nextDueAt) return null;
  const days = Math.round(
    (startOfDay(new Date(nextDueAt)) - startOfDay(now)) / 86_400_000,
  );
  if (days <= 0) return 'later today';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

export function caughtUpText(nextDueAt: string | null, now: Date): string {
  const when = nextDueText(nextDueAt, now);
  return when
    ? `You are caught up with this deck. Its next cards are due ${when}.`
    : 'You are caught up with this deck.';
}
