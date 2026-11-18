import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ValidationError } from '../validation';
import { getProgress, listCards } from './content';

function fakeClient(total: number, cap: number, deckExists = true) {
  const rows = Array.from({ length: total }, (_, i) => ({
    id: `c${String(i).padStart(5, '0')}`,
    deck_id: 'd1',
    front: `front ${i}`,
    back: `back ${i}`,
    created_at: new Date(2026, 10, 1, 0, 0, 0, i).toISOString(),
  }));
  const ranges: [number, number][] = [];
  const client = {
    from(table: string) {
      if (table === 'decks') {
        const q: any = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({
            data: deckExists ? { id: 'd1' } : null,
            error: null,
          }),
        };
        return q;
      }
      const q: any = {
        select: () => q,
        eq: () => q,
        is: () => q,
        order: () => q,
        range: async (from: number, to: number) => {
          ranges.push([from, to]);
          return {
            data: rows.slice(from, Math.min(to + 1, from + cap)),
            error: null,
          };
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { client, ranges };
}

describe('listCards', () => {
  it('returns every card of a deck bigger than one page', async () => {
    const { client, ranges } = fakeClient(2500, 1000);
    const cards = await listCards(client, 'd1', 1000);
    expect(cards).toHaveLength(2500);
    expect(new Set(cards.map((c) => c.id)).size).toBe(2500);
    expect(cards[0].front).toBe('front 0');
    expect(cards[2499].front).toBe('front 2499');
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('asks once for a deck smaller than a page', async () => {
    const { client, ranges } = fakeClient(3, 1000);
    expect(await listCards(client, 'd1', 1000)).toHaveLength(3);
    expect(ranges).toHaveLength(1);
  });

  it('makes one extra request when the last page is exactly full, and stops', async () => {
    const { client, ranges } = fakeClient(2000, 1000);
    expect(await listCards(client, 'd1', 1000)).toHaveLength(2000);
    expect(ranges).toHaveLength(3);
  });

  it('returns an empty list for an empty deck', async () => {
    const { client } = fakeClient(0, 1000);
    expect(await listCards(client, 'd1', 1000)).toEqual([]);
  });

  it('maps rows to cards', async () => {
    const { client } = fakeClient(1, 1000);
    const [card] = await listCards(client, 'd1', 1000);
    expect(card).toEqual({
      id: 'c00000',
      deckId: 'd1',
      front: 'front 0',
      back: 'back 0',
      createdAt: new Date(2026, 10, 1, 0, 0, 0, 0).toISOString(),
    });
  });

  it('throws not found when the deck is not there', async () => {
    const { client } = fakeClient(5, 1000, false);
    await expect(listCards(client, 'd1', 1000)).rejects.toThrow();
  });
});

describe('getProgress', () => {
  it('asks the database for both sets of numbers with the same time and zone', async () => {
    const calls: [string, unknown][] = [];
    const client = {
      rpc: async (name: string, args: unknown) => {
        calls.push([name, args]);
        return { data: { from: name }, error: null };
      },
    } as unknown as SupabaseClient;
    const now = new Date('2026-11-18T20:00:00Z');
    const progress = await getProgress(client, now, 'Africa/Lagos');
    expect(calls.map((c) => c[0]).sort()).toEqual([
      'progress_activity',
      'progress_memory',
    ]);
    for (const [, args] of calls) {
      expect(args).toEqual({
        p_now: '2026-11-18T20:00:00.000Z',
        p_tz: 'Africa/Lagos',
      });
    }
    expect(progress).toEqual({
      activity: { from: 'progress_activity' },
      memory: { from: 'progress_memory' },
    });
  });

  it('turns an unknown time zone from the database into a validation error', async () => {
    const client = {
      rpc: async () => ({
        data: null,
        error: { message: 'unknown time zone', code: '22023' },
      }),
    } as unknown as SupabaseClient;
    await expect(
      getProgress(client, new Date(), 'Mars/Olympus'),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('passes any other database error on', async () => {
    const client = {
      rpc: async () => ({
        data: null,
        error: { message: 'boom', code: 'XX000' },
      }),
    } as unknown as SupabaseClient;
    await expect(getProgress(client, new Date(), 'UTC')).rejects.toMatchObject({
      message: 'boom',
    });
  });
});
