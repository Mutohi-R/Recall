-- The deck list shows, for every deck, how many cards it holds and how many
-- of them are due (3.7). Counting them here keeps it to one query, however
-- many cards a learner has; counting in the server would mean fetching every
-- due row, and the API returns at most 1000 rows per request.
--
-- The caller passes the time to count against, so the number agrees with the
-- review queue, which compares due times against the server's own clock.
--
-- The function runs with the caller's rights (security invoker), so Row Level
-- Security decides which decks, cards and item states are counted. Archived
-- decks and cards are left out.

create function public.deck_summaries(p_now timestamptz)
returns table (
  id          uuid,
  name        text,
  colour      smallint,
  created_at  timestamptz,
  card_count  integer,
  due_count   integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select d.id,
         d.name,
         d.colour,
         d.created_at,
         count(c.id)::integer,
         (count(s.id) filter (where s.due_at <= p_now))::integer
    from public.decks d
    left join public.cards c
           on c.deck_id = d.id and c.archived_at is null
    left join public.item_states s
           on s.card_id = c.id
   where d.archived_at is null
   group by d.id
   order by d.created_at, d.id
$$;

revoke execute on function public.deck_summaries(timestamptz) from public, anon;
grant execute on function public.deck_summaries(timestamptz) to authenticated, service_role;