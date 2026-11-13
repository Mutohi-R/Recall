import { renameDeck } from '../../../lib/persistence/content';
import { requireDeckName, requireObject, requireUuid } from '../../../lib/validation';

// PATCH /api/decks/:id  { name }
export default defineApiRoute({
  PATCH: async (event) => {
    const learner = await requireLearner(event);
    const id = requireUuid(getRouterParam(event, 'id'), 'id');
    const body = requireObject(await readBody(event));
    const name = requireDeckName(body.name);
    await renameDeck(learnerClient(event, learner.token), id, name);
    return { ok: true };
  },
});
