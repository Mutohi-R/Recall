-- Numbers for the Progress page.
--
-- Both functions run with the learner's own rights (security invoker), so Row
-- Level Security limits every count to that learner's cards and reviews.
--
-- A "day" is a day on the learner's own clock, which is why both functions take
-- the time zone the browser reports. Days are counted back from p_now, so a
-- review made at 23:30 local time belongs to that local day.
--
-- Cards and decks that were deleted (archived) leave the card stages and the
-- due chart, because those describe what is left to learn. Their reviews stay
-- in the review history, because the learner did do them.

-- ---------------------------------------------------------- Activity

create function public.progress_activity(p_now timestamptz, p_tz text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_today date;
  v_from  timestamptz;  -- start of the local day 29 days ago (30 days with today)
  v_week  timestamptz;  -- start of the local day 6 days ago (7 days with today)
  result  jsonb;
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;

  v_today := (p_now at time zone p_tz)::date;
  v_from  := ((v_today - 29)::timestamp) at time zone p_tz;
  v_week  := ((v_today - 6)::timestamp) at time zone p_tz;

  select jsonb_build_object(
    'today', v_today,

    'totalReviews', (select count(*) from public.review_logs),

    'week', (select jsonb_build_object(
               'reviews',  count(*),
               'recalled', count(*) filter (where l.correct))
             from public.review_logs l
             where l.reviewed_at >= v_week and l.reviewed_at <= p_now),

    -- cards whose first ever review fell inside the last 7 days
    'newCards', (select count(*) from (
                   select l.item_state_id
                     from public.review_logs l
                    group by l.item_state_id
                   having min(l.reviewed_at) >= v_week and min(l.reviewed_at) <= p_now
                 ) first_reviews),

    -- reviews per local day and deck, last 30 days (days with none are left out)
    'daily', coalesce((select jsonb_agg(
                 jsonb_build_object('day', t.day, 'deckId', t.deck_id, 'count', t.n)
                 order by t.day, t.deck_id)
               from (
                 select (l.reviewed_at at time zone p_tz)::date as day,
                        c.deck_id,
                        count(*) as n
                   from public.review_logs l
                   join public.item_states s on s.id = l.item_state_id
                   join public.cards c on c.id = s.card_id
                  where l.reviewed_at >= v_from and l.reviewed_at <= p_now
                  group by 1, 2
               ) t), '[]'::jsonb),

    -- where the learner's cards are, by how far away the next review is
    'stages', (select jsonb_build_object(
                 'new',      count(*) filter (where s.review_count = 0),
                 'learning', count(*) filter (where s.review_count > 0
                               and s.due_at < p_now + interval '7 days'),
                 'young',    count(*) filter (where s.review_count > 0
                               and s.due_at >= p_now + interval '7 days'
                               and s.due_at <  p_now + interval '30 days'),
                 'mature',   count(*) filter (where s.review_count > 0
                               and s.due_at >= p_now + interval '30 days'))
               from public.item_states s
               join public.cards c on c.id = s.card_id
               join public.decks d on d.id = c.deck_id
              where c.archived_at is null and d.archived_at is null),

    -- cards due on each of the next 7 local days; day 0 also holds everything overdue
    'due', coalesce((select jsonb_agg(
               jsonb_build_object('offset', t.day_offset, 'deckId', t.deck_id, 'count', t.n)
               order by t.day_offset, t.deck_id)
             from (
               select greatest(0, (s.due_at at time zone p_tz)::date - v_today) as day_offset,
                      c.deck_id,
                      count(*) as n
                 from public.item_states s
                 join public.cards c on c.id = s.card_id
                 join public.decks d on d.id = c.deck_id
                where c.archived_at is null and d.archived_at is null
                  and (s.due_at at time zone p_tz)::date - v_today <= 6
                group by 1, 2
             ) t), '[]'::jsonb),

    'decks', coalesce((select jsonb_agg(
                jsonb_build_object(
                  'id', d.id, 'name', d.name, 'colour', d.colour,
                  'archived', d.archived_at is not null)
                order by d.created_at, d.id)
              from public.decks d), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- ------------------------------------------------------------ Memory

create function public.progress_memory(p_now timestamptz, p_tz text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_today   date;
  v_from    timestamptz;
  v_quart   double precision[];
  v_logmean numeric;
  v_rtcount integer;
  result    jsonb;
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;

  v_today := (p_now at time zone p_tz)::date;
  v_from  := ((v_today - 29)::timestamp) at time zone p_tz;

  -- stability of the cards that are on the adaptive schedule
  select percentile_cont(array[0.25, 0.5, 0.75]) within group (order by s.stability)
    into v_quart
    from public.item_states s
    join public.cards c on c.id = s.card_id
    join public.decks d on d.id = c.deck_id
   where c.archived_at is null and d.archived_at is null
     and s.stability is not null;

  select l.log_rt_mean, l.rt_count
    into v_logmean, v_rtcount
    from public.learners l
   where l.id = (select auth.uid());

  select jsonb_build_object(
    'cards',      (select count(*)
                     from public.item_states s
                     join public.cards c on c.id = s.card_id
                     join public.decks d on d.id = c.deck_id
                    where c.archived_at is null and d.archived_at is null),

    'adaptive',   (select count(*)
                     from public.item_states s
                     join public.cards c on c.id = s.card_id
                     join public.decks d on d.id = c.deck_id
                    where c.archived_at is null and d.archived_at is null
                      and s.stability is not null),

    'mostReviews', (select coalesce(max(s.review_count), 0)
                      from public.item_states s
                      join public.cards c on c.id = s.card_id
                      join public.decks d on d.id = c.deck_id
                     where c.archived_at is null and d.archived_at is null),

    'stability',  case when v_quart is null then null
                       else jsonb_build_object(
                              'p25', v_quart[1], 'median', v_quart[2], 'p75', v_quart[3]) end,

    -- the learner's own pace: the geometric mean of their correct answer times
    'rtCount',    coalesce(v_rtcount, 0),
    'paceSeconds', case when v_logmean is null then null else exp(v_logmean) end,

    -- median seconds to answer, per local day, for correct answers
    'dailyTime',  coalesce((select jsonb_agg(
                    jsonb_build_object('day', t.day, 'seconds', t.seconds) order by t.day)
                  from (
                    select (l.reviewed_at at time zone p_tz)::date as day,
                           percentile_cont(0.5) within group (order by l.response_time_ms) / 1000.0 as seconds
                      from public.review_logs l
                     where l.correct
                       and l.reviewed_at >= v_from and l.reviewed_at <= p_now
                     group by 1
                  ) t), '[]'::jsonb),

    -- average days until the next review, by how many times the card had been reviewed
    'gaps',       coalesce((select jsonb_agg(
                    jsonb_build_object('n', t.n, 'days', t.days, 'count', t.cnt) order by t.n)
                  from (
                    select r.n, avg(r.interval_assigned) as days, count(*) as cnt
                      from (
                        select l.interval_assigned,
                               row_number() over (partition by l.item_state_id order by l.reviewed_at) as n
                          from public.review_logs l
                      ) r
                     where r.n <= 7
                     group by r.n
                  ) t), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke execute on function public.progress_activity(timestamptz, text) from public, anon;
revoke execute on function public.progress_memory(timestamptz, text)   from public, anon;
grant execute on function public.progress_activity(timestamptz, text) to authenticated, service_role;
grant execute on function public.progress_memory(timestamptz, text)   to authenticated, service_role;
