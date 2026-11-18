import { describe, it, expect } from 'vitest';
import { errorPageContent } from './errors';

describe('errorPageContent', () => {
  it('words a missing page', () => {
    expect(errorPageContent(404)).toEqual({
      digits: ['4', '0', '4'],
      title: 'We could not find that page',
      body: 'The link may be wrong, or the deck was deleted.',
    });
  });

  it('puts another status code on the cards', () => {
    expect(errorPageContent(500).digits).toEqual(['5', '0', '0']);
    expect(errorPageContent(403).digits).toEqual(['4', '0', '3']);
    expect(errorPageContent(500).title).toBe('Something went wrong');
  });

  it('falls back to 500 when there is no three-digit status', () => {
    expect(errorPageContent(undefined).digits).toEqual(['5', '0', '0']);
    expect(errorPageContent(0).digits).toEqual(['5', '0', '0']);
    expect(errorPageContent(12345).digits).toEqual(['5', '0', '0']);
  });
});
