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
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  email = (await rl.question('Test account email: ')).trim();
  password = await rl.question('Test account password (shown as you type): ');
  rl.close();
}

let failed = 0;
function check(label, ok, detail = '') {
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`,
  );
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
  try {
    json = await res.json();
  } catch {
    /* not JSON */
  }
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
const serverDate = auth.headers.get('date');
if (serverDate)
  console.log(
    `      clock offset vs Supabase: ${Date.now() - Date.parse(serverDate)} ms (negative = your clock is behind)`,
  );
check(
  'sign in',
  auth.ok && !!authJson.access_token,
  auth.ok ? '' : (authJson.msg ?? authJson.error_description ?? auth.status),
);
if (!authJson.access_token) process.exit(1);
const token = authJson.access_token;

// 2. The API must refuse a request with no token.
check(
  'no token is refused (401)',
  (await call('GET', '/api/queue')).status === 401,
);

// 3. Create a deck and a card.
const deck = await call('POST', '/api/decks', token, {
  name: 'Smoke test deck',
});
check(
  'create deck (201)',
  deck.status === 201 && !!deck.json?.id,
  `status ${deck.status}`,
);
if (!deck.json?.id) process.exit(1);
check(
  'deck has a colour from 0 to 11',
  Number.isInteger(deck.json.colour) &&
    deck.json.colour >= 0 &&
    deck.json.colour <= 11,
  `colour ${deck.json.colour}`,
);

const card = await call('POST', `/api/decks/${deck.json.id}/cards`, token, {
  front: '2 + 2',
  back: '4',
});
check(
  'create card (201)',
  card.status === 201 && !!card.json?.id,
  `status ${card.status}`,
);
if (!card.json?.id) process.exit(1);

// 4. The new card should be due straight away.
const queue1 = await call('GET', '/api/queue?limit=50', token);
const entry = Array.isArray(queue1.json)
  ? queue1.json.find((q) => q.card.id === card.json.id)
  : null;
check(
  'new card is in the queue',
  !!entry,
  `status ${queue1.status}, ${Array.isArray(queue1.json) ? queue1.json.length + ' entries' : 'not a list'}`,
);
if (!entry) process.exit(1);

// 4b. The queue can be limited to one deck.
const other = await call('POST', '/api/decks', token, {
  name: 'Smoke queue filter',
});
const otherCard = await call(
  'POST',
  `/api/decks/${other.json?.id}/cards`,
  token,
  { front: 'x', back: 'y' },
);
const queueThis = await call(
  'GET',
  `/api/queue?limit=50&deck=${deck.json.id}`,
  token,
);
const queueOther = await call(
  'GET',
  `/api/queue?limit=50&deck=${other.json?.id}`,
  token,
);
check(
  "queue for one deck holds only that deck's cards",
  Array.isArray(queueThis.json) &&
    queueThis.json.length > 0 &&
    queueThis.json.every((q) => q.card.deckId === deck.json.id) &&
    Array.isArray(queueOther.json) &&
    queueOther.json.length === 1 &&
    queueOther.json[0].card.id === otherCard.json?.id,
  `this ${queueThis.json?.length}, other ${queueOther.json?.length}`,
);
check(
  'a bad deck id on the queue is refused (400)',
  (await call('GET', '/api/queue?deck=nope', token)).status === 400,
);
await call('DELETE', `/api/decks/${other.json?.id}`, token);

// 5. Submit a review.
const review = await call('POST', '/api/reviews', token, {
  itemStateId: entry.itemStateId,
  correct: true,
  responseTimeMs: 1500,
});
check(
  'submit review (200)',
  review.status === 200 && !!review.json?.nextReviewAt,
  `status ${review.status}`,
);
if (review.status === 200) {
  const days = review.json.intervalDays;
  check(
    'first review is scheduled 1 day out (SM-2 fallback)',
    Math.abs(days - 1) < 1e-9,
    `intervalDays ${days}`,
  );
  check(
    'reply does not expose stability or path',
    !('stability' in review.json) && !('path' in review.json),
  );
}

// 6. The card should now be gone from the queue.
const queue2 = await call('GET', '/api/queue?limit=50', token);
check(
  'card has left the queue',
  Array.isArray(queue2.json) &&
    !queue2.json.some((q) => q.card.id === card.json.id),
);

// 6b. The deck now waits for the reviewed card, so it reports when that is.
const afterReview = await call('GET', '/api/decks', token);
const reviewedDeck = Array.isArray(afterReview.json)
  ? afterReview.json.find((d) => d.id === deck.json.id)
  : null;
const hoursAhead = reviewedDeck?.nextDueAt
  ? (Date.parse(reviewedDeck.nextDueAt) - Date.now()) / 3600000
  : null;
check(
  'deck reports when its next card falls due (about a day on)',
  hoursAhead !== null &&
    hoursAhead > 23 &&
    hoursAhead < 25 &&
    reviewedDeck.dueCount === 0,
  `nextDueAt ${reviewedDeck?.nextDueAt}, dueCount ${reviewedDeck?.dueCount}`,
);

// 7. Reviewing it again straight away must be refused (not due).
const again = await call('POST', '/api/reviews', token, {
  itemStateId: entry.itemStateId,
  correct: true,
  responseTimeMs: 1500,
});
check(
  'repeat review is refused (409)',
  again.status === 409,
  `status ${again.status}`,
);

// 8. Bad input and a forbidden method.
const bad = await call('POST', '/api/reviews', token, {
  itemStateId: entry.itemStateId,
  correct: 'yes',
  responseTimeMs: 1500,
});
check('bad input is refused (400)', bad.status === 400, `status ${bad.status}`);
check(
  'an unsupported method is refused (405)',
  (await call('PUT', '/api/queue', token)).status === 405,
);

// 9. Deleting a card archives it: it leaves the lists and the queue, and can no
// longer be reviewed, but the rows are kept.
const card2 = await call('POST', `/api/decks/${deck.json.id}/cards`, token, {
  front: '3 + 3',
  back: '6',
});
const card3 = await call('POST', `/api/decks/${deck.json.id}/cards`, token, {
  front: '4 + 4',
  back: '8',
});
check('create two more cards', card2.status === 201 && card3.status === 201);
const deckList1 = await call('GET', '/api/decks', token);
const listed1 = Array.isArray(deckList1.json)
  ? deckList1.json.find((d) => d.id === deck.json.id)
  : null;
check(
  'deck shows 3 cards',
  listed1?.cardCount === 3,
  `cardCount ${listed1?.cardCount}`,
);
check(
  'deck shows 2 cards due',
  listed1?.dueCount === 2,
  `dueCount ${listed1?.dueCount}`,
);

const queue3 = await call('GET', '/api/queue?limit=50', token);
const entry2 = Array.isArray(queue3.json)
  ? queue3.json.find((q) => q.card.id === card2.json.id)
  : null;
check('second card is in the queue', !!entry2);

const delCard = await call('DELETE', `/api/cards/${card2.json.id}`, token);
check(
  'delete (archive) a card (200)',
  delCard.status === 200,
  `status ${delCard.status}`,
);
const queue4 = await call('GET', '/api/queue?limit=50', token);
check(
  'archived card has left the queue',
  Array.isArray(queue4.json) &&
    !queue4.json.some((q) => q.card.id === card2.json.id),
);
const cards1 = await call('GET', `/api/decks/${deck.json.id}/cards`, token);
check(
  'archived card is not listed',
  Array.isArray(cards1.json) &&
    cards1.json.length === 2 &&
    !cards1.json.some((c) => c.id === card2.json.id),
);
const deckList2 = await call('GET', '/api/decks', token);
const listed2 = Array.isArray(deckList2.json)
  ? deckList2.json.find((d) => d.id === deck.json.id)
  : null;
check(
  'deck now shows 2 cards',
  listed2?.cardCount === 2,
  `cardCount ${listed2?.cardCount}`,
);
check(
  'deck now shows 1 card due',
  listed2?.dueCount === 1,
  `dueCount ${listed2?.dueCount}`,
);
if (entry2) {
  const reviewArchived = await call('POST', '/api/reviews', token, {
    itemStateId: entry2.itemStateId,
    correct: true,
    responseTimeMs: 1500,
  });
  check(
    'reviewing an archived card is refused (404)',
    reviewArchived.status === 404,
    `status ${reviewArchived.status}`,
  );
}
check(
  'archiving the same card again is 404',
  (await call('DELETE', `/api/cards/${card2.json.id}`, token)).status === 404,
);
check(
  'editing an archived card is 404',
  (await call('PATCH', `/api/cards/${card2.json.id}`, token, { front: 'x' }))
    .status === 404,
);

// 9b. Importing a list of cards adds all of them, in order, or none.
const imported = await call(
  'POST',
  `/api/decks/${deck.json.id}/cards/import`,
  token,
  {
    cards: [
      { front: 'import 1', back: 'one' },
      { front: 'import 2', back: 'two' },
      { front: 'import 3', back: 'three' },
    ],
  },
);
check(
  'import three cards (201)',
  imported.status === 201 && imported.json?.added === 3,
  `status ${imported.status}, added ${imported.json?.added}`,
);
const cards2 = await call('GET', `/api/decks/${deck.json.id}/cards`, token);
const importedFronts = Array.isArray(cards2.json)
  ? cards2.json.map((c) => c.front).filter((f) => f.startsWith('import '))
  : [];
check(
  'imported cards are listed in the order written',
  importedFronts.join() === 'import 1,import 2,import 3',
  importedFronts.join(),
);
const deckList4 = await call('GET', '/api/decks', token);
const listed4 = Array.isArray(deckList4.json)
  ? deckList4.json.find((d) => d.id === deck.json.id)
  : null;
check(
  'deck now shows 5 cards, 4 due',
  listed4?.cardCount === 5 && listed4?.dueCount === 4,
  `cardCount ${listed4?.cardCount}, dueCount ${listed4?.dueCount}`,
);
const badImport = await call(
  'POST',
  `/api/decks/${deck.json.id}/cards/import`,
  token,
  {
    cards: [{ front: 'fine', back: 'fine' }, { front: 'no back' }],
  },
);
check(
  'a list with a bad card is refused (400)',
  badImport.status === 400,
  `status ${badImport.status}`,
);
check(
  'a refused import adds nothing',
  (await call('GET', `/api/decks/${deck.json.id}/cards`, token)).json
    ?.length === 5,
);
check(
  'an empty list is refused (400)',
  (
    await call('POST', `/api/decks/${deck.json.id}/cards/import`, token, {
      cards: [],
    })
  ).status === 400,
);
check(
  'a body without a list is refused (400)',
  (
    await call('POST', `/api/decks/${deck.json.id}/cards/import`, token, {
      cards: 'x',
    })
  ).status === 400,
);
check(
  'more than 500 cards is refused (400)',
  (
    await call('POST', `/api/decks/${deck.json.id}/cards/import`, token, {
      cards: Array.from({ length: 501 }, () => ({ front: 'a', back: 'b' })),
    })
  ).status === 400,
);
check(
  'importing into a deck that is not yours is 404',
  (
    await call(
      'POST',
      '/api/decks/00000000-0000-4000-8000-000000000000/cards/import',
      token,
      {
        cards: [{ front: 'a', back: 'b' }],
      },
    )
  ).status === 404,
);
check(
  'import needs a token (401)',
  (
    await call('POST', `/api/decks/${deck.json.id}/cards/import`, undefined, {
      cards: [{ front: 'a', back: 'b' }],
    })
  ).status === 401,
);

// 10. Deleting a deck archives it and every card in it.
const delDeck = await call('DELETE', `/api/decks/${deck.json.id}`, token);
check(
  'delete (archive) a deck (200)',
  delDeck.status === 200,
  `status ${delDeck.status}`,
);
const deckList3 = await call('GET', '/api/decks', token);
check(
  'archived deck is not listed',
  Array.isArray(deckList3.json) &&
    !deckList3.json.some((d) => d.id === deck.json.id),
);
const queue5 = await call('GET', '/api/queue?limit=50', token);
check(
  'its cards have left the queue',
  Array.isArray(queue5.json) &&
    !queue5.json.some((q) => q.card.id === card3.json.id),
);
check(
  'adding a card to an archived deck is refused',
  (
    await call('POST', `/api/decks/${deck.json.id}/cards`, token, {
      front: 'a',
      back: 'b',
    })
  ).status >= 400,
);
check(
  'archiving the same deck again is 404',
  (await call('DELETE', `/api/decks/${deck.json.id}`, token)).status === 404,
);

// 11. A deck bigger than the database's 1000-row answer limit lists in full.
const big = await call('POST', '/api/decks', token, { name: 'Big deck' });
for (let part = 0; part < 3; part++) {
  const cards = Array.from({ length: 500 }, (_, i) => {
    const n = part * 500 + i + 1;
    return { front: `big ${n}`, back: `answer ${n}` };
  });
  await call('POST', `/api/decks/${big.json.id}/cards/import`, token, {
    cards,
  });
}
const bigList = await call('GET', `/api/decks/${big.json.id}/cards`, token);
const bigFronts = Array.isArray(bigList.json)
  ? bigList.json.map((c) => c.front)
  : [];
check(
  'a 1500-card deck lists all 1500 cards',
  bigFronts.length === 1500,
  `got ${bigFronts.length}`,
);
check(
  'no card is repeated across pages',
  new Set(bigList.json?.map((c) => c.id)).size === 1500,
);
// Three imports sent one straight after the other can overlap in time, so the
// check is on the order inside each import, which is what an import promises.
const numbers = bigFronts.map((f) => Number(f.slice(4)));
check(
  'each import keeps its cards in the order written',
  [0, 1, 2].every((part) => {
    const mine = numbers.filter((n) => n > part * 500 && n <= part * 500 + 500);
    return (
      mine.length === 500 && mine.every((n, i) => i === 0 || n > mine[i - 1])
    );
  }),
);
await call('DELETE', `/api/decks/${big.json.id}`, token);

console.log(
  failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`,
);
process.exit(failed === 0 ? 0 : 1);
