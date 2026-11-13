// Walks one review through the running app, end to end.
//
//   1. start the app:   pnpm dev
//   2. in another terminal:   node --env-file=.env scripts/smoke-api.mjs
//
// It asks for the email and password of the test account, signs in, then:
// creates a deck and a card, checks the card is in the queue, submits a
// review, checks the card has left the queue, and checks a repeat is refused.
// Nothing is stored; the password is not written anywhere.
import readline from 'node:readline/promises';

const SUPABASE_URL = process.env.NUXT_SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.NUXT_SUPABASE_PUBLISHABLE_KEY;
const BASE = process.env.APP_URL ?? 'http://localhost:3000';

if (!SUPABASE_URL || !PUBLISHABLE_KEY) {
  console.error('Run with: node --env-file=.env scripts/smoke-api.mjs');
  process.exit(1);
}

let email = process.env.SMOKE_EMAIL;
let password = process.env.SMOKE_PASSWORD;
if (!email || !password) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  email = (await rl.question('Test account email: ')).trim();
  password = await rl.question('Test account password (shown as you type): ');
  rl.close();
}

let failed = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!ok) failed++;
}

async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
    if (res.status >= 400)
      console.log(`      server said: ${json?.statusMessage ?? res.status}`);
  return { status: res.status, json };
}

// 1. Sign in directly with Supabase, the way the browser will.
const auth = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: PUBLISHABLE_KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const authJson = await auth.json();
check('sign in', auth.ok && !!authJson.access_token, auth.ok ? '' : (authJson.msg ?? authJson.error_description ?? auth.status));
if (!authJson.access_token) process.exit(1);
const token = authJson.access_token;

// 2. The API must refuse a request with no token.
check('no token is refused (401)', (await call('GET', '/api/queue')).status === 401);

// 3. Create a deck and a card.
const deck = await call('POST', '/api/decks', token, { name: 'Smoke test deck' });
check('create deck (201)', deck.status === 201 && !!deck.json?.id, `status ${deck.status}`);
if (!deck.json?.id) process.exit(1);

const card = await call('POST', `/api/decks/${deck.json.id}/cards`, token, { front: '2 + 2', back: '4' });
check('create card (201)', card.status === 201 && !!card.json?.id, `status ${card.status}`);
if (!card.json?.id) process.exit(1);

// 4. The new card should be due straight away.
const queue1 = await call('GET', '/api/queue?limit=50', token);
const entry = Array.isArray(queue1.json) ? queue1.json.find((q) => q.card.id === card.json.id) : null;
check('new card is in the queue', !!entry, `status ${queue1.status}`);
if (!entry) process.exit(1);

// 5. Submit a review.
const review = await call('POST', '/api/reviews', token, {
  itemStateId: entry.itemStateId, correct: true, responseTimeMs: 1500,
});
check('submit review (200)', review.status === 200 && !!review.json?.nextReviewAt, `status ${review.status}`);
if (review.status === 200) {
  const days = review.json.intervalDays;
  check('first review is scheduled 1 day out (SM-2 fallback)', Math.abs(days - 1) < 1e-9, `intervalDays ${days}`);
  check('reply does not expose stability or path', !('stability' in review.json) && !('path' in review.json));
}

// 6. The card should now be gone from the queue.
const queue2 = await call('GET', '/api/queue?limit=50', token);
check('card has left the queue', Array.isArray(queue2.json) && !queue2.json.some((q) => q.card.id === card.json.id));

// 7. Reviewing it again straight away must be refused (not due).
const again = await call('POST', '/api/reviews', token, {
  itemStateId: entry.itemStateId, correct: true, responseTimeMs: 1500,
});
check('repeat review is refused (409)', again.status === 409, `status ${again.status}`);

// 8. Bad input and a forbidden method.
const bad = await call('POST', '/api/reviews', token, { itemStateId: entry.itemStateId, correct: 'yes', responseTimeMs: 1500 });
check('bad input is refused (400)', bad.status === 400, `status ${bad.status}`);
const del = await call('DELETE', `/api/decks/${deck.json.id}`, token);
check('deleting a deck is not allowed (405)', del.status === 405, `status ${del.status}`);

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
