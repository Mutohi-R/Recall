drop function public.deck_summaries(timestamptz);

create function public.deck_summaries(p_now timestamptz)
returns table (
  id           uuid,
  name         text,
  colour       smallint,
  created_at   timestamptz,
  card_count   integer,
  due_count    integer,
  next_due_at  timestamptz
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
         (count(s.id) filter (where s.due_at <= p_now))::integer,
         min(s.due_at) filter (where s.due_at > p_now)
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