import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  requireUuid,
  requireDeckName,
  requireCardText,
  parseQueueLimit,
  requireObject,
  MAX_DECK_NAME_LENGTH,
  MAX_CARD_TEXT_LENGTH,
  DEFAULT_QUEUE_LIMIT,
  MAX_QUEUE_LIMIT,
} from './validation';

describe('validation', () => {
  it('accepts a UUID and refuses anything else', () => {
    const id = '22222222-2222-4222-8222-222222222222';
    expect(requireUuid(id, 'id')).toBe(id);
    for (const bad of ['x', '', undefined, null, 5, `${id}0`, "1' or '1'='1"]) {
      expect(() => requireUuid(bad, 'id')).toThrow(ValidationError);
    }
  });

  it('trims deck names and refuses empty or over-long ones', () => {
    expect(requireDeckName('  Biology ')).toBe('Biology');
    expect(() => requireDeckName('   ')).toThrow(ValidationError);
    expect(() => requireDeckName(42)).toThrow(ValidationError);
    expect(requireDeckName('a'.repeat(MAX_DECK_NAME_LENGTH))).toHaveLength(MAX_DECK_NAME_LENGTH);
    expect(() => requireDeckName('a'.repeat(MAX_DECK_NAME_LENGTH + 1))).toThrow(ValidationError);
  });

  it('applies the same rules to card text', () => {
    expect(requireCardText(' Q ', 'front')).toBe('Q');
    expect(() => requireCardText('', 'back')).toThrow(ValidationError);
    expect(() => requireCardText('a'.repeat(MAX_CARD_TEXT_LENGTH + 1), 'back')).toThrow(ValidationError);
  });

  it('defaults the queue limit and bounds it', () => {
    expect(parseQueueLimit(undefined)).toBe(DEFAULT_QUEUE_LIMIT);
    expect(parseQueueLimit('7')).toBe(7);
    expect(parseQueueLimit(String(MAX_QUEUE_LIMIT))).toBe(MAX_QUEUE_LIMIT);
    for (const bad of ['0', '-1', '1.5', 'abc', String(MAX_QUEUE_LIMIT + 1)]) {
      expect(() => parseQueueLimit(bad)).toThrow(ValidationError);
    }
  });

  it('requires a JSON object body', () => {
    expect(requireObject({ a: 1 })).toEqual({ a: 1 });
    for (const bad of [null, undefined, 'x', 3, [1]]) {
      expect(() => requireObject(bad)).toThrow(ValidationError);
    }
  });
});
