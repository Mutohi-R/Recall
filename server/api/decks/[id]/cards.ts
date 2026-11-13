import { createCard, listCards } from '../../../../lib/persistence/content';
import {
  requireCardText,
  requireObject,
  requireUuid,
} from '../../../../lib/validation';

// GET  /api/decks/:id/cards
// POST /api/decks/:id/cards  { front, back }
// A new card appears in the review queue straight away (the database creates
// its scheduling record).
export default defineApiRoute({
  GET: async (event) => {
    const learner = await requireLearner(event);
    const id = requireUuid(getRouterParam(event, 'id'), 'id');
    return listCards(learnerClient(event, learner.token), id);
  },
  POST: async (event) => {
    const learner = await requireLearner(event);
    const deckId = requireUuid(getRouterParam(event, 'id'), 'id');
    const body = requireObject(await readBody(event));
    const front = requireCardText(body.front, 'front');
    const back = requireCardText(body.back, 'back');
    setResponseStatus(event, 201);
    return createCard(learnerClient(event, learner.token), deckId, front, back);
  },
});
