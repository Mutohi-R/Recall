import { describe, it, expect } from 'vitest';
import {
  RESEND_SECONDS,
  SIGN_IN_NOTICES,
  isRateLimited,
  isValidEmail,
  reasonFromCallback,
  sendLinkErrorMessage,
} from './auth';

describe('isValidEmail', () => {
  it('accepts an ordinary address, with or without spaces around it', () => {
    expect(isValidEmail('you@example.com')).toBe(true);
    expect(isValidEmail('  amara.o@mail.example.edu.ng ')).toBe(true);
  });

  it('refuses addresses that are missing a part', () => {
    for (const bad of [
      '',
      'amara',
      'amara@example',
      '@example.com',
      'amara@.com',
      'a b@example.com',
      'a@@example.com',
    ]) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });
});

describe('sendLinkErrorMessage', () => {
  it('says to wait when the limit was reached', () => {
    for (const error of [
      { status: 429 },
      { code: 'over_email_send_rate_limit' },
      { code: 'over_request_rate_limit' },
    ]) {
      expect(isRateLimited(error)).toBe(true);
      expect(sendLinkErrorMessage(error)).toMatch(/Wait a minute/);
    }
  });

  it('says the server could not be reached when there is no connection', () => {
    expect(
      sendLinkErrorMessage({ name: 'AuthRetryableFetchError', status: 0 }),
    ).toMatch(/Could not reach/);
  });

  it('falls back to a plain message for anything else', () => {
    expect(isRateLimited({ status: 500 })).toBe(false);
    expect(sendLinkErrorMessage({ status: 500 })).toBe(
      'The sign-in link could not be sent. Try again in a moment.',
    );
  });
});

describe('reasonFromCallback', () => {
  it('reports an expired link, another error as Google, and no error as nothing', () => {
    expect(reasonFromCallback('access_denied', 'otp_expired')).toBe('link');
    expect(reasonFromCallback('access_denied', undefined)).toBe('google');
    expect(reasonFromCallback(undefined, undefined)).toBeUndefined();
  });
});

describe('sign-in wording', () => {
  it('has a message for every reason and a 60-second wait', () => {
    expect(Object.keys(SIGN_IN_NOTICES).sort()).toEqual([
      'expired',
      'google',
      'link',
    ]);
    expect(RESEND_SECONDS).toBe(60);
  });
});
