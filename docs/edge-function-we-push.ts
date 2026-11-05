// Edge Function «we-push» для приложения «Мы».
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
const safeUrl = (u: unknown) => { const s = clip(u, 200); return /^\.\/[\w?=&%.\-]*$/.test(s) ? s : './'; };

/** Отправляет одно уведомление; при 404/410 удаляет подписку. Возвращает true, если доставлено. */
const lastErrors: { status?: number; msg: string }[] = [];
const PUSH_HOST = /^https:\/\/([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)\//;
async function sendOne(sub: any, payload: unknown): Promise<boolean> {
  try {
    if (!PUSH_HOST.test(String(sub?.sub?.endpoint || ''))) throw Object.assign(new Error('bad endpoint'), { statusCode: 400 });
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
