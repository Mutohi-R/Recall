import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  itemFromRow,
  learnerFromRow,
  toRecordReviewArgs,
  type ItemStateRow,
} from './mappers';
import { updateResponseTimeStats } from '../scheduling/learner-stats';
import type { LearnerState } from '../scheduling/types';
import type { ReviewWrite } from './store';

describe('itemFromRow', () => {
  it("maps Table 3.4 columns to the engine's item state", () => {
    const row: ItemStateRow = {
      id: 'i1',
      learner_id: 'l1',
      card_id: 'c1',
      stability: 42.5,
      review_count: 7,
      last_reviewed: '2026-11-12T10:00:00.000Z',
      due_at: '2026-11-20T10:00:00.000Z',
      sm2_easiness: 2.36,
      sm2_interval: 6,
      sm2_repetitions: 2,
    };
    expect(itemFromRow(row)).toEqual({
      learnerId: 'l1',
      cardId: 'c1',
      stability: 42.5,
      reviewCount: 7,
      repetitions: 2,
      easinessFactor: 2.36,
      intervalDays: 6,
      lastReviewedAt: new Date('2026-11-12T10:00:00.000Z'),
    });
  });

  it("keeps a never-reviewed item's nulls", () => {
    const item = itemFromRow({
      id: 'i',
      learner_id: 'l',
      card_id: 'c',
      stability: null,
      review_count: 0,
      last_reviewed: null,
      due_at: '2026-11-12T10:00:00.000Z',
      sm2_easiness: 2.5,
      sm2_interval: 0,
      sm2_repetitions: 0,
    });
    expect(item.stability).toBeNull();
    expect(item.lastReviewedAt).toBeNull();
  });
});

describe('learnerFromRow', () => {
  it('maps a learner with no correct answers yet', () => {
    expect(
      learnerFromRow({
        id: 'l',
        prior_stability: null,
        log_rt_mean: null,
        log_rt_sd: null,
        rt_count: 0,
      }),
    ).toEqual({
      learnerId: 'l',
      meanLogResponseTime: null,
      stdLogResponseTime: null,
      logResponseTimeM2: 0,
      rtCount: 0,
      priorStability: null,
    });
  });

  it('rebuilds the running statistics so that the stored columns carry the same information as the in-memory state', () => {
    const times = [1800, 1500, 2300, 900, 1200, 3100, 1000, 1400, 2000, 1700];
    const empty: LearnerState = {
      learnerId: 'l',
      meanLogResponseTime: null,
      stdLogResponseTime: null,
      logResponseTimeM2: 0,
      rtCount: 0,
      priorStability: null,
    };
    // `live` is updated in memory only. `viaDb` goes through the three stored
    // columns after every review, the way the application does.
    let live = empty;
    let viaDb = empty;
    for (const ms of times) {
      live = updateResponseTimeStats(live, ms);
      viaDb = updateResponseTimeStats(viaDb, ms);
      viaDb = learnerFromRow({
        id: 'l',
        prior_stability: null,
        log_rt_mean: viaDb.meanLogResponseTime,
        log_rt_sd: viaDb.stdLogResponseTime,
        rt_count: viaDb.rtCount,
      });
      expect(viaDb.rtCount).toBe(live.rtCount);
      expect(viaDb.meanLogResponseTime).toBeCloseTo(
        live.meanLogResponseTime!,
        10,
      );
      expect(viaDb.stdLogResponseTime).toBeCloseTo(
        live.stdLogResponseTime!,
        10,
      );
      expect(viaDb.logResponseTimeM2).toBeCloseTo(live.logResponseTimeM2, 10);
    }
  });
});

describe('toRecordReviewArgs', () => {
  const write: ReviewWrite = {
    learnerId: 'l',
    itemStateId: 'i',
    expectedReviewCount: 3,
    expectedRtCount: 9,
    item: {
      learnerId: 'l',
      cardId: 'c',
      stability: 12.5,
      reviewCount: 4,
      repetitions: 4,
      easinessFactor: 2.6,
      intervalDays: 15,
      lastReviewedAt: new Date('2026-11-12T10:00:00Z'),
    },
    dueAt: new Date('2026-11-14T10:00:00Z'),
    learner: {
      learnerId: 'l',
      meanLogResponseTime: 0.3,
      stdLogResponseTime: 0.5,
      logResponseTimeM2: 2.5,
      rtCount: 10,
      priorStability: 40,
    },
    log: {
      reviewedAt: new Date('2026-11-12T10:00:00Z'),
      correct: true,
      responseTimeMs: 1500,
      elapsedDays: 2.1,
      path: 'adaptive',
      intervalAssigned: 2.04,
    },
  };

  it('passes every value under the parameter name the SQL function declares', () => {
    const args = toRecordReviewArgs(write);
    expect(args).toMatchObject({
      p_learner_id: 'l',
      p_item_state_id: 'i',
      p_expected_review_count: 3,
      p_expected_rt_count: 9,
      p_stability: 12.5,
      p_review_count: 4,
      p_last_reviewed: '2026-11-12T10:00:00.000Z',
      p_due_at: '2026-11-14T10:00:00.000Z',
      p_sm2_easiness: 2.6,
      p_sm2_interval: 15,
      p_sm2_repetitions: 4,
      p_prior_stability: 40,
      p_log_rt_mean: 0.3,
      p_log_rt_sd: 0.5,
      p_rt_count: 10,
      p_correct: true,
      p_response_time_ms: 1500,
      p_elapsed_days: 2.1,
      p_path: 'adaptive',
      p_interval_assigned: 2.04,
    });
  });

  it('uses exactly the parameters of record_review in the migration', () => {
    const dir = join(__dirname, '..', '..', 'supabase', 'migrations');
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    const header = sql.slice(
      sql.indexOf('create function public.record_review('),
      sql.indexOf('returns uuid'),
    );
    const declared = [...header.matchAll(/^\s*(p_\w+)\s/gm)]
      .map((m) => m[1])
      .sort();
    expect(Object.keys(toRecordReviewArgs(write)).sort()).toEqual(declared);
    expect(declared).toHaveLength(20);
  });
});
