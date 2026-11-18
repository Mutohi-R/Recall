import type {
  CardRecord,
  DeckSummary,
  Progress,
  QueueEntry,
} from '~~/lib/persistence/content';
import type { ImportCard } from '~~/lib/import-cards';
import { ApiError, toApiError } from '@/lib/api';

export function useApi() {
  const { $supabase } = useNuxtApp();
  const { accessToken } = useAuth();
  const endingSession = useState('api-ending-session', () => false);

  async function endSession() {
    if (endingSession.value) return;
    endingSession.value = true;
    try {
      await $supabase.auth.signOut({ scope: 'local' });
    } finally {
      endingSession.value = false;
    }
  }

  async function request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: object,
  ): Promise<T> {
    const token = accessToken.value;
    if (!token) throw new ApiError(401);
    try {
      return await $fetch<T>(`/api${path}`, {
        method,
        body,
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (e) {
      const error = toApiError(e);
      if (error.status === 401) await endSession();
      throw error;
    }
  }

  return {
    listDecks: () => request<DeckSummary[]>('GET', '/decks'),
    createDeck: (name: string) =>
      request<DeckSummary>('POST', '/decks', { name }),
    renameDeck: (id: string, name: string) =>
      request<{ ok: true }>('PATCH', `/decks/${id}`, { name }),
    deleteDeck: (id: string) => request<{ ok: true }>('DELETE', `/decks/${id}`),

    listCards: (deckId: string) =>
      request<CardRecord[]>('GET', `/decks/${deckId}/cards`),
    createCard: (deckId: string, front: string, back: string) =>
      request<CardRecord>('POST', `/decks/${deckId}/cards`, { front, back }),
    importCards: (deckId: string, cards: ImportCard[]) =>
      request<{ added: number }>('POST', `/decks/${deckId}/cards/import`, {
        cards,
      }),
    updateCard: (id: string, changes: { front?: string; back?: string }) =>
      request<{ ok: true }>('PATCH', `/cards/${id}`, changes),
    deleteCard: (id: string) => request<{ ok: true }>('DELETE', `/cards/${id}`),

    getQueue: (opts: { limit?: number; deck?: string } = {}) => {
      const query = new URLSearchParams();
      if (opts.limit) query.set('limit', String(opts.limit));
      if (opts.deck) query.set('deck', opts.deck);
      const text = query.toString();
      return request<QueueEntry[]>('GET', text ? `/queue?${text}` : '/queue');
    },
    submitReview: (review: {
      itemStateId: string;
      correct: boolean;
      responseTimeMs: number;
    }) =>
      request<{ nextReviewAt: string; intervalDays: number }>(
        'POST',
        '/reviews',
        review,
      ),

    // `tz` is the learner's time zone, so days are counted on their own clock.
    getProgress: (tz: string) =>
      request<Progress>('GET', `/progress?tz=${encodeURIComponent(tz)}`),
  };
}
