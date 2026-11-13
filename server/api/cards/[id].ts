import { archiveCard, updateCard } from '../../../lib/persistence/content';
import {
  requireCardText,
  requireObject,
  requireUuid,
  ValidationError,
} from '../../../lib/validation';

// PATCH  /api/cards/:id  { front?, back? }
// DELETE /api/cards/:id  (archives the card)
export default defineApiRoute({
  PATCH: async (event) => {
    const learner = await requireLearner(event);
    const id = requireUuid(getRouterParam(event, 'id'), 'id');
    const body = requireObject(await readBody(event));
    const changes: { front?: string; back?: string } = {};
    if (body.front !== undefined)
      changes.front = requireCardText(body.front, 'front');
    if (body.back !== undefined)
      changes.back = requireCardText(body.back, 'back');
    if (Object.keys(changes).length === 0) {
      throw new ValidationError('send front, back or both');
    }
    await updateCard(learnerClient(event, learner.token), id, changes);
    return { ok: true };
  },
  DELETE: async (event) => {
    const learner = await requireLearner(event);
    const id = requireUuid(getRouterParam(event, 'id'), 'id');
    await archiveCard(learnerClient(event, learner.token), id, new Date());
    return { ok: true };
  },
});
