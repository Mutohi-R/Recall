-- ---------------------------------------------------------------- tables

create table public.learners (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null,
  prior_stability numeric check (prior_stability is null or prior_stability > 0),
  log_rt_mean     numeric,
  log_rt_sd       numeric check (log_rt_sd is null or log_rt_sd >= 0),
  rt_count        integer not null default 0 check (rt_count >= 0),
  created_at      timestamptz not null default now()
);

create table public.decks (
  id          uuid primary key default gen_random_uuid(),
  learner_id  uuid not null references public.learners (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  created_at  timestamptz not null default now()
);

create table public.cards (
  id          uuid primary key default gen_random_uuid(),
  deck_id     uuid not null references public.decks (id) on delete cascade,
  front       text not null check (length(btrim(front)) > 0),
  back        text not null check (length(btrim(back)) > 0),
  created_at  timestamptz not null default now()
);

create table public.item_states (
  id              uuid primary key default gen_random_uuid(),
  learner_id      uuid not null references public.learners (id) on delete cascade,
  card_id         uuid not null references public.cards (id) on delete cascade,
  stability       numeric check (stability is null or stability > 0),
  review_count    integer not null default 0 check (review_count >= 0),
  last_reviewed   timestamptz,
  due_at          timestamptz not null default now(),
  sm2_easiness    numeric not null default 2.5 check (sm2_easiness >= 1.3),
  sm2_interval    integer not null default 0 check (sm2_interval >= 0),
  sm2_repetitions integer not null default 0 check (sm2_repetitions >= 0),
  unique (learner_id, card_id)
);

create table public.review_logs (
  id                uuid primary key default gen_random_uuid(),
  item_state_id     uuid not null references public.item_states (id) on delete cascade,
  reviewed_at       timestamptz not null,
  correct           boolean not null,
  response_time_ms  integer not null check (response_time_ms > 0),
  elapsed_days      numeric check (elapsed_days is null or elapsed_days >= 0),
  path              text not null check (path in ('sm2', 'adaptive')),
  interval_assigned numeric not null check (interval_assigned >= 0)
);

create index decks_learner_idx        on public.decks (learner_id);
create index cards_deck_idx           on public.cards (deck_id);
create index item_states_due_idx      on public.item_states (learner_id, due_at);
create index review_logs_item_idx     on public.review_logs (item_state_id, reviewed_at);

-- ------------------------------------------------------------- triggers

-- A learner row is created when an account is created. Its id is the id
-- issued by Supabase authentication.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.learners (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts created before this migration ran get their learner row too.
insert into public.learners (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- A new card gets its scheduling record straight away, so it appears in the
-- review queue as due now and starts on the SM-2 fallback with the default
-- E-Factor of 2.5.
create function public.handle_new_card()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.item_states (learner_id, card_id)
  select d.learner_id, new.id from public.decks d where d.id = new.deck_id;
  return new;
end;
$$;

create trigger on_card_created
  after insert on public.cards
  for each row execute function public.handle_new_card();

-- ------------------------------------------------- privileges and RLS

revoke all on public.learners, public.decks, public.cards,
              public.item_states, public.review_logs
  from anon, authenticated;

grant select                 on public.learners    to authenticated;
grant select, insert, update on public.decks       to authenticated;
grant select, insert, update on public.cards       to authenticated;
grant select                 on public.item_states to authenticated;
grant select                 on public.review_logs to authenticated;

grant all on public.learners, public.decks, public.cards,
             public.item_states, public.review_logs
  to service_role;

alter table public.learners    enable row level security;
alter table public.decks       enable row level security;
alter table public.cards       enable row level security;
alter table public.item_states enable row level security;
alter table public.review_logs enable row level security;

create policy learners_select_own on public.learners
  for select to authenticated
  using (id = (select auth.uid()));

create policy decks_select_own on public.decks
  for select to authenticated
  using (learner_id = (select auth.uid()));
create policy decks_insert_own on public.decks
  for insert to authenticated
  with check (learner_id = (select auth.uid()));
create policy decks_update_own on public.decks
  for update to authenticated
  using (learner_id = (select auth.uid()))
  with check (learner_id = (select auth.uid()));

create policy cards_select_own on public.cards
  for select to authenticated
  using (exists (select 1 from public.decks d
                 where d.id = cards.deck_id and d.learner_id = (select auth.uid())));
create policy cards_insert_own on public.cards
  for insert to authenticated
  with check (exists (select 1 from public.decks d
                      where d.id = cards.deck_id and d.learner_id = (select auth.uid())));
create policy cards_update_own on public.cards
  for update to authenticated
  using (exists (select 1 from public.decks d
                 where d.id = cards.deck_id and d.learner_id = (select auth.uid())))
  with check (exists (select 1 from public.decks d
                      where d.id = cards.deck_id and d.learner_id = (select auth.uid())));

create policy item_states_select_own on public.item_states
  for select to authenticated
  using (learner_id = (select auth.uid()));

create policy review_logs_select_own on public.review_logs
  for select to authenticated
  using (exists (select 1 from public.item_states s
                 where s.id = review_logs.item_state_id
                   and s.learner_id = (select auth.uid())));

-- ------------------------------------------------------- record_review

-- Stores the result of one review in a single transaction: the item's new
-- state, the learner's updated statistics and prior, and the review log row.
--
-- The scheduling decision is made in TypeScript (the engine is the same
-- module the simulation runs), so the values arrive already computed. Two
-- checks guard against a second request having changed the same rows while
-- this one was being computed:
--   RC409  the item's review_count or the learner's rt_count is no longer
--          what the caller read
--   RC404  the item does not exist or does not belong to the learner
--
-- Callable only with the secret key (service_role); a signed-in browser
-- cannot call it.
create function public.record_review(
  p_learner_id             uuid,
  p_item_state_id          uuid,
  p_expected_review_count  integer,
  p_expected_rt_count      integer,
  -- new item state
  p_stability              numeric,
  p_review_count           integer,
  p_last_reviewed          timestamptz,
  p_due_at                 timestamptz,
  p_sm2_easiness           numeric,
  p_sm2_interval           integer,
  p_sm2_repetitions        integer,
  -- new learner state
  p_prior_stability        numeric,
  p_log_rt_mean            numeric,
  p_log_rt_sd              numeric,
  p_rt_count               integer,
  -- review log row
  p_correct                boolean,
  p_response_time_ms       integer,
  p_elapsed_days           numeric,
  p_path                   text,
  p_interval_assigned      numeric
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_review_count integer;
  v_rt_count     integer;
  v_log_id       uuid;
begin
  select s.review_count into v_review_count
    from public.item_states s
   where s.id = p_item_state_id and s.learner_id = p_learner_id
   for update;
  if not found then
    raise exception 'item_not_found' using errcode = 'RC404';
  end if;

  select l.rt_count into v_rt_count
    from public.learners l
   where l.id = p_learner_id
   for update;

  if v_review_count <> p_expected_review_count
     or v_rt_count <> p_expected_rt_count then
    raise exception 'review_conflict' using errcode = 'RC409';
  end if;

  update public.item_states
     set stability       = p_stability,
         review_count    = p_review_count,
         last_reviewed   = p_last_reviewed,
         due_at          = p_due_at,
         sm2_easiness    = p_sm2_easiness,
         sm2_interval    = p_sm2_interval,
         sm2_repetitions = p_sm2_repetitions
   where id = p_item_state_id;

  update public.learners
     set prior_stability = p_prior_stability,
         log_rt_mean     = p_log_rt_mean,
         log_rt_sd       = p_log_rt_sd,
         rt_count        = p_rt_count
   where id = p_learner_id;

  insert into public.review_logs
    (item_state_id, reviewed_at, correct, response_time_ms,
     elapsed_days, path, interval_assigned)
  values
    (p_item_state_id, p_last_reviewed, p_correct, p_response_time_ms,
     p_elapsed_days, p_path, p_interval_assigned)
  returning id into v_log_id;

  return v_log_id;
end;
$$;

revoke execute on function public.record_review(
  uuid, uuid, integer, integer, numeric, integer, timestamptz, timestamptz,
  numeric, integer, integer, numeric, numeric, numeric, integer,
  boolean, integer, numeric, text, numeric)
  from public, anon, authenticated;
grant execute on function public.record_review(
  uuid, uuid, integer, integer, numeric, integer, timestamptz, timestamptz,
  numeric, integer, integer, numeric, numeric, numeric, integer,
  boolean, integer, numeric, text, numeric)
  to service_role;
