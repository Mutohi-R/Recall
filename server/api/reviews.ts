import { createSupabaseReviewStore } from '../../lib/persistence/supabase-review-store';
import { submitReview } from '../../lib/services/submit-review';
import { fittedEngineConfig } from '../../lib/scheduling/fitted-config';
import { requireObject, requireUuid } from '../../lib/validation';

// POST /api/reviews  { itemStateId, correct, responseTimeMs }
//
// The one route that changes scheduling state. The learner is taken from the
// verified token; the item must be theirs and due; the review time is the
// server's clock. The reply gives the next due time only. The stability,
// retrievability estimate and path are stored but not returned (3.3.4).
export default defineApiRoute({
  POST: async (event) => {
    const learner = await requireLearner(event);
    const body = requireObject(await readBody(event));
    const itemStateId = requireUuid(body.itemStateId, 'itemStateId');

    const result = await submitReview(
      createSupabaseReviewStore(serviceClient(event)),
      fittedEngineConfig,
      {
        learnerId: learner.id,
        itemStateId,
        correct: body.correct,
        responseTimeMs: body.responseTimeMs,
      },
    );

    return {
      nextReviewAt: result.nextReviewAt.toISOString(),
      intervalDays: result.intervalDays,
    };
  },
});
