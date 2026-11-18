import { getQueue } from '../../lib/persistence/content';
import { parseQueueDeck, parseQueueLimit } from '../../lib/validation';

// GET /api/queue?limit=20&deck=<id>  ->  cards due now, oldest due first
// (deck is optional: leave it out for every deck)
export default defineApiRoute({
  GET: async (event) => {
    const learner = await requireLearner(event);
    const query = getQuery(event);
    const limit = parseQueueLimit(query.limit);
    const deckId = parseQueueDeck(query.deck);
    return getQueue(
      learnerClient(event, learner.token),
      new Date(),
      limit,
      deckId,
    );
  },
});
