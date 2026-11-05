-- «Мы»: таблица и функции для синхронизации.
-- Выполнить один раз: Supabase → SQL Editor → New query → вставить → Run.
-- На сервере лежит только шифротекст: ключ есть лишь у ваших телефонов.

create table if not exists public.records (
  room    text   not null,            -- идентификатор пары (хэш секретного кода)
  id      text   not null,            -- непрозрачный идентификатор записи
  payload text   not null,            -- зашифрованное содержимое (AES-GCM)
  u       bigint not null,            -- время правки на телефоне (мс)
  srv     bigint not null default 0,  -- серверное время записи (мкс), ставит триггер
  primary key (room, id)
);
create index if not exists records_room_srv on public.records (room, srv);

create or replace function public.records_set_srv() returns trigger language plpgsql as $$
begin
  new.srv := (extract(epoch from clock_timestamp()) * 1000000)::bigint;
  return new;
end $$;

drop trigger if exists records_srv on public.records;
create trigger records_srv before insert or update on public.records
  for each row execute function public.records_set_srv();

-- Напрямую в таблицу никто не ходит: доступ только через две функции ниже.
alter table public.records enable row level security;
revoke all on public.records from anon, authenticated;

create or replace function public.sync_pull(p_room text, p_since bigint, p_limit int default 500)
returns table (id text, payload text, u bigint, srv bigint)
language sql security definer set search_path = public as $$
  select r.id, r.payload, r.u, r.srv from public.records r
  where r.room = p_room and r.srv > p_since
  order by r.srv limit least(p_limit, 1000)
$$;

create or replace function public.sync_push(p_rows jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'bad rows'; end if;
  insert into public.records (room, id, payload, u)
  select x->>'room', x->>'id', x->>'payload',
         least((x->>'u')::bigint, (extract(epoch from now()) * 1000)::bigint + 300000)   -- время правки не дальше +5 минут
  from jsonb_array_elements(p_rows) x
  where (x->>'room') ~ '^[0-9a-f]{32}$' and (x->>'id') ~ '^[0-9a-f]{32}$' and length(x->>'payload') <= 65536
  on conflict (room, id) do update set payload = excluded.payload, u = excluded.u
  where public.records.u <= excluded.u;   -- побеждает более поздняя правка
end $$;

grant execute on function public.sync_pull(text, bigint, int) to anon;
grant execute on function public.sync_push(jsonb) to anon;
