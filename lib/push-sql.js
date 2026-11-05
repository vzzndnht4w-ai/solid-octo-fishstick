// Копия docs/supabase-push.sql и docs/edge-function-we-push.ts: показывается в приложении кнопками «Скопировать».
// При правке исходников в docs/ обновите и этот файл.
export const PUSH_SQL = `-- «Мы»: таблицы и функции для push-уведомлений.
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
`;

export const FUNCTION_CODE = `// Edge Function «we-push» для приложения «Мы».
// Supabase → Edge Functions → Deploy a new function → Via Editor, имя: we-push, ВЫКЛЮЧИТЬ «Verify JWT».
// Секреты (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (например mailto:you@example.com).
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};
const MAX_PER_MINUTE = 20;   // не чаще стольких уведомлений в минуту на пару

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
let vapidReady = false;
function initVapid() {
  if (vapidReady) return;
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
  vapidReady = true;
}

const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n);
const safeUrl = (u: unknown) => { const s = clip(u, 200); return /^\\.\\/[\\w?=&%.\\-]*$/.test(s) ? s : './'; };

/** Отправляет одно уведомление; при 404/410 удаляет подписку. Возвращает true, если доставлено. */
const lastErrors: { status?: number; msg: string }[] = [];
async function sendOne(sub: any, payload: unknown): Promise<boolean> {
  try {
    await webpush.sendNotification(sub.sub, JSON.stringify(payload), { TTL: 3600 });
    return true;
  } catch (e: any) {
    if (e?.statusCode === 404 || e?.statusCode === 410) await db.from('push_subs').delete().eq('device_id', sub.device_id);
    else console.error('push failed', sub.device_id, e?.statusCode, e?.body);
    lastErrors.push({ status: e?.statusCode, msg: String(e?.body || e?.message || e).slice(0, 160) });
    return false;
  }
}

async function notify(b: any) {
  const room = clip(b.room, 64);
  if (room.length < 8) return reply(400, { error: 'bad_room' });
  // Комната должна существовать (есть записи синхронизации или подписки).
  const { data: rec } = await db.from('records').select('id').eq('room', room).limit(1);
  const { data: any1 } = rec?.length ? { data: rec } : await db.from('push_subs').select('device_id').eq('room', room).limit(1);
  if (!any1?.length) return reply(404, { error: 'no_room' });
  // Ограничение частоты.
  const since = new Date(Date.now() - 60000).toISOString();
  const { count } = await db.from('push_log').select('*', { count: 'exact', head: true }).eq('room', room).gte('at', since);
  if ((count ?? 0) >= MAX_PER_MINUTE) return reply(429, { error: 'rate_limited' });
  await db.from('push_log').insert({ room });
  await db.from('push_log').delete().lt('at', new Date(Date.now() - 3600000).toISOString());

  let q = db.from('push_subs').select('device_id, sub').eq('room', room);
  if (!b.include_self && b.from_device) q = q.neq('device_id', clip(b.from_device, 80));
  const { data: all } = await q;
  // Телефон при регистрации сообщает, какие события ему нужны (sub.prefs.partnerAdds / partnerReacts).
  const pref = b.kind === 'tx' ? 'partnerAdds' : b.kind === 'react' ? 'partnerReacts' : '';
  const subs = (all ?? []).filter((s: any) => !pref || b.include_self || s.sub?.prefs?.[pref] !== false);
  const payload = { title: clip(b.title, 120) || 'Мы', body: clip(b.body, 240), url: safeUrl(b.url), tag: clip(b.tag, 80) || 'we-event' };
  initVapid();
  lastErrors.length = 0;
  const results = await Promise.all(subs.map((s: any) => sendOne(s, payload)));
  return reply(200, { ok: true, sent: results.filter(Boolean).length, devices: results.length, errors: lastErrors.slice(0, 3) });
}

async function tick() {
  // Забираем и удаляем наступившие напоминания одним запросом (параллельные запуски не задвоят).
  const { data: due, error } = await db.from('push_reminders').delete().lte('fire_at', new Date().toISOString()).select('device_id, title, body, url, tag');
  if (error) return reply(500, { error: error.message });
  if (!due?.length) return reply(200, { ok: true, sent: 0 });
  const ids = [...new Set(due.map((r: any) => r.device_id))];
  const { data: subs } = await db.from('push_subs').select('device_id, sub').in('device_id', ids);
  const byDev = new Map((subs ?? []).map((s: any) => [s.device_id, s]));
  initVapid();
  let sent = 0;
  for (const r of due.slice(0, 200)) {
    const s = byDev.get(r.device_id);
    if (s && await sendOne(s, { title: r.title, body: r.body, url: safeUrl(r.url), tag: r.tag || 'we-reminder' })) sent++;
  }
  return reply(200, { ok: true, sent, due: due.length });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'method' });
  try {
    const b = await req.json().catch(() => ({}));
    if (b.action === 'notify') return await notify(b);
    if (b.action === 'tick') return await tick();
    return reply(400, { error: 'bad_action' });
  } catch (e: any) {
    console.error(e);
    return reply(500, { error: String(e?.message || e) });
  }
});
`;

const q = (s) => String(s).replace(/'/g, "''");

/** SQL для pg_cron + pg_net: раз в минуту вызывает we-push с {"action":"tick"}. Адрес и ключ подставляются из подключения. */
export function buildCronSql(url, key) {
  const base = String(url || '').replace(/\/+$/, ''), k = String(key || '');
  const hdr = k.startsWith('sb_') ? `jsonb_build_object('Content-Type', 'application/json', 'apikey', '${q(k)}')`
    : `jsonb_build_object('Content-Type', 'application/json', 'apikey', '${q(k)}', 'Authorization', 'Bearer ${q(k)}')`;
  return `-- «Мы»: проверка напоминаний раз в минуту.
-- Перед этим включите расширения: Database → Extensions → pg_cron и pg_net.
select cron.unschedule(jobid) from cron.job where jobname = 'we-push-tick';
select cron.schedule('we-push-tick', '* * * * *', $job$
  select net.http_post(
    url := '${q(base)}/functions/v1/we-push',
    headers := ${hdr},
    body := '{"action":"tick"}'::jsonb
  );
$job$);
`;
}
