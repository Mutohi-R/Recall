import { getQueue } from '../../lib/persistence/content';
import { parseQueueLimit } from '../../lib/validation';

// GET /api/queue?limit=20  ->  cards due now, oldest due first
export default defineApiRoute({
  GET: async (event) => {
    const learner = await requireLearner(event);
    const limit = parseQueueLimit(getQuery(event).limit);
    return getQueue(learnerClient(event, learner.token), new Date(), limit);
  },
});
