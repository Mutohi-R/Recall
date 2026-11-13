import type { SupabaseClient } from '@supabase/supabase-js';

// Deck, card and queue access for a signed-in learner. The client passed in
// carries the learner's own token and the publishable key, so Row Level
// Security decides which rows are visible or writable (3.8); nothing here
// filters by owner on its own account.

export interface DeckSummary {
  id: string;
  name: string;
  createdAt: string;
  cardCount: number;
}

export interface CardRecord {
  id: string;
  deckId: string;
  front: string;
  back: string;
  createdAt: string;
}

export interface QueueEntry {
  itemStateId: string;
  dueAt: string;
  card: { id: string; deckId: string; front: string; back: string };
}

// Thrown when a row the caller asked for is missing or not theirs. The two
// cases are deliberately indistinguishable.
export class NotFoundError extends Error {
  constructor() {
    super('not found');
    this.name = 'NotFoundError';
  }
}

function fail(error: { message: string; code?: string }): never {
  // 42501 is insufficient_privilege: a row-level policy refused the write.
  if (error.code === '42501') throw new NotFoundError();
  throw error;
}

export async function listDecks(
  client: SupabaseClient,
): Promise<DeckSummary[]> {
  const { data, error } = await client
    .from('decks')
    .select('id, name, created_at, cards(count)')
    .is('archived_at', null)
    .is('cards.archived_at', null)
    .order('created_at', { ascending: true });
  if (error) fail(error);
  return (data ?? []).map((d: any) => ({
    id: d.id,
    name: d.name,
    createdAt: d.created_at,
    cardCount: d.cards?.[0]?.count ?? 0,
  }));
}

export async function createDeck(
  client: SupabaseClient,
  learnerId: string,
  name: string,
): Promise<DeckSummary> {
  const { data, error } = await client
    .from('decks')
    .insert({ learner_id: learnerId, name })
    .select('id, name, created_at')
    .single();
  if (error) fail(error);
  return {
    id: data!.id,
    name: data!.name,
    createdAt: data!.created_at,
    cardCount: 0,
  };
}

export async function renameDeck(
  client: SupabaseClient,
  deckId: string,
  name: string,
): Promise<void> {
  const { data, error } = await client
    .from('decks')
    .update({ name })
    .eq('id', deckId)
    .is('archived_at', null)
    .select('id');
  if (error) fail(error);
  if (!data || data.length === 0) throw new NotFoundError();
}

function cardFromRow(r: any): CardRecord {
  return {
    id: r.id,
    deckId: r.deck_id,
    front: r.front,
    back: r.back,
    createdAt: r.created_at,
  };
}

export async function listCards(
  client: SupabaseClient,
  deckId: string,
): Promise<CardRecord[]> {
  const deck = await client
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .maybeSingle();
  if (deck.error) fail(deck.error);
  if (!deck.data) throw new NotFoundError();

  const { data, error } = await client
    .from('cards')
    .select('id, deck_id, front, back, created_at')
    .eq('deck_id', deckId)
    .is('archived_at', null)
    .order('created_at', { ascending: true });
  if (error) fail(error);
  return (data ?? []).map(cardFromRow);
}

export async function createCard(
  client: SupabaseClient,
  deckId: string,
  front: string,
  back: string,
): Promise<CardRecord> {
  const { data, error } = await client
    .from('cards')
    .insert({ deck_id: deckId, front, back })
    .select('id, deck_id, front, back, created_at')
    .single();
  if (error) fail(error);
  return cardFromRow(data);
}

export async function updateCard(
  client: SupabaseClient,
  cardId: string,
  changes: { front?: string; back?: string },
): Promise<void> {
  const { data, error } = await client
    .from('cards')
    .update(changes)
    .eq('id', cardId)
    .is('archived_at', null)
    .select('id');
  if (error) fail(error);
  if (!data || data.length === 0) throw new NotFoundError();
}

// Deleting a deck or card archives it: the row is hidden from every list and
// from the queue, but it stays in the database so the learner's review logs
// and item states are kept (3.8). Archiving a deck archives its cards too, in
// a database trigger. A row that is already archived counts as not found.
export async function archiveDeck(
  client: SupabaseClient,
  deckId: string,
  now: Date,
): Promise<void> {
  const { data, error } = await client
    .from('decks')
    .update({ archived_at: now.toISOString() })
    .eq('id', deckId)
    .is('archived_at', null)
    .select('id');
  if (error) fail(error);
  if (!data || data.length === 0) throw new NotFoundError();
}

export async function archiveCard(
  client: SupabaseClient,
  cardId: string,
  now: Date,
): Promise<void> {
  const { data, error } = await client
    .from('cards')
    .update({ archived_at: now.toISOString() })
    .eq('id', cardId)
    .is('archived_at', null)
    .select('id');
  if (error) fail(error);
  if (!data || data.length === 0) throw new NotFoundError();
}

// Items due now or earlier, oldest due first, leaving out archived cards. A
// card is due from the moment it is created (the card trigger gives it a due
// time just before now).
export async function getQueue(
  client: SupabaseClient,
  now: Date,
  limit: number,
): Promise<QueueEntry[]> {
  const { data, error } = await client
    .from('item_states')
    .select('id, due_at, cards!inner(id, deck_id, front, back)')
    .is('cards.archived_at', null)
    .lte('due_at', now.toISOString())
    .order('due_at', { ascending: true })
    .limit(limit);
  if (error) fail(error);
  return (data ?? []).map((r: any) => ({
    itemStateId: r.id,
    dueAt: r.due_at,
    card: {
      id: r.cards.id,
      deckId: r.cards.deck_id,
      front: r.cards.front,
      back: r.cards.back,
    },
  }));
}
