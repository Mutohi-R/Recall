import { describe, it, expect } from 'vitest';
import { ApiError, apiErrorMessage, toApiError } from './api';

describe('toApiError', () => {
  it('reads the status and the server text from a fetch error', () => {
    const e = toApiError({
      statusCode: 400,
      data: { message: 'Deck name is required' },
    });
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(400);
    expect(e.message).toBe('Deck name is required');
  });

  it('falls back to the status line, then to the response status', () => {
    expect(
      toApiError({ statusCode: 404, statusMessage: 'Not found' }).message,
    ).toBe('Not found');
    expect(toApiError({ response: { status: 409 } }).status).toBe(409);
  });

  it('treats an error with no status as a lost connection', () => {
    expect(toApiError(new TypeError('Failed to fetch')).status).toBe(0);
    expect(toApiError(undefined).status).toBe(0);
  });

  it('returns an ApiError unchanged', () => {
    const original = new ApiError(401);
    expect(toApiError(original)).toBe(original);
  });
});

describe('apiErrorMessage', () => {
  it('shows the server text for a rejected input', () => {
    expect(
      apiErrorMessage({
        statusCode: 400,
        data: { message: 'cards must be a list' },
      }),
    ).toBe('cards must be a list');
    expect(apiErrorMessage({ statusCode: 400 })).toMatch(/could not be saved/);
  });

  it('has its own wording for each other kind of failure', () => {
    expect(apiErrorMessage(new ApiError(0))).toMatch(
      /Could not reach the server/,
    );
    expect(apiErrorMessage(new ApiError(401))).toMatch(/session has expired/);
    expect(apiErrorMessage(new ApiError(404))).toMatch(/could not be found/);
    expect(apiErrorMessage(new ApiError(409))).toMatch(/Something changed/);
    expect(apiErrorMessage(new ApiError(500))).toMatch(/our side/);
    expect(apiErrorMessage(new ApiError(418))).toMatch(/Something went wrong/);
  });

  it('never shows a database or server message for a server fault', () => {
    expect(
      apiErrorMessage({
        statusCode: 500,
        data: { message: 'relation "decks" does not exist' },
      }),
    ).not.toMatch(/relation/);
  });
});
