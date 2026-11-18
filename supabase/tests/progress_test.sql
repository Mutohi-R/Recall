-- Run on a scratch database after stub_supabase.sql and the migrations (it does
-- not depend on schema_test.sql, and uses its own learners):
--   psql -v ON_ERROR_STOP=1 -f stub_supabase.sql -f ../migrations/*.sql -f progress_test.sql
-- Each block raises an exception if an expectation fails.
--
-- The learner's clock is Africa/Lagos (UTC+1, no daylight saving), and "now" is
-- fixed at 2026-11-18 20:00 UTC, which is 21:00 on 18 November there.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'carol@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'dan@example.com');

insert into public.decks (id, learner_id, name, colour) values
  ('c1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'Biology',   0),
  ('c1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'Chemistry', 1),
  ('c1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c1', 'Old',       2);

insert into public.cards (id, deck_id, front, back) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'b1', 'a'),
  ('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'b2', 'a'),
  ('c2000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'b3', 'a'),
  ('c2000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000002', 'c1', 'a'),
  ('c2000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000002', 'c2', 'a'),
  ('c2000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000003', 'o1', 'a');

-- scheduling state (set directly: the scheduling engine is tested elsewhere)
update public.item_states set review_count = 5, stability = 10, due_at = '2026-11-20 20:00+00'
  where card_id = 'c2000000-0000-0000-0000-000000000001';           -- b1: due in 2 days
update public.item_states set review_count = 5, stability = 30, due_at = '2026-11-28 20:00+00'
  where card_id = 'c2000000-0000-0000-0000-000000000002';           -- b2: due in 10 days
                                                                    -- b3: new, due now
update public.item_states set review_count = 6, stability = 90, due_at = '2026-12-28 20:00+00'
  where card_id = 'c2000000-0000-0000-0000-000000000004';           -- c1: due in 40 days
update public.item_states set review_count = 2, stability = null, due_at = '2026-11-15 20:00+00'
  where card_id = 'c2000000-0000-0000-0000-000000000005';           -- c2: overdue, still on SM-2
update public.item_states set review_count = 1
  where card_id = 'c2000000-0000-0000-0000-000000000006';           -- o1

update public.learners set rt_count = 30, log_rt_mean = ln(6)
  where id = '00000000-0000-0000-0000-0000000000c1';

create temporary table card_item as
  select c.id as card_id, s.id as item_id from public.cards c join public.item_states s on s.card_id = c.id;

insert into public.review_logs (item_state_id, reviewed_at, correct, response_time_ms, path, interval_assigned)
select (select item_id from card_item where card_id = v.card), v.at::timestamptz, v.ok, v.ms, 'sm2', v.gap
from (values
  ('c2000000-0000-0000-0000-000000000001'::uuid, '2026-11-10 10:00+00', true,  5000, 1),
  ('c2000000-0000-0000-0000-000000000001'::uuid, '2026-11-12 10:00+00', true,  7000, 6),
  ('c2000000-0000-0000-0000-000000000001'::uuid, '2026-11-17 23:30+00', true,  6000, 15), -- 00:30 on the 18th in Lagos
  ('c2000000-0000-0000-0000-000000000005'::uuid, '2026-11-17 22:30+00', false, 3000, 0),  -- 23:30 on the 17th in Lagos
  ('c2000000-0000-0000-0000-000000000004'::uuid, '2026-11-18 09:00+00', true,  4000, 38),
  ('c2000000-0000-0000-0000-000000000004'::uuid, '2026-09-01 10:00+00', true,  8000, 1),  -- outside the 30 days
  ('c2000000-0000-0000-0000-000000000006'::uuid, '2026-11-16 10:00+00', true,  2000, 1)   -- card of a deck deleted later
) as v(card, at, ok, ms, gap);

-- deleting the deck archives its card
update public.decks set archived_at = now() where id = 'c1000000-0000-0000-0000-000000000003';

-- ---- Carol's Activity numbers
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);

do $$ declare a jsonb := public.progress_activity('2026-11-18 20:00+00', 'Africa/Lagos'); begin
  assert a->>'today' = '2026-11-18', 'today is the local date';
  assert (a->>'totalReviews')::int = 7, 'every review counts, including the old one';
  assert (a->'week'->>'reviews')::int = 5 and (a->'week'->>'recalled')::int = 4,
    'last 7 days: 5 reviews, 4 recalled (the 10 November one is out of range)';
  assert (a->>'newCards')::int = 2, 'two cards were first reviewed in the last 7 days';

  assert (select count(*) from jsonb_array_elements(a->'daily')) = 6, 'six day-and-deck rows; the September review is out';
  assert exists (select 1 from jsonb_array_elements(a->'daily') r
                  where r->>'day' = '2026-11-18' and r->>'deckId' = 'c1000000-0000-0000-0000-000000000001' and (r->>'count')::int = 1),
    '00:30 local on the 18th counts on the 18th, not the 17th (UTC)';
  assert exists (select 1 from jsonb_array_elements(a->'daily') r
                  where r->>'day' = '2026-11-17' and r->>'deckId' = 'c1000000-0000-0000-0000-000000000002'),
    '23:30 local on the 17th counts on the 17th';
  assert exists (select 1 from jsonb_array_elements(a->'daily') r
                  where r->>'deckId' = 'c1000000-0000-0000-0000-000000000003'),
    'reviews of a deleted deck stay in the history';

  assert a->'stages' = '{"new":1,"learning":2,"young":1,"mature":1}'::jsonb,
    'stages: new b3; learning b1 and overdue c2; young b2; mature c1 (deleted o1 left out)';

  assert (select count(*) from jsonb_array_elements(a->'due')) = 3, 'three due rows';
  assert exists (select 1 from jsonb_array_elements(a->'due') r
                  where (r->>'offset')::int = 0 and r->>'deckId' = 'c1000000-0000-0000-0000-000000000001' and (r->>'count')::int = 1),
    'the new card is due today';
  assert exists (select 1 from jsonb_array_elements(a->'due') r
                  where (r->>'offset')::int = 0 and r->>'deckId' = 'c1000000-0000-0000-0000-000000000002' and (r->>'count')::int = 1),
    'an overdue card counts as due today';
  assert exists (select 1 from jsonb_array_elements(a->'due') r
                  where (r->>'offset')::int = 2 and (r->>'count')::int = 1), 'b1 is due on day 2';
  assert (select count(*) from jsonb_array_elements(a->'decks')) = 3, 'all three decks are listed';
  assert (select (r->>'archived')::boolean from jsonb_array_elements(a->'decks') r where r->>'name' = 'Old'),
    'the deleted deck is marked archived';
end $$;

-- ---- Carol's Memory numbers
do $$ declare m jsonb := public.progress_memory('2026-11-18 20:00+00', 'Africa/Lagos'); begin
  assert (m->>'cards')::int = 5, 'five live cards';
  assert (m->>'adaptive')::int = 3, 'three cards have a stability';
  assert (m->>'mostReviews')::int = 6, 'the most reviewed live card has 6 reviews';
  assert abs((m->'stability'->>'median')::numeric - 30) < 0.0001, 'median stability';
  assert abs((m->'stability'->>'p25')::numeric - 20) < 0.0001, 'lower quartile';
  assert abs((m->'stability'->>'p75')::numeric - 60) < 0.0001, 'upper quartile';
  assert (m->>'rtCount')::int = 30, 'rt_count';
  assert abs((m->>'paceSeconds')::numeric - 6) < 0.001, 'pace is exp(log mean)';

  assert (select count(*) from jsonb_array_elements(m->'dailyTime')) = 4, 'four days with a correct answer';
  assert abs((select (r->>'seconds')::numeric from jsonb_array_elements(m->'dailyTime') r where r->>'day' = '2026-11-18') - 5) < 0.0001,
    'median of 6 s and 4 s on the 18th';
  assert not exists (select 1 from jsonb_array_elements(m->'dailyTime') r where r->>'day' = '2026-11-17'),
    'the wrong answer on the 17th is not in the answer times';

  assert abs((select (r->>'days')::numeric from jsonb_array_elements(m->'gaps') r where (r->>'n')::int = 1) - 0.75) < 0.0001
     and (select (r->>'count')::int from jsonb_array_elements(m->'gaps') r where (r->>'n')::int = 1) = 4,
    'first review: intervals 1, 0, 1, 1';
  assert abs((select (r->>'days')::numeric from jsonb_array_elements(m->'gaps') r where (r->>'n')::int = 2) - 22) < 0.0001,
    'second review: intervals 6 and 38';
  assert abs((select (r->>'days')::numeric from jsonb_array_elements(m->'gaps') r where (r->>'n')::int = 3) - 15) < 0.0001,
    'third review: interval 15';
  assert (select count(*) from jsonb_array_elements(m->'gaps')) = 3, 'only the review numbers that exist';
end $$;

-- ---- A learner with nothing sees zeros, and none of Carol's data
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
do $$ declare a jsonb := public.progress_activity('2026-11-18 20:00+00', 'Africa/Lagos');
                m jsonb := public.progress_memory('2026-11-18 20:00+00', 'Africa/Lagos'); begin
  assert (a->>'totalReviews')::int = 0 and (a->'week'->>'reviews')::int = 0, 'dan has no reviews';
  assert a->'stages' = '{"new":0,"learning":0,"young":0,"mature":0}'::jsonb, 'dan has no cards';
  assert a->'daily' = '[]'::jsonb and a->'due' = '[]'::jsonb and a->'decks' = '[]'::jsonb, 'dan sees none of carol''s rows';
  assert (m->>'cards')::int = 0 and (m->>'adaptive')::int = 0 and m->'stability' = 'null'::jsonb, 'dan has no stability';
  assert m->'dailyTime' = '[]'::jsonb and m->'gaps' = '[]'::jsonb, 'dan has no times or gaps';
  assert (m->>'rtCount')::int = 0 and m->'paceSeconds' = 'null'::jsonb, 'dan has no pace yet';
end $$;

-- ---- An unknown time zone is refused; a signed-out visitor cannot call at all
do $$ begin
  begin
    perform public.progress_activity(now(), 'Mars/Olympus');
    assert false, 'unknown time zone must be refused';
  exception when sqlstate '22023' then null; end;
end $$;
reset role;
set role anon;
do $$ begin
  begin
    perform public.progress_activity(now(), 'UTC');
    assert false, 'anon must not call progress_activity';
  exception when insufficient_privilege then null; end;
  begin
    perform public.progress_memory(now(), 'UTC');
    assert false, 'anon must not call progress_memory';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
