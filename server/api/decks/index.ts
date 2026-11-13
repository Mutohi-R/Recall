import { createDeck, listDecks } from '../../../lib/persistence/content';
import { requireDeckName, requireObject } from '../../../lib/validation';

// GET  /api/decks
// POST /api/decks  { name }
export default defineApiRoute({
  GET: async (event) => {
    const learner = await requireLearner(event);
    return listDecks(learnerClient(event, learner.token));
  },
  POST: async (event) => {
    const learner = await requireLearner(event);
    const body = requireObject(await readBody(event));
    const name = requireDeckName(body.name);
    setResponseStatus(event, 201);
    return createDeck(learnerClient(event, learner.token), learner.id, name);
  },
});
