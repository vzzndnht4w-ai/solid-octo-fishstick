-- «Мы»: таблицы и функции для push-уведомлений.
-- Выполнить один раз: Supabase → SQL Editor → New query → вставить → Run.
-- Сначала должна быть выполнена установка синхронизации (docs/supabase.sql).
-- Тексты уведомлений общие, без сумм и названий: они хранятся на сервере открытым текстом.

create table if not exists public.push_subs (
  device_id  text primary key,          -- случайный идентификатор телефона
  room       text not null,             -- идентификатор пары (как в синхронизации)
  person     text,                      -- 'max' | 'dinara'
  sub        jsonb not null,            -- подписка браузера (endpoint и ключи)
  created_at timestamptz not null default now()
);
create index if not exists push_subs_room on public.push_subs (room);

create table if not exists public.push_reminders (
  id        bigint generated always as identity primary key,
  room      text not null,
  device_id text not null,
  fire_at   timestamptz not null,       -- когда отправить
  title     text not null,
  body      text not null default '',
  url       text not null default './',
  tag       text
);
create index if not exists push_reminders_fire on public.push_reminders (fire_at);
create index if not exists push_reminders_dev on public.push_reminders (device_id);

-- Журнал отправок для ограничения частоты (чистит сама функция we-push).
create table if not exists public.push_log (
  room text not null,
  at   timestamptz not null default now()
);
create index if not exists push_log_room_at on public.push_log (room, at);

-- Напрямую в таблицы никто не ходит: доступ только через функции ниже и Edge Function.
alter table public.push_subs enable row level security;
alter table public.push_reminders enable row level security;
alter table public.push_log enable row level security;
revoke all on public.push_subs, public.push_reminders, public.push_log from anon, authenticated;

create or replace function public.push_register(p_room text, p_device text, p_person text, p_sub jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(length(p_room), 0) < 8 or coalesce(length(p_device), 0) < 8 then raise exception 'bad args'; end if;
  -- защита от подмены адреса: принимаем только настоящие push-сервисы (Apple, Google, Mozilla, Microsoft)
  if length(p_sub::text) > 4000 or coalesce(p_sub->>'endpoint', '') !~ '^https://([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)/' then raise exception 'bad subscription'; end if;
  insert into public.push_subs (device_id, room, person, sub)
  values (p_device, p_room, p_person, p_sub)
  on conflict (device_id) do update set room = excluded.room, person = excluded.person, sub = excluded.sub
  where public.push_subs.room = excluded.room;
end $$;

create or replace function public.push_unregister(p_room text, p_device text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_reminders where room = p_room and device_id = p_device;
  delete from public.push_subs where room = p_room and device_id = p_device;
end $$;

-- Заменяет ВСЕ напоминания этого телефона (не больше 100).
create or replace function public.push_set_reminders(p_room text, p_device text, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(length(p_room), 0) < 8 or coalesce(length(p_device), 0) < 8 then raise exception 'bad args'; end if;
  delete from public.push_reminders where room = p_room and device_id = p_device;
  insert into public.push_reminders (room, device_id, fire_at, title, body, url, tag)
  select p_room, p_device, (x->>'fire_at')::timestamptz, left(x->>'title', 120), left(coalesce(x->>'body', ''), 240),
         left(coalesce(x->>'url', './'), 200), left(x->>'tag', 80)
  from (select x from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) x limit 100) t
  where x->>'fire_at' is not null and x->>'title' is not null;
end $$;

grant execute on function public.push_register(text, text, text, jsonb) to anon;
grant execute on function public.push_unregister(text, text) to anon;
grant execute on function public.push_set_reminders(text, text, jsonb) to anon;
