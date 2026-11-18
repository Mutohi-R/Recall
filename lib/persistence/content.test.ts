import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCards, NotFoundError } from './content';

// A stand-in for the Supabase client that records what is inserted into cards.
function fakeClient(result: { data?: unknown; error?: unknown }) {
  const inserted: any[][] = [];
  const client = {
    from: (table: string) => {
      expect(table).toBe('cards');
      return {
        insert: (rows: any[]) => {
          inserted.push(rows);
          return { select: async () => result };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, inserted };
}

describe('createCards', () => {
  it('inserts every card in one call, in order, and returns the count', async () => {
    const { client, inserted } = fakeClient({
      data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    });
    const now = new Date('2026-11-18T10:00:00.000Z');
    const added = await createCards(
      client,
      'deck-1',
      [
        { front: 'Q1', back: 'A1' },
        { front: 'Q2', back: 'A2' },
        { front: 'Q3', back: 'A3' },
      ],
      now,
    );
    expect(added).toBe(3);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].map((r) => r.front)).toEqual(['Q1', 'Q2', 'Q3']);
    expect(inserted[0].every((r) => r.deck_id === 'deck-1')).toBe(true);
    const times = inserted[0].map((r) => Date.parse(r.created_at));
    expect(times).toEqual([times[0], times[0] + 1, times[0] + 2]);
    expect(times[0]).toBe(now.getTime());
  });

  it('reports a refused insert (row-level policy) as not found', async () => {
    const { client } = fakeClient({
      error: { message: 'denied', code: '42501' },
    });
    await expect(
      createCards(client, 'deck-1', [{ front: 'Q', back: 'A' }]),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('passes any other database error on', async () => {
    const { client } = fakeClient({
      error: { message: 'boom', code: '08006' },
    });
    await expect(
      createCards(client, 'deck-1', [{ front: 'Q', back: 'A' }]),
    ).rejects.toMatchObject({ message: 'boom' });
  });
});
