// Input checks shared by the API routes. Each returns the cleaned value or
// throws ValidationError, which the routes report as a 400.

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const MAX_DECK_NAME_LENGTH = 100;
export const MAX_CARD_TEXT_LENGTH = 2000;
export const MAX_QUEUE_LIMIT = 100;
export const DEFAULT_QUEUE_LIMIT = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new ValidationError(`${field} must be a valid id`);
  }
  return value;
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be text`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new ValidationError(`${field} must not be empty`);
  if (trimmed.length > max) {
    throw new ValidationError(`${field} must be at most ${max} characters`);
  }
  return trimmed;
}

export function requireDeckName(value: unknown): string {
  return requireText(value, 'name', MAX_DECK_NAME_LENGTH);
}

export function requireCardText(value: unknown, field: 'front' | 'back'): string {
  return requireText(value, field, MAX_CARD_TEXT_LENGTH);
}

export function parseQueueLimit(value: unknown): number {
  if (value === undefined || value === '') return DEFAULT_QUEUE_LIMIT;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_QUEUE_LIMIT) {
    throw new ValidationError(`limit must be a whole number from 1 to ${MAX_QUEUE_LIMIT}`);
  }
  return n;
}

export function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('request body must be a JSON object');
  }
  return value as Record<string, unknown>;
}
