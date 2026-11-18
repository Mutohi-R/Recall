export const RESEND_SECONDS = 60;

export type SignInReason = 'expired' | 'link' | 'google';

export const SIGN_IN_NOTICES: Record<SignInReason, string> = {
  expired: 'Your session has expired. Sign in again to continue.',
  link: 'That sign-in link has expired or was already used. Request a new one.',
  google:
    'Google sign-in did not finish. Try again, or use an email link instead.',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

interface AuthErrorLike {
  status?: number;
  code?: string;
  name?: string;
}

export function isRateLimited(error: AuthErrorLike): boolean {
  return (
    error.status === 429 ||
    error.code === 'over_email_send_rate_limit' ||
    error.code === 'over_request_rate_limit'
  );
}

export function sendLinkErrorMessage(error: AuthErrorLike): string {
  if (isRateLimited(error)) {
    return 'Too many sign-in links were requested. Wait a minute, then try again.';
  }
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return 'The sign-in link could not be sent. Try again in a moment.';
}

export function reasonFromCallback(
  error: string | undefined,
  errorCode: string | undefined,
): SignInReason | undefined {
  if (!error) return undefined;
  return errorCode === 'otp_expired' ? 'link' : 'google';
}
