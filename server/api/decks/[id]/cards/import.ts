import { createCards } from '../../../../../lib/persistence/content';
import {
  checkImportCards,
  importProblemMessage,
} from '../../../../../lib/import-cards';
import {
  requireObject,
  requireUuid,
  ValidationError,
} from '../../../../../lib/validation';

// POST /api/decks/:id/cards/import  { cards: [{ front, back }, ...] }
// Adds the whole list or none of it. The same checks as the Import dialog are
// run again here, because the browser is not trusted.
export default defineApiRoute({
  POST: async (event) => {
    const learner = await requireLearner(event);
    const deckId = requireUuid(getRouterParam(event, 'id'), 'id');
    const body = requireObject(await readBody(event));
    if (!Array.isArray(body.cards)) {
      throw new ValidationError('cards must be a list');
    }
    const checked = checkImportCards(body.cards);
    if (!checked.ok) {
      throw new ValidationError(importProblemMessage(checked.problem));
    }
    const added = await createCards(
      learnerClient(event, learner.token),
      deckId,
      checked.cards,
    );
    setResponseStatus(event, 201);
    return { added };
  },
});
