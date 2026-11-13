import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { H3Event } from 'h3';

// The publishable key identifies the project and is safe to expose, but
// requests made with it only reach what Row Level Security allows. The secret
// key bypasses RLS and exists only on the server (3.3.2, 3.8).
function config(event: H3Event) {
  const c = useRuntimeConfig(event);
  if (!c.supabaseUrl || !c.supabasePublishableKey) {
    throw createError({ statusCode: 500, statusMessage: 'Server is not configured' });
  }
  return c;
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };

export function anonClient(event: H3Event): SupabaseClient {
  const c = config(event);
  return createClient(c.supabaseUrl, c.supabasePublishableKey, options);
}

// A client that acts as the signed-in learner: RLS applies to every query.
export function learnerClient(event: H3Event, token: string): SupabaseClient {
  const c = config(event);
  return createClient(c.supabaseUrl, c.supabasePublishableKey, {
    ...options,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// Used only to store the results of a review, after the server has
// validated the submission and run the scheduling engine.
export function serviceClient(event: H3Event): SupabaseClient {
  const c = config(event);
  if (!c.supabaseSecretKey) {
    throw createError({ statusCode: 500, statusMessage: 'Server is not configured' });
  }
  return createClient(c.supabaseUrl, c.supabaseSecretKey, options);
}
