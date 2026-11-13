import { archiveDeck, renameDeck } from '../../../lib/persistence/content';
import { requireDeckName, requireObject, requireUuid } from '../../../lib/validation';

// PATCH  /api/decks/:id  { name }
// DELETE /api/decks/:id  (archives the deck and its cards)
export default defineApiRoute({
  PATCH: async (event) => {
    const learner = await requireLearner(event);
    const id = requireUuid(getRouterParam(event, 'id'), 'id');
    const body = requireObject(await readBody(event));
    const name = requireDeckName(body.name);
    await renameDeck(learnerClient(event, learner.token), id, name);
    return { ok: true };
  },
  DELETE: async (event) => {
    const learner = await requireLearner(event);
    const id = requireUuid(getRouterParam(event, 'id'), 'id');
    await archiveDeck(learnerClient(event, learner.token), id, new Date());
    return { ok: true };
  },
});
