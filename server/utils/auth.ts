import type { H3Event } from 'h3';

export interface AuthedLearner {
  id: string;
  token: string;
}

// Verifies the bearer token with Supabase authentication and returns the
// learner it belongs to. The learner id used everywhere else comes from here,
// never from the request body or URL.
export async function requireLearner(event: H3Event): Promise<AuthedLearner> {
  const header = getRequestHeader(event, 'authorization') ?? '';
  const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in required' });
  }
  const { data, error } = await anonClient(event).auth.getUser(token);
  if (error || !data.user) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in required' });
  }
  return { id: data.user.id, token };
}
