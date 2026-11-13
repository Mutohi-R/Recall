import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ItemNotFoundError,
  ReviewConflictError,
  type ReviewContext,
  type ReviewStore,
  type ReviewWrite,
} from './store';
import {
  itemFromRow,
  learnerFromRow,
  toRecordReviewArgs,
  type ItemStateRow,
  type LearnerRow,
} from './mappers';

const ITEM_COLUMNS =
  'id, learner_id, card_id, stability, review_count, last_reviewed, due_at, sm2_easiness, sm2_interval, sm2_repetitions';
const LEARNER_COLUMNS = 'id, prior_stability, log_rt_mean, log_rt_sd, rt_count';

// Needs the secret key: record_review is callable only by that role, and the
// reads are filtered by learner_id here because that key bypasses Row Level
// Security. The learner id comes from the verified token, never the request.
export function createSupabaseReviewStore(client: SupabaseClient): ReviewStore {
  return {
    async loadForReview(learnerId, itemStateId): Promise<ReviewContext | null> {
      const itemRes = await client
        .from('item_states')
        .select(`${ITEM_COLUMNS}, cards!inner(archived_at)`)
        .eq('id', itemStateId)
        .eq('learner_id', learnerId)
        .is('cards.archived_at', null) // an archived card cannot be reviewed
        .maybeSingle();
      if (itemRes.error) throw itemRes.error;
      if (!itemRes.data) return null;

      const learnerRes = await client
        .from('learners')
        .select(LEARNER_COLUMNS)
        .eq('id', learnerId)
        .single();
      if (learnerRes.error) throw learnerRes.error;

      const othersRes = await client
        .from('item_states')
        .select('stability')
        .eq('learner_id', learnerId)
        .neq('id', itemStateId)
        .not('stability', 'is', null);
      if (othersRes.error) throw othersRes.error;

      return {
        itemStateId,
        item: itemFromRow(itemRes.data as ItemStateRow),
        dueAt: new Date((itemRes.data as ItemStateRow).due_at),
        learner: learnerFromRow(learnerRes.data as LearnerRow),
        otherStabilities: (othersRes.data as { stability: number }[]).map(
          (r) => r.stability,
        ),
      };
    },

    async saveReview(write: ReviewWrite): Promise<void> {
      const { error } = await client.rpc(
        'record_review',
        toRecordReviewArgs(write),
      );
      if (!error) return;
      if (error.code === 'RC409') throw new ReviewConflictError();
      if (error.code === 'RC404') throw new ItemNotFoundError();
      throw error;
    },
  };
}
