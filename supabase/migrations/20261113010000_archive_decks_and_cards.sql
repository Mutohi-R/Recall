-- Deleting a deck or a card archives it instead of removing it.
--
-- A hard delete would cascade to the item's scheduling record and its review
-- log rows, and the evaluation needs that history (3.3.1, 3.8). Archiving
-- hides the deck or card from the learner and from the review queue while
-- every review that was recorded stays in place.

alter table public.decks add column archived_at timestamptz;
alter table public.cards add column archived_at timestamptz;

-- Archiving a deck archives the cards in it, so none of them can appear in the
-- review queue once their deck is gone.
create function public.archive_deck_cards()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    update public.cards
       set archived_at = new.archived_at
     where deck_id = new.id and archived_at is null;
  end if;
  return new;
end;
$$;

create trigger on_deck_archived
  after update of archived_at on public.decks
  for each row execute function public.archive_deck_cards();

-- A card cannot be added to a deck that has been archived.
drop policy cards_insert_own on public.cards;
create policy cards_insert_own on public.cards
  for insert to authenticated
  with check (exists (select 1 from public.decks d
                      where d.id = cards.deck_id
                        and d.learner_id = (select auth.uid())
                        and d.archived_at is null));