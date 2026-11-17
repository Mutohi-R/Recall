-- Each deck has a colour, so the interface can tell decks apart.
--
-- Only an index from 0 to 11 is stored. It points into a fixed palette of
-- twelve colours held in the client, so the palette can be restyled without
-- touching the data.
--
-- The database picks the colour when the deck is created: the next index in
-- the cycle for that learner, counted from the number of decks they have
-- already made (archived ones included, so a deleted deck's colour is not
-- handed straight to the next one). Any value sent with the insert is
-- replaced, and the colour cannot be changed afterwards.

alter table public.decks add column colour smallint;

-- Decks that exist already get their colours in the order they were created.
update public.decks d
   set colour = r.n
  from (select id,
               ((row_number() over (partition by learner_id
                                    order by created_at, id)) - 1) % 12 as n
          from public.decks) r
 where d.id = r.id;

alter table public.decks alter column colour set not null;
alter table public.decks
  add constraint decks_colour_range check (colour between 0 and 11);

create function public.assign_deck_colour()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select (count(*) % 12)::smallint into new.colour
      from public.decks d
     where d.learner_id = new.learner_id;
  else
    new.colour := old.colour;
  end if;
  return new;
end;
$$;

create trigger on_deck_insert_colour
  before insert on public.decks
  for each row execute function public.assign_deck_colour();

create trigger on_deck_update_colour
  before update of colour on public.decks
  for each row execute function public.assign_deck_colour();