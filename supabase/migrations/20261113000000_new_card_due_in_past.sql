-- A new card's first due time is set one minute in the past.
--
-- It was set to the database's now(). The server that builds the review queue
-- compares due times against its own clock, and when that clock is even a
-- second behind the database's, a card created a moment ago looked as if it
-- were due in the future and was left out of the queue. The first due time is
-- only used to decide when a card enters the queue; the scheduling algorithm
-- does not read it (the first review has no previous review to measure from),
-- so backdating it changes nothing else.
create or replace function public.handle_new_card()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.item_states (learner_id, card_id, due_at)
  select d.learner_id, new.id, now() - interval '1 minute'
  from public.decks d where d.id = new.deck_id;
  return new;
end;
$$;