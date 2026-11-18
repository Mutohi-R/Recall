import type { SupabaseClient } from '@supabase/supabase-js';
import { ValidationError } from '../validation';

export interface DeckSummary {
  id: string;
  name: string;
  colour: number;
  createdAt: string;
  cardCount: number;
  dueCount: number;
  nextDueAt: string | null;
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
  card: {
    id: string;
    deckId: string;
    deckColour: number;
    front: string;
    back: string;
  };
}

export class NotFoundError extends Error {
  constructor() {
    super('not found');
    this.name = 'NotFoundError';
  }
}

function fail(error: { message: string; code?: string }): never {
  if (error.code === '42501') throw new NotFoundError();
  if (error.code === '22023')
    throw new ValidationError('tz is not a known time zone');
  throw error;
}

export async function listDecks(
  client: SupabaseClient,
  now: Date,
): Promise<DeckSummary[]> {
  const { data, error } = await client.rpc('deck_summaries', {
    p_now: now.toISOString(),
  });
  if (error) fail(error);
  return (data ?? []).map((d: any) => ({
    id: d.id,
    name: d.name,
    colour: d.colour,
    createdAt: d.created_at,
    cardCount: d.card_count,
    dueCount: d.due_count,
    nextDueAt: d.next_due_at ?? null,
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
    .select('id, name, colour, created_at')
    .single();
  if (error) fail(error);
  return {
    id: data!.id,
    name: data!.name,
    colour: data!.colour,
    createdAt: data!.created_at,
    cardCount: 0,
    dueCount: 0,
    nextDueAt: null,
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

export const CARD_PAGE_SIZE = 1000;

export async function listCards(
  client: SupabaseClient,
  deckId: string,
  pageSize: number = CARD_PAGE_SIZE,
): Promise<CardRecord[]> {
  const deck = await client
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .maybeSingle();
  if (deck.error) fail(deck.error);
  if (!deck.data) throw new NotFoundError();

  const cards: CardRecord[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('cards')
      .select('id, deck_id, front, back, created_at')
      .eq('deck_id', deckId)
      .is('archived_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) fail(error);
    const page = data ?? [];
    cards.push(...page.map(cardFromRow));
    if (page.length < pageSize) break;
  }
  return cards;
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

export async function createCards(
  client: SupabaseClient,
  deckId: string,
  cards: { front: string; back: string }[],
  now: Date = new Date(),
): Promise<number> {
  const start = now.getTime();
  const rows = cards.map((c, i) => ({
    deck_id: deckId,
    front: c.front,
    back: c.back,
    created_at: new Date(start + i).toISOString(),
  }));
  const { data, error } = await client.from('cards').insert(rows).select('id');
  if (error) fail(error);
  return data?.length ?? 0;
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

export async function getQueue(
  client: SupabaseClient,
  now: Date,
  limit: number,
  deckId?: string,
): Promise<QueueEntry[]> {
  let query = client
    .from('item_states')
    .select(
      'id, due_at, cards!inner(id, deck_id, front, back, decks!inner(colour))',
    )
    .is('cards.archived_at', null)
    .lte('due_at', now.toISOString());
  if (deckId) query = query.eq('cards.deck_id', deckId);
  const { data, error } = await query
    .order('due_at', { ascending: true })
    .limit(limit);
  if (error) fail(error);
  return (data ?? []).map((r: any) => ({
    itemStateId: r.id,
    dueAt: r.due_at,
    card: {
      id: r.cards.id,
      deckId: r.cards.deck_id,
      deckColour: r.cards.decks.colour,
      front: r.cards.front,
      back: r.cards.back,
    },
  }));
}

// ---------------------------------------------------------------- progress

export interface ProgressDeck {
  id: string;
  name: string;
  colour: number;
  archived: boolean;
}

export interface ProgressActivity {
  today: string;
  totalReviews: number;
  week: { reviews: number; recalled: number };
  newCards: number;
  daily: { day: string; deckId: string; count: number }[];
  stages: { new: number; learning: number; young: number; mature: number };
  // offset 0 is today and also holds every card that is overdue
  due: { offset: number; deckId: string; count: number }[];
  decks: ProgressDeck[];
}

export interface ProgressMemory {
  cards: number;
  adaptive: number;
  mostReviews: number;
  stability: { p25: number; median: number; p75: number } | null;
  rtCount: number;
  paceSeconds: number | null;
  dailyTime: { day: string; seconds: number }[];
  gaps: { n: number; days: number; count: number }[];
}

export interface Progress {
  activity: ProgressActivity;
  memory: ProgressMemory;
}

export async function getProgress(
  client: SupabaseClient,
  now: Date,
  tz: string,
): Promise<Progress> {
  const args = { p_now: now.toISOString(), p_tz: tz };
  const [activity, memory] = await Promise.all([
    client.rpc('progress_activity', args),
    client.rpc('progress_memory', args),
  ]);
  if (activity.error) fail(activity.error);
  if (memory.error) fail(memory.error);
  return {
    activity: activity.data as ProgressActivity,
    memory: memory.data as ProgressMemory,
  };
}
