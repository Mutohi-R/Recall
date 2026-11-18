import { getProgress } from '../../lib/persistence/content';
import { parseTimeZone } from '../../lib/validation';

// GET /api/progress?tz=Africa/Lagos
//   -> everything the Progress page shows, with days counted on the
//      learner's own clock (the browser sends its time zone)
export default defineApiRoute({
  GET: async (event) => {
    const learner = await requireLearner(event);
    const tz = parseTimeZone(getQuery(event).tz);
    return getProgress(learnerClient(event, learner.token), new Date(), tz);
  },
});
