import type {
  ProgressActivity,
  ProgressDeck,
  ProgressMemory,
} from '~~/lib/persistence/content';
import { fittedEngineConfig } from '../../lib/scheduling/fitted-config';
import { toApiError } from './api';
import { deckColour } from './deck-colours';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ------------------------------------------------------------------ days

function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

export function weekdayShort(day: string): string {
  return WEEKDAYS[parseDay(day).getUTCDay()]!;
}

export function dayLabel(day: string): string {
  const d = parseDay(day);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// --------------------------------------------------------------- scales

const AXIS_TOPS = [
  4, 10, 20, 40, 100, 200, 400, 1000, 2000, 4000, 10000, 20000, 40000, 100000,
];

export function countAxis(max: number): { top: number; ticks: number[] } {
  const top = AXIS_TOPS.find((t) => t >= max) ?? Math.ceil(max / 2) * 2;
  return { top, ticks: [0, top / 2, top] };
}

// ------------------------------------------------------- page helpers

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function progressErrorText(error: unknown): string {
  return toApiError(error).status === 0
    ? 'Recall could not reach the server. Check your connection, then try again. Your cards are safe.'
    : 'Recall could not load your progress. Try again in a moment. Your cards are safe.';
}

export function summariseBars(
  bars: { label: string; total: number }[],
  what: string,
): string {
  const total = bars.reduce((s, b) => s + b.total, 0);
  if (total === 0) return `${what}: none.`;
  const best = bars.reduce((a, b) => (b.total > a.total ? b : a));
  return `${what}: ${total} in all, the most on ${best.label} (${best.total}).`;
}

// ------------------------------------------------------- stacks by deck

export const MAX_LEGEND_DECKS = 4;
export const OTHER_KEY = 'other';
const OTHER_FILL = '#ede7d8';

export interface LegendItem {
  key: string;
  name: string;
  fill: string;
}

export interface StackSegment {
  key: string;
  count: number;
}

export interface StackedBar {
  label: string;
  total: number;
  segments: StackSegment[];
}

export interface StackedChart {
  legend: LegendItem[];
  bars: StackedBar[];
  max: number;
}

export interface StackColumn {
  label: string;
  rows: { deckId: string; count: number }[];
}

export function stackByDeck(
  columns: StackColumn[],
  decks: ProgressDeck[],
  maxDecks = MAX_LEGEND_DECKS,
): StackedChart {
  const live = new Map(
    decks
      .filter((d) => !d.archived)
      .map((d, i) => [d.id, { deck: d, order: i }]),
  );
  const totals = new Map<string, number>();
  for (const col of columns) {
    for (const r of col.rows) {
      if (live.has(r.deckId))
        totals.set(r.deckId, (totals.get(r.deckId) ?? 0) + r.count);
    }
  }
  const named = [...totals.entries()]
    .filter(([, n]) => n > 0)
    .sort(
      (a, b) => b[1] - a[1] || live.get(a[0])!.order - live.get(b[0])!.order,
    )
    .slice(0, maxDecks)
    .map(([id]) => live.get(id)!)
    .sort((a, b) => a.order - b.order);
  const keyOf = (deckId: string) =>
    named.some((n) => n.deck.id === deckId) ? deckId : OTHER_KEY;

  const legend: LegendItem[] = named.map(({ deck }) => ({
    key: deck.id,
    name: deck.name,
    fill: deckColour(deck.colour).fill,
  }));

  let hasOther = false;
  const bars = columns.map((col) => {
    const byKey = new Map<string, number>();
    for (const r of col.rows) {
      if (r.count <= 0) continue;
      const key = keyOf(r.deckId);
      if (key === OTHER_KEY) hasOther = true;
      byKey.set(key, (byKey.get(key) ?? 0) + r.count);
    }
    const order = [...legend.map((l) => l.key), OTHER_KEY];
    const segments = order
      .filter((k) => (byKey.get(k) ?? 0) > 0)
      .map((k) => ({ key: k, count: byKey.get(k)! }));
    return {
      label: col.label,
      total: segments.reduce((s, x) => s + x.count, 0),
      segments,
    };
  });
  if (hasOther)
    legend.push({ key: OTHER_KEY, name: 'Other decks', fill: OTHER_FILL });

  return { legend, bars, max: Math.max(0, ...bars.map((b) => b.total)) };
}

// -------------------------------------------------------------- Activity

export interface StatTile {
  label: string;
  value: string;
  caption: string;
}

export interface StageRow {
  key: 'new' | 'learning' | 'young' | 'mature';
  name: string;
  description: string;
  count: number;
  share: number;
  fill: string;
}

export interface ActivityView {
  hasReviews: boolean;
  tiles: StatTile[];
  daily: StackedChart & {
    axis: { top: number; ticks: number[] };
    xStart: string;
    xMid: string;
    xEnd: string;
  };
  stages: StageRow[];
  due: StackedChart & { axis: { top: number } };
}

const STAGES: Omit<StageRow, 'count' | 'share'>[] = [
  {
    key: 'new',
    name: 'New',
    description: 'Not reviewed yet',
    fill: deckColour(0).fill,
  },
  {
    key: 'learning',
    name: 'Learning',
    description: 'Next review in under 7 days',
    fill: deckColour(1).fill,
  },
  {
    key: 'young',
    name: 'Young',
    description: 'Next review in 7 to 29 days',
    fill: deckColour(2).fill,
  },
  {
    key: 'mature',
    name: 'Mature',
    description: 'Next review in 30 days or more',
    fill: deckColour(3).fill,
  },
];

export function activityView(a: ProgressActivity): ActivityView {
  const { reviews, recalled } = a.week;
  const tiles: StatTile[] = [
    { label: 'Reviews', value: String(reviews), caption: 'Last 7 days' },
    {
      label: 'Recalled',
      value: reviews === 0 ? '–' : `${Math.round((recalled / reviews) * 100)}%`,
      caption:
        reviews === 0
          ? 'No reviews in the last 7 days'
          : `${recalled} of ${reviews} ${reviews === 1 ? 'review' : 'reviews'}, last 7 days`,
    },
    {
      label: 'New cards started',
      value: String(a.newCards),
      caption: 'Last 7 days',
    },
  ];

  const days = lastDays(a.today, 30);
  const dailyChart = stackByDeck(
    days.map((day) => ({
      label: day,
      rows: a.daily.filter((r) => r.day === day),
    })),
    a.decks,
  );
  const axis = countAxis(dailyChart.max);

  const total =
    a.stages.new + a.stages.learning + a.stages.young + a.stages.mature;
  const stages = STAGES.map((s) => ({
    ...s,
    count: a.stages[s.key],
    share: total === 0 ? 0 : a.stages[s.key] / total,
  }));

  const dueChart = stackByDeck(
    Array.from({ length: 7 }, (_, offset) => ({
      label: offset === 0 ? 'Today' : weekdayShort(addDays(a.today, offset)),
      rows: a.due.filter((r) => r.offset === offset),
    })),
    a.decks,
  );

  return {
    hasReviews: a.totalReviews > 0,
    tiles,
    daily: {
      ...dailyChart,
      axis,
      xStart: dayLabel(days[0]!),
      xMid: dayLabel(days[15]!),
      xEnd: dayLabel(days[29]!),
    },
    stages,
    due: { ...dueChart, axis: { top: countAxis(dueChart.max).top } },
  };
}

// ---------------------------------------------------------------- Memory

export const REVIEWS_FOR_OWN_SCHEDULE =
  fittedEngineConfig.coldStartItemReviews + 1;
export const ANSWERS_FOR_PACE = fittedEngineConfig.coldStartLearnerReviews;
const TARGET = fittedEngineConfig.targetRetrievability;

export function recallAfter(stability: number, days: number): number {
  return Math.exp(-days / stability);
}

export function nextReviewDays(stability: number, target = TARGET): number {
  return -stability * Math.log(target);
}

export function forgettingCurve(
  stability: number,
  maxDays = 30,
  step = 0.5,
): { days: number; recall: number }[] {
  const points: { days: number; recall: number }[] = [];
  for (let t = 0; t <= maxDays + 1e-9; t += step) {
    points.push({ days: t, recall: recallAfter(stability, t) });
  }
  return points;
}

export interface CurveLine {
  key: 'stronger' | 'typical' | 'weaker';
  name: string;
  stability: number;
  reviewAfterDays: number;
  endRecall: number;
}

export interface Meter {
  done: number;
  need: number;
  text: string;
}

export interface TimeAxis {
  ticks: number[];
  lo: number;
  hi: number;
}

export interface MemoryView {
  state: 'building' | 'pace-pending' | 'ready';
  meters: { reviews: Meter; answers: Meter };
  tiles: StatTile[];
  curves: CurveLine[];
  time: {
    days: { day: string; seconds: number | null }[];
    axis: TimeAxis;
    pace: number | null;
  };
  gaps: { label: string; days: number; text: string }[];
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];

function wholeOrOneDecimal(n: number): string {
  if (n >= 10) return String(Math.round(n));
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function timeAxis(values: number[], pace: number | null): TimeAxis {
  const all = pace === null ? values : [...values, pace];
  if (all.length === 0) return { lo: 0, hi: 10, ticks: [0, 5, 10] };
  const lo = Math.max(0, Math.floor(Math.min(...all)) - 1);
  let hi = Math.ceil(Math.max(...all));
  if (hi - lo < 2) hi = lo + 2;
  if ((hi - lo) % 2 === 1) hi += 1;
  return { lo, hi, ticks: [lo, (lo + hi) / 2, hi] };
}

export function memoryView(m: ProgressMemory, today: string): MemoryView {
  const paceReady = m.rtCount >= ANSWERS_FOR_PACE && m.paceSeconds !== null;
  const state =
    m.adaptive === 0 ? 'building' : paceReady ? 'ready' : 'pace-pending';

  const meters = {
    reviews: {
      done: Math.min(m.mostReviews, REVIEWS_FOR_OWN_SCHEDULE),
      need: REVIEWS_FOR_OWN_SCHEDULE,
      text: `${Math.min(m.mostReviews, REVIEWS_FOR_OWN_SCHEDULE)} of ${REVIEWS_FOR_OWN_SCHEDULE}`,
    },
    answers: {
      done: Math.min(m.rtCount, ANSWERS_FOR_PACE),
      need: ANSWERS_FOR_PACE,
      text: `${Math.min(m.rtCount, ANSWERS_FOR_PACE)} of ${ANSWERS_FOR_PACE}`,
    },
  };

  const tiles: StatTile[] = [
    {
      label: 'Typical stability',
      value: m.stability ? `${Math.round(m.stability.median)} days` : '–',
      caption: m.stability
        ? `Median across ${m.adaptive} ${m.adaptive === 1 ? 'card' : 'cards'}. Higher means you forget more slowly.`
        : 'Appears once a card is on your own schedule.',
    },
    {
      label: 'Typical time to answer',
      value: paceReady
        ? `${(m.paceSeconds as number).toFixed(1)} s`
        : 'Pending…',
      caption: paceReady
        ? 'Recall compares each answer with your own pace.'
        : `${meters.answers.text} correct answers. Recall needs ${ANSWERS_FOR_PACE} to learn your pace.`,
    },
    {
      label: 'Cards on your own schedule',
      value: `${m.adaptive} of ${m.cards}`,
      caption: `After ${REVIEWS_FOR_OWN_SCHEDULE - 1} reviews a card moves to your own schedule.`,
    },
  ];

  const curves: CurveLine[] = m.stability
    ? (
        [
          ['stronger', 'Stronger cards', m.stability.p75],
          ['typical', 'Typical card', m.stability.median],
          ['weaker', 'Weaker cards', m.stability.p25],
        ] as const
      ).map(([key, name, stability]) => ({
        key,
        name,
        stability,
        reviewAfterDays: nextReviewDays(stability),
        endRecall: recallAfter(stability, 30),
      }))
    : [];

  const days = lastDays(today, 30);
  const timeDays = days.map((day) => ({
    day,
    seconds: m.dailyTime.find((r) => r.day === day)?.seconds ?? null,
  }));

  return {
    state,
    meters,
    tiles,
    curves,
    time: {
      days: timeDays,
      axis: timeAxis(
        timeDays.flatMap((d) => (d.seconds === null ? [] : [d.seconds])),
        paceReady ? m.paceSeconds : null,
      ),
      pace: paceReady ? m.paceSeconds : null,
    },
    gaps: m.gaps
      .filter((g) => g.n >= 1 && g.n <= ORDINALS.length)
      .map((g) => ({
        label: ORDINALS[g.n - 1]!,
        days: g.days,
        text: wholeOrOneDecimal(g.days),
      })),
  };
}
