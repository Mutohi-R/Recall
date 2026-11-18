import { toApiError } from './api';
import { cardsLabel, nextDueText } from './decks';

export const SESSION_SIZE = 20;

export const MIN_RESPONSE_TIME_MS = 200;
export const MAX_RESPONSE_TIME_MS = 5 * 60 * 1000;

export function clampResponseTime(ms: number): number {
  if (!Number.isFinite(ms)) return MAX_RESPONSE_TIME_MS;
  return Math.min(MAX_RESPONSE_TIME_MS, Math.max(MIN_RESPONSE_TIME_MS, Math.round(ms)));
}

export class ReviewTimer {
  private startedAt: number | null = null;
  private elapsed = 0;
  private active = false;

  constructor(private readonly now: () => number = () => performance.now()) {}

  start(): void {
    this.elapsed = 0;
    this.active = true;
    this.startedAt = this.now();
  }

  pause(): void {
    if (this.startedAt === null) return;
    this.elapsed += this.now() - this.startedAt;
    this.startedAt = null;
  }

  resume(): void {
    if (this.active && this.startedAt === null) this.startedAt = this.now();
  }

  stop(): number {
    this.pause();
    this.active = false;
    return this.elapsed;
  }
}

export function progressText(position: number, total: number): string {
  return `Card ${position} of ${total}`;
}

export function progressPercent(answered: number, total: number): number {
  return total > 0 ? Math.round((answered / total) * 100) : 0;
}

export function resultToastText(correct: boolean, nextReviewAt: string, now: Date): string {
  const when = nextDueText(nextReviewAt, now) ?? 'later today';
  return `${correct ? 'Got it' : 'Missed it'}. Next review ${when}`;
}

export interface SessionTally {
  got: number;
  missed: number;
  total: number;
}

export function recalledPercent(t: SessionTally): number {
  const reviewed = t.got + t.missed;
  return reviewed > 0 ? Math.round((t.got / reviewed) * 100) : 0;
}

export interface SessionEnding {
  title: string;
  summary: string;
  note: string;
}

export function dueCount(decks: { id: string; dueCount: number }[], deckId?: string): number {
  return decks.filter((d) => !deckId || d.id === deckId).reduce((sum, d) => sum + d.dueCount, 0);
}

export function moreDueText(n: number): string {
  return `${n} more ${n === 1 ? 'card is' : 'cards are'} due.`;
}

export function sessionEnding(t: SessionTally, endedEarly: boolean, moreDue = 0): SessionEnding {
  const reviewed = t.got + t.missed;
  const percent = `${recalledPercent(t)}% recalled.`;
  if (!endedEarly) {
    return {
      title: 'Session complete',
      summary: `You reviewed ${cardsLabel(reviewed)}.`,
      note: [
        percent,
        t.missed > 0 ? 'Cards you missed will come back sooner than they would have.' : '',
        moreDue > 0 ? moreDueText(moreDue) : '',
      ]
        .filter(Boolean)
        .join(' '),
    };
  }
  const left = t.total - reviewed;
  return {
    title: 'Session ended',
    summary: `You reviewed ${reviewed} of ${cardsLabel(t.total)}.`,
    note: `${percent} The ${cardsLabel(left)} you did not review ${left === 1 ? 'is' : 'are'} still due.`,
  };
}

export function reviewLoadErrorText(error: unknown): string {
  return toApiError(error).status === 0
    ? 'Recall could not reach the server. Check your connection, then try again.'
    : 'Recall could not load your cards for review. Try again in a moment.';
}

export function answerNotSavedText(error: unknown): string {
  return toApiError(error).status === 0
    ? 'Your answer was not saved. Check your connection, then try again.'
    : 'Your answer was not saved. Try again in a moment.';
}

export function afterFailedAnswer(error: unknown): 'skip' | 'retry' {
  const e = toApiError(error);
  if (e.status === 404) return 'skip';
  if (e.status === 409 && /not due/i.test(e.message)) return 'skip';
  return 'retry';
}
