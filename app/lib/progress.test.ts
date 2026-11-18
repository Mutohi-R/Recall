import { describe, expect, it } from 'vitest';
import type {
  ProgressActivity,
  ProgressMemory,
} from '~~/lib/persistence/content';
import {
  activityView,
  addDays,
  countAxis,
  dayLabel,
  lastDays,
  memoryView,
  nextReviewDays,
  recallAfter,
  stackByDeck,
  summariseBars,
  timeAxis,
  weekdayShort,
} from './progress';

const decks = [
  { id: 'a', name: 'Anatomy', colour: 0, archived: false },
  { id: 'b', name: 'Biology', colour: 1, archived: false },
  { id: 'c', name: 'Chemistry', colour: 2, archived: false },
  { id: 'd', name: 'Drugs', colour: 3, archived: false },
  { id: 'e', name: 'Ethics', colour: 4, archived: false },
  { id: 'x', name: 'Old deck', colour: 5, archived: true },
];

describe('days', () => {
  it('counts back across month and year ends', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
  it('lists the last n days, oldest first', () => {
    const days = lastDays('2026-11-18', 30);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe('2026-10-20');
    expect(days[29]).toBe('2026-11-18');
  });
  it('labels days', () => {
    expect(weekdayShort('2026-11-18')).toBe('Wed');
    expect(dayLabel('2026-10-05')).toBe('5 Oct');
  });
});

describe('countAxis', () => {
  it('picks a top with a whole halfway mark', () => {
    expect(countAxis(0)).toEqual({ top: 4, ticks: [0, 2, 4] });
    expect(countAxis(7)).toEqual({ top: 10, ticks: [0, 5, 10] });
    expect(countAxis(46)).toEqual({ top: 100, ticks: [0, 50, 100] });
  });
  it('still works above the table', () => {
    expect(countAxis(250000).top).toBe(250000);
  });
});

describe('stackByDeck', () => {
  it('gives the busiest decks a legend entry and folds the rest into Other decks', () => {
    const chart = stackByDeck(
      [
        {
          label: 'd1',
          rows: [
            { deckId: 'a', count: 10 },
            { deckId: 'b', count: 1 },
            { deckId: 'e', count: 2 },
          ],
        },
        {
          label: 'd2',
          rows: [
            { deckId: 'c', count: 5 },
            { deckId: 'd', count: 4 },
          ],
        },
      ],
      decks,
      3,
    );
    // top three by count: a (10), c (5), d (4); legend is in the order of the decks
    expect(chart.legend.map((l) => l.key)).toEqual(['a', 'c', 'd', 'other']);
    expect(chart.legend.at(-1)!.name).toBe('Other decks');
    expect(chart.bars[0]!.segments).toEqual([
      { key: 'a', count: 10 },
      { key: 'other', count: 3 },
    ]);
    expect(chart.bars[0]!.total).toBe(13);
    expect(chart.max).toBe(13);
  });

  it('puts deleted decks into Other decks', () => {
    const chart = stackByDeck(
      [
        {
          label: 'd1',
          rows: [
            { deckId: 'x', count: 3 },
            { deckId: 'a', count: 1 },
          ],
        },
      ],
      decks,
    );
    expect(chart.legend.map((l) => l.key)).toEqual(['a', 'other']);
    expect(chart.bars[0]!.segments).toEqual([
      { key: 'a', count: 1 },
      { key: 'other', count: 3 },
    ]);
  });

  it('has no Other entry when every deck fits', () => {
    const chart = stackByDeck(
      [{ label: 'd1', rows: [{ deckId: 'a', count: 1 }] }],
      decks,
    );
    expect(chart.legend.map((l) => l.key)).toEqual(['a']);
  });

  it('handles no data at all', () => {
    const chart = stackByDeck([{ label: 'd1', rows: [] }], decks);
    expect(chart.legend).toEqual([]);
    expect(chart.bars[0]).toEqual({ label: 'd1', total: 0, segments: [] });
    expect(chart.max).toBe(0);
  });
});

const activity: ProgressActivity = {
  today: '2026-11-18',
  totalReviews: 120,
  week: { reviews: 46, recalled: 37 },
  newCards: 12,
  daily: [
    { day: '2026-11-17', deckId: 'a', count: 20 },
    { day: '2026-11-18', deckId: 'a', count: 10 },
    { day: '2026-11-18', deckId: 'b', count: 6 },
  ],
  stages: { new: 10, learning: 20, young: 10, mature: 10 },
  due: [
    { offset: 0, deckId: 'a', count: 8 },
    { offset: 2, deckId: 'b', count: 3 },
  ],
  decks,
};

describe('activityView', () => {
  const v = activityView(activity);

  it('builds the three tiles', () => {
    expect(v.tiles.map((t) => t.value)).toEqual(['46', '80%', '12']);
    expect(v.tiles[1]!.caption).toBe('37 of 46 reviews, last 7 days');
  });

  it('shows a dash instead of a percentage when there were no reviews this week', () => {
    const empty = activityView({
      ...activity,
      week: { reviews: 0, recalled: 0 },
    });
    expect(empty.tiles[1]!.value).toBe('–');
  });

  it('fills 30 days with zeros for days without reviews', () => {
    expect(v.daily.bars).toHaveLength(30);
    expect(v.daily.bars[0]!.total).toBe(0);
    expect(v.daily.bars[28]!.total).toBe(20);
    expect(v.daily.bars[29]!.total).toBe(16);
    expect(v.daily.xStart).toBe('20 Oct');
    expect(v.daily.xEnd).toBe('18 Nov');
    expect(v.daily.axis.top).toBe(20);
  });

  it('sizes stage bars by share of all cards', () => {
    expect(v.stages.map((s) => s.count)).toEqual([10, 20, 10, 10]);
    expect(v.stages[1]!.share).toBeCloseTo(0.4);
  });

  it('copes with a learner who has no cards', () => {
    const none = activityView({
      ...activity,
      stages: { new: 0, learning: 0, young: 0, mature: 0 },
    });
    expect(none.stages.every((s) => s.share === 0)).toBe(true);
  });

  it('labels the due chart from today', () => {
    expect(v.due.bars.map((b) => b.label)).toEqual([
      'Today',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
      'Mon',
      'Tue',
    ]);
    expect(v.due.bars[0]!.total).toBe(8);
    expect(v.due.bars[2]!.total).toBe(3);
  });

  it('flags a learner with no reviews', () => {
    expect(activityView({ ...activity, totalReviews: 0 }).hasReviews).toBe(
      false,
    );
    expect(v.hasReviews).toBe(true);
  });
});

const memory: ProgressMemory = {
  cards: 50,
  adaptive: 12,
  mostReviews: 6,
  stability: { p25: 10, median: 20, p75: 40 },
  rtCount: 30,
  paceSeconds: 6.04,
  dailyTime: [
    { day: '2026-11-17', seconds: 5.5 },
    { day: '2026-11-18', seconds: 7.2 },
  ],
  gaps: [
    { n: 1, days: 1, count: 40 },
    { n: 2, days: 6, count: 30 },
    { n: 5, days: 12.46, count: 10 },
  ],
};

describe('forgetting curve maths', () => {
  it('recall is 1 at day 0 and falls as e^(-t/S)', () => {
    expect(recallAfter(10, 0)).toBe(1);
    expect(recallAfter(10, 10)).toBeCloseTo(Math.exp(-1));
  });
  it('the next review is when recall reaches 0.9', () => {
    const d = nextReviewDays(20);
    expect(recallAfter(20, d)).toBeCloseTo(0.9);
    expect(d).toBeCloseTo(2.107, 2);
  });
});

describe('memoryView', () => {
  it('is ready with enough reviews and answers', () => {
    const v = memoryView(memory, '2026-11-18');
    expect(v.state).toBe('ready');
    expect(v.meters.reviews.text).toBe('5 of 5');
    expect(v.meters.answers.text).toBe('24 of 24');
    expect(v.tiles.map((t) => t.value)).toEqual([
      '20 days',
      '6.0 s',
      '12 of 50',
    ]);
    expect(v.curves.map((c) => c.key)).toEqual([
      'stronger',
      'typical',
      'weaker',
    ]);
    expect(v.curves[0]!.stability).toBe(40);
    expect(v.gaps.map((g) => [g.label, g.text])).toEqual([
      ['1st', '1'],
      ['2nd', '6'],
      ['5th', '12'],
    ]);
  });

  it('waits for pace when fewer than 24 correct answers are known', () => {
    const v = memoryView({ ...memory, rtCount: 10 }, '2026-11-18');
    expect(v.state).toBe('pace-pending');
    expect(v.tiles[1]!.value).toBe('Pending…');
    expect(v.tiles[1]!.caption).toContain('10 of 24');
    expect(v.time.pace).toBeNull();
  });

  it('is building while no card is on its own schedule', () => {
    const v = memoryView(
      {
        ...memory,
        adaptive: 0,
        mostReviews: 3,
        stability: null,
        rtCount: 3,
        paceSeconds: null,
      },
      '2026-11-18',
    );
    expect(v.state).toBe('building');
    expect(v.curves).toEqual([]);
    expect(v.meters.reviews.text).toBe('3 of 5');
    expect(v.tiles[0]!.value).toBe('–');
  });

  it('puts days without correct answers in the time series as gaps', () => {
    const v = memoryView(memory, '2026-11-18');
    expect(v.time.days).toHaveLength(30);
    expect(v.time.days[0]!.seconds).toBeNull();
    expect(v.time.days[29]!.seconds).toBe(7.2);
  });
});

describe('timeAxis', () => {
  it('spans the data and the pace with an even range', () => {
    const a = timeAxis([5.5, 7.2], 6.04);
    expect(a).toMatchObject({ lo: 4, hi: 8 });
    expect((a.hi - a.lo) % 2).toBe(0);
    expect(a.ticks).toEqual([a.lo, (a.lo + a.hi) / 2, a.hi]);
  });
  it('has a default when there is nothing to plot', () => {
    expect(timeAxis([], null).ticks).toEqual([0, 5, 10]);
  });
});

describe('summariseBars', () => {
  it('names the total and the busiest bar', () => {
    expect(
      summariseBars(
        [
          { label: 'Mon', total: 2 },
          { label: 'Tue', total: 5 },
        ],
        'Cards due',
      ),
    ).toBe('Cards due: 7 in all, the most on Tue (5).');
  });
  it('says so when there is nothing', () => {
    expect(summariseBars([{ label: 'Mon', total: 0 }], 'Cards due')).toBe(
      'Cards due: none.',
    );
  });
});
