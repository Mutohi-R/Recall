-- Run on a scratch database after stub_supabase.sql and the migration:
--   psql -v ON_ERROR_STOP=1 -f stub_supabase.sql -f ../migrations/*.sql -f schema_test.sql
-- (the migrations are applied in file-name order)
-- Each block raises an exception if an expectation fails.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com');

do $$ begin
  assert (select count(*) from public.learners) = 2, 'learner rows created from auth.users';
  assert (select rt_count from public.learners where email = 'alice@example.com') = 0;
end $$;

-- ---- Alice creates a deck and a card
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.decks (id, learner_id, name)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Biology');
insert into public.cards (id, deck_id, front, back)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Q', 'A');

do $$ declare s public.item_states; begin
  select * into s from public.item_states;
  assert s.learner_id = '00000000-0000-0000-0000-00000000000a', 'item state owned by deck owner';
  assert s.review_count = 0 and s.stability is null and s.sm2_easiness = 2.5, 'cold-start defaults';
  assert s.due_at <= now() - interval '30 seconds', 'new card is already due, with margin for clock differences';
end $$;

-- ---- Alice cannot forge scheduling state or call record_review
do $$ begin
  begin
    update public.item_states set stability = 999;
    assert false, 'authenticated update of item_states must be refused';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.review_logs (item_state_id, reviewed_at, correct, response_time_ms, path, interval_assigned)
      select id, now(), true, 1000, 'adaptive', 1 from public.item_states;
    assert false, 'authenticated insert into review_logs must be refused';
  exception when insufficient_privilege then null; end;
  begin
    update public.learners set rt_count = 50;
    assert false, 'authenticated update of learners must be refused';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.cards;
    assert false, 'delete must be refused';
  exception when insufficient_privilege then null; end;
  begin
    perform public.record_review('00000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-000000000000',0,0,
      1,1,now(),now(),2.5,1,1,1,0,0,1,true,1000,0,'sm2',1);
    assert false, 'authenticated call of record_review must be refused';
  exception when insufficient_privilege then null; end;
end $$;

-- ---- Bob sees nothing of Alice's and cannot add to her deck
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert (select count(*) from public.decks) = 0, 'bob sees no decks';
  assert (select count(*) from public.cards) = 0, 'bob sees no cards';
  assert (select count(*) from public.item_states) = 0, 'bob sees no item states';
  assert (select count(*) from public.learners) = 1, 'bob sees only himself';
  begin
    insert into public.cards (deck_id, front, back)
      values ('10000000-0000-0000-0000-000000000001', 'x', 'y');
    assert false, 'bob must not insert into alice''s deck';
  exception when insufficient_privilege or check_violation then null; end;
  begin
    insert into public.decks (learner_id, name)
      values ('00000000-0000-0000-0000-00000000000a', 'forged');
    assert false, 'bob must not create a deck for alice';
  exception when insufficient_privilege or check_violation then null; end;
  update public.decks set name = 'hijack';
  assert true;
end $$;
reset role;
do $$ begin
  assert (select name from public.decks) = 'Biology', 'bob update changed nothing';
  assert (select count(*) from public.cards) = 1, 'no card slipped into alice deck';
end $$;

-- ---- record_review through the secret-key role
set role service_role;
do $$
declare
  v_item uuid := (select id from public.item_states);
  v_log  uuid;
begin
  v_log := public.record_review(
    '00000000-0000-0000-0000-00000000000a', v_item, 0, 0,
    null, 1, '2026-11-12 10:00+00', '2026-11-13 10:00+00', 2.6, 1, 1,
    null, -0.5, 0, 1,
    true, 1800, null, 'sm2', 1);
  assert v_log is not null;
  assert (select review_count from public.item_states) = 1;
  assert (select due_at from public.item_states) = '2026-11-13 10:00+00';
  assert (select rt_count from public.learners where email = 'alice@example.com') = 1;
  assert (select path from public.review_logs) = 'sm2';

  -- stale expectations are refused and change nothing
  begin
    perform public.record_review('00000000-0000-0000-0000-00000000000a', v_item, 0, 1,
      null, 2, now(), now(), 2.6, 1, 2, null, 0, 0, 2, true, 1000, 1, 'sm2', 6);
    assert false, 'stale review_count must conflict';
  exception when sqlstate 'RC409' then null; end;
  begin
    perform public.record_review('00000000-0000-0000-0000-00000000000a', v_item, 1, 0,
      null, 2, now(), now(), 2.6, 1, 2, null, 0, 0, 2, true, 1000, 1, 'sm2', 6);
    assert false, 'stale rt_count must conflict';
  exception when sqlstate 'RC409' then null; end;
  assert (select count(*) from public.review_logs) = 1, 'conflicts wrote no log row';

  -- another learner's id cannot reach this item
  begin
    perform public.record_review('00000000-0000-0000-0000-00000000000b', v_item, 1, 0,
      null, 2, now(), now(), 2.6, 1, 2, null, 0, 0, 1, true, 1000, 1, 'sm2', 6);
    assert false, 'wrong learner must not find the item';
  exception when sqlstate 'RC404' then null; end;

  -- table constraints still apply
  begin
    perform public.record_review('00000000-0000-0000-0000-00000000000a', v_item, 1, 1,
      null, 2, now(), now(), 2.6, 1, 2, null, 0, 0, 2, true, 1000, 1, 'bogus', 6);
    assert false, 'unknown path must be refused';
  exception when check_violation then null; end;
  assert (select review_count from public.item_states) = 1, 'failed call rolled back';
end $$;
reset role;

-- ---- Alice sees her own review log, Bob does not
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin assert (select count(*) from public.review_logs) = 1, 'alice sees her log'; end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin assert (select count(*) from public.review_logs) = 0, 'bob sees no logs'; end $$;
reset role;

-- ---- Archiving: nothing is deleted, cards follow their deck, no cards in an archived deck
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.cards (id, deck_id, front, back)
  values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Q2', 'A2');

update public.cards set archived_at = now() where id = '20000000-0000-0000-0000-000000000002';
do $$ begin
  assert (select archived_at from public.cards where id = '20000000-0000-0000-0000-000000000002') is not null,
    'a card can be archived by its owner';
  assert (select archived_at from public.cards where id = '20000000-0000-0000-0000-000000000001') is null,
    'archiving one card leaves the others';
end $$;

update public.decks set archived_at = now() where id = '10000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.cards where archived_at is null) = 0, 'archiving a deck archives its cards';
  assert (select count(*) from public.cards) = 2, 'archived cards still exist';
  assert (select count(*) from public.item_states) = 2, 'scheduling records still exist';
  begin
    insert into public.cards (deck_id, front, back)
      values ('10000000-0000-0000-0000-000000000001', 'late', 'late');
    assert false, 'no new cards in an archived deck';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.review_logs) = 1, 'review history is untouched by archiving';
end $$;

-- Bob cannot archive Alice's things
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
update public.cards set archived_at = null;
update public.decks set archived_at = null;
reset role;
do $$ begin
  assert (select archived_at from public.decks) is not null, 'bob cannot touch alice''s deck';
end $$;


-- ---- Deck colours: chosen by the database, cycling through twelve, fixed once set
-- Alice already has one deck (Biology, archived above).
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.decks (id, learner_id, name, colour)
  values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Chemistry', 7);
do $$ begin
  assert (select colour from public.decks where name = 'Biology') = 0, 'first deck gets colour 0';
  assert (select colour from public.decks where name = 'Chemistry') = 1,
    'next deck gets the next index; a colour sent with the insert is ignored';
end $$;

insert into public.decks (learner_id, name)
  select '00000000-0000-0000-0000-00000000000a', 'Deck ' || g from generate_series(3, 13) g;
do $$ begin
  assert (select colour from public.decks where name = 'Deck 12') = 11, 'twelfth deck gets colour 11';
  assert (select colour from public.decks where name = 'Deck 13') = 0, 'the cycle wraps back to 0';
  assert (select min(colour) from public.decks) = 0 and (select max(colour) from public.decks) = 11,
    'every colour is inside the palette';
end $$;

update public.decks set colour = 9 where name = 'Chemistry';
do $$ begin
  assert (select colour from public.decks where name = 'Chemistry') = 1, 'the colour cannot be changed afterwards';
end $$;

-- Colours are counted per learner
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
insert into public.decks (learner_id, name)
  values ('00000000-0000-0000-0000-00000000000b', 'Physics');
do $$ begin
  assert (select colour from public.decks where name = 'Physics') = 0, 'a new learner starts again at 0';
end $$;
reset role;


-- ---- Deck summaries: card and due counts per deck, archived rows left out
-- Alice has decks Biology (archived) and Chemistry, Deck 3 to Deck 13 from above.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.cards (id, deck_id, front, back) values
  ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000002', 'c1', 'a1'),
  ('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000002', 'c2', 'a2'),
  ('20000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000002', 'c3', 'a3');
update public.cards set archived_at = now() where id = '20000000-0000-0000-0000-000000000013';
do $$ declare r record; begin
  select * into r from public.deck_summaries(now()) where name = 'Chemistry';
  assert r.card_count = 2, 'archived cards are not counted';
  assert r.due_count = 2, 'new cards are due now';
  assert r.colour = 1, 'summary carries the colour';
  assert not exists (select 1 from public.deck_summaries(now()) where name = 'Biology'), 'archived decks are left out';
  assert (select count(*) from public.deck_summaries(now())) = 12, 'twelve active decks';
  select * into r from public.deck_summaries(now() - interval '1 day') where name = 'Chemistry';
  assert r.due_count = 0, 'nothing is due as of yesterday';
  assert (select card_count from public.deck_summaries(now()) where name = 'Deck 3') = 0, 'an empty deck has 0 cards, 0 due';
end $$;

-- Bob sees only his own decks
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert (select count(*) from public.deck_summaries(now())) = 1, 'bob sees only his own deck';
  assert (select name from public.deck_summaries(now())) = 'Physics';
end $$;
reset role;

select 'schema tests passed' as result;