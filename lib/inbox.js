// Внутренний центр уведомлений «Что нового»: события от партнёра и напоминания. Чистая логика + localStorage.
// У каждого человека своя лента и свои отметки «прочитано» (ключ — viewer). Деньги — целые копейки.
import { isSecret, plural, daysBetween, upcomingCharges, debtAgeDays } from './tools.js';
import { spentByCategory, budgetRows, goalSaved } from './plan.js';
import { debt, splitAmount } from '../ledger.js';
import { weekKey, notesOf } from './together.js';

export const KEY = 'we-money-inbox';
export const MAX_ITEMS = 200, MAX_SHOWN = 600, LOCAL_GAP = 60000;

const partnerOf = (v) => (v === 'max' ? 'dinara' : 'max');
const pad = (n) => String(n).padStart(2, '0');
export const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ---------- хранилище ----------
export const emptyInbox = () => ({ items: [], shown: [], seeded: false });
const norm = (b) => ({
  items: Array.isArray(b?.items) ? b.items.filter((x) => x && x.key) : [],
  shown: Array.isArray(b?.shown) ? b.shown : [],
  seeded: !!b?.seeded,
});
const readAll = () => { try { const d = JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}'); return d && typeof d === 'object' ? d : {}; } catch { return {}; } };
export const load = (viewer) => (viewer ? norm(readAll()[viewer]) : emptyInbox());
export function save(viewer, box) {
  if (!viewer) return;
  const all = readAll(); all[viewer] = box;
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(all)); } catch {}
}

// ---------- чистые операции над лентой ----------
/** Добавляет события без повторов (по ключу, в том числе уже скрытым и вытесненным). Меняет box. Возвращает добавленные. */
export function addEvents(box, events, now = Date.now()) {
  const seen = new Set(box.shown), added = [];
  for (const ev of events) {
    if (!ev?.key || seen.has(ev.key)) continue;
    seen.add(ev.key);
    const item = { ...ev, added: now, r: false };
    box.items.push(item); box.shown.push(ev.key); added.push(item);
  }
  box.items.sort((a, b) => b.at - a.at);
  if (box.items.length > MAX_ITEMS) box.items.length = MAX_ITEMS;
  if (box.shown.length > MAX_SHOWN) box.shown.splice(0, box.shown.length - MAX_SHOWN);
  return added;
}
export const unreadCount = (box) => box.items.filter((i) => !i.r).length;
export function markRead(box, key) { const i = box.items.find((x) => x.key === key); if (i) i.r = true; }
export function markAllRead(box) { for (const i of box.items) i.r = true; }
export function hide(box, key) { box.items = box.items.filter((x) => x.key !== key); }
/** Фильтр ленты: 'all' | 'partner' | 'reminder'. */
export const filterItems = (box, f) => box.items.filter((i) => f === 'all' || i.kind === f);

// ---------- события от партнёра ----------
/**
 * applied: [{id, data, deleted, u}] — записи, применённые с сервера. ctx: { state, viewer, today, now }.
 * Свои действия и удаления событий не создают. Детали чужих скрытых операций не сохраняются.
 */
export function remoteEvents(applied, { state, viewer, today, now = Date.now() }) {
  const out = [], p = partnerOf(viewer);
  for (const rec of applied || []) {
    if (!rec || rec.deleted || !rec.data) continue;
    const { id, data } = rec, at = Math.min(rec.u || now, now), base = { kind: 'partner', who: p, at };
    if (id.startsWith('tx:')) {
      const t = data, author = t.type === 'transfer' ? t.from : t.person;
      if (!t.type || author === viewer) continue;
      const secret = isSecret(t, viewer, today), key = `tx:${t.id}`;
      if (t.type === 'transfer') {
        if (t.goalId) out.push({ ...base, key, type: 'goalfund', route: 'goals', d: { amount: t.amount, name: (state.goals || []).find((g) => g.id === t.goalId)?.name || '' } });
        else if (t.to === 'joint') out.push({ ...base, key, type: 'pot', route: 'home', d: { amount: t.amount } });
        else if (t.from !== 'joint' && t.from !== t.to) out.push({ ...base, key, type: 'settle', route: 'home', d: { amount: t.amount } });
      } else if (t.type === 'expense' && t.scope === 'shared' && t.paidFrom === p) {
        out.push({ ...base, key, type: 'shared', route: 'tx', arg: t.id, d: secret ? { secret: true } : { amount: t.amount, cat: t.category, share: splitAmount(t.amount, t.shareMax)[viewer] } });
      } else if (t.type === 'expense' || t.type === 'income') {
        out.push({ ...base, key, type: 'tx', route: 'tx', arg: t.id, d: secret ? { secret: true, tt: t.type } : { amount: t.amount, cat: t.category, tt: t.type } });
      }
    } else if (id.startsWith('col:comments:')) {
      if (!data.person || data.person === viewer || (!data.emoji && !data.text)) continue;
      const tx = (state.txs || []).find((x) => x.id === data.txId), hid = tx && isSecret(tx, viewer, today);
      out.push({ ...base, key: `cm:${data.id}:${data.at || rec.u}`, type: 'comment', route: tx ? 'tx' : 'feed', arg: tx ? tx.id : undefined, d: { emoji: data.emoji || '', text: String(data.text || '').slice(0, 80), cat: tx && !hid ? tx.category : '' } });
    } else if (id.startsWith('col:dateNotes:')) {
      if (!data.person || data.person === viewer) continue;
      out.push({ ...base, key: `dn:${data.week || data.id}:${data.person}:${Math.floor((rec.u || now) / 3600000)}`, type: 'datenote', route: 'date', d: {} });
    } else if (id.startsWith('goal:')) {
      out.push({ ...base, key: `goal:${data.id}:${rec.u}`, type: 'goal', route: 'goals', d: { name: data.name || '', target: data.target || 0 } });
    } else if (id.startsWith('bud:')) {
      out.push({ ...base, key: `bud:${data.c}:${rec.u}`, type: 'budget', route: 'budgets', d: { cat: data.c, limit: data.v } });
    }
  }
  return out;
}

// ---------- локальные напоминания ----------
/** ctx: { state, viewer, today: 'YYYY-MM-DD', now: Date }. Возвращает кандидатов; повторы отсекает addEvents. */
export function localEvents({ state: s, viewer, today, now }) {
  const out = [], at = now.getTime(), base = { kind: 'reminder', at };
  const ym = today.slice(0, 7);
  for (const r of budgetRows(s.budgets, spentByCategory(s.txs || [], ym, viewer))) {
    if (r.pct >= 1) out.push({ ...base, key: `b100:${r.cat}:${ym}`, type: 'budget100', route: 'budgets', d: { cat: r.cat, spent: r.spent, limit: r.limit } });
    else if (r.pct >= 0.9) out.push({ ...base, key: `b90:${r.cat}:${ym}`, type: 'budget90', route: 'budgets', d: { cat: r.cat, spent: r.spent, limit: r.limit, pct: Math.floor(r.pct * 100) } });
  }
  const dv = debt(s.txs || []), days = debtAgeDays(s.txs || [], today);
  if (Math.abs(dv) > 100000 && days != null && days > 14) {
    const debtor = dv > 0 ? 'dinara' : 'max';
    out.push({ ...base, key: `debt:${Math.floor(daysBetween('2000-01-01', today) / 14)}`, type: 'debt', route: 'home', d: { amount: Math.abs(dv), days, debtor, creditor: partnerOf(debtor) } });
  }
  for (const c of upcomingCharges(s.recurring, today, 1)) {
    if (c.in > 1 || c.tpl.type === 'transfer') continue;
    out.push({ ...base, key: `rec:${c.recId}:${c.date}:${c.in}`, type: 'recurring', route: 'calendar', d: { in: c.in, label: c.tpl.note || c.tpl.category || 'Платёж', amount: c.tpl.amount, income: c.tpl.type === 'income' } });
  }
  for (const g of s.goals || []) if (g.target > 0 && goalSaved(s.txs || [], g.id) >= g.target) out.push({ ...base, key: `gd:${g.id}`, type: 'goaldone', route: 'goals', d: { name: g.name } });
  const wk = weekKey(today);
  if (now.getDay() === 0 && now.getHours() >= 16 && !notesOf(s.dateNotes, wk, viewer).length) out.push({ ...base, key: `date:${wk}`, type: 'datenight', route: 'date', d: {} });
  return out;
}

// ---------- текст события ----------
/** Родительный падеж имени для «от Динары» (простое правило, имена настраиваются в профилях). */
export function genitive(n) {
  const s = String(n || ''), l = s.slice(-1).toLowerCase();
  if (l === 'а') return s.slice(0, -1) + (/[гкхжчшщ]/i.test(s.slice(-2, -1)) ? 'и' : 'ы');
  if (l === 'я') return s.slice(0, -1) + 'и';
  if (l === 'й' || l === 'ь') return s.slice(0, -1) + 'я';
  return /[бвгдзклмнпрстфхцчшщжй]$/i.test(s) ? s + 'а' : s;
}

/** ctx: { name(p), fem(p) → 'а' | '', money(kop) }. → { icon, tone, title, detail, text, route, arg } */
export function describe(ev, ctx) {
  const { name, fem, money } = ctx, d = ev.d || {}, N = ev.who ? name(ev.who) : '', g = ev.who ? fem(ev.who) : '';
  const hidden = 'Детали скрыты', mc = (...a) => a.filter(Boolean).join(' · ');
  let icon = 'bell', title = '', detail = '';
  switch (ev.type) {
    case 'tx': icon = d.tt === 'income' ? 'coins' : 'card'; title = `${N} ${d.tt === 'income' ? 'записал' + g + ' доход' : 'добавил' + g + ' операцию'}`; detail = d.secret ? hidden : mc(money(d.amount), d.cat); break;
    case 'shared': icon = 'users'; title = `${N} оплатил${g} общую трату`; detail = d.secret ? hidden : mc(money(d.amount), d.cat, `ваша доля ${money(d.share)}`); break;
    case 'pot': icon = 'bank'; title = `${N} пополнил${g} общий баланс`; detail = money(d.amount); break;
    case 'goalfund': icon = 'bank'; title = `${N} пополнил${g} цель${d.name ? ` «${d.name}»` : ''}`; detail = money(d.amount); break;
    case 'settle': icon = 'swap'; title = `${N} записал${g} взаиморасчёт`; detail = money(d.amount); break;
    case 'comment': icon = 'chat'; title = d.text ? `${N} прокомментировал${g} операцию` : `${N} отреагировал${g} ${d.emoji}`; detail = mc(d.text ? `«${d.text}»` : '', d.cat); break;
    case 'goal': icon = 'bank'; title = `${N} обновил${g} цель «${d.name}»`; detail = d.target ? `Нужно накопить ${money(d.target)}` : ''; break;
    case 'budget': icon = 'chart'; title = `${N} изменил${g} бюджет «${d.cat}»`; detail = `Лимит ${money(d.limit)}`; break;
    case 'datenote': icon = 'heart'; title = `${N} записал${g} ответ на финансовом свидании`; detail = 'Ответ откроется, когда вы сохраните свои'; break;
    case 'budget90': icon = 'chart'; title = `Бюджет «${d.cat}»: потрачено ${d.pct}%`; detail = `${money(d.spent)} из ${money(d.limit)}`; break;
    case 'budget100': icon = 'chart'; title = d.spent > d.limit ? `Бюджет «${d.cat}» превышен` : `Бюджет «${d.cat}» исчерпан`; detail = d.spent > d.limit ? `${money(d.spent)} при лимите ${money(d.limit)}` : `Потрачено ${money(d.spent)}`; break;
    case 'debt': icon = 'arrow'; title = `Долг висит уже ${d.days} ${plural(d.days, 'день', 'дня', 'дней')}`; detail = `${name(d.debtor)} → ${name(d.creditor)} · ${money(d.amount)}`; break;
    case 'recurring': icon = 'clock'; title = `${d.in === 0 ? 'Сегодня' : 'Завтра'} ${d.income ? 'поступление' : 'платёж'}: ${d.label}`; detail = money(d.amount); break;
    case 'goaldone': icon = 'check'; title = `Цель «${d.name}» достигнута`; detail = 'Поздравляем!'; break;
    case 'datenight': icon = 'heart'; title = 'Сегодня вечером финансовое свидание'; detail = 'Итоги недели ждут вас обоих'; break;
  }
  return { icon, tone: ev.kind === 'partner' ? `var(--${ev.who})` : 'var(--joint)', title, detail, text: mc(title, detail), route: ev.route, arg: ev.arg };
}

// ---------- привязка к приложению ----------
const subs = new Set();
export const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
let source = null, lastLocal = 0;
/** fn() → { state, viewer, today } — откуда брать текущее состояние (задаёт lib/inbox-ui.js). */
export const bindSource = (fn) => { source = fn; };

/** Хук синхронизации: вызывается после применения записей с сервера. */
export function onRemoteApplied(applied) {
  const src = source?.(); if (!src?.viewer) return [];
  const box = load(src.viewer), added = addEvents(box, remoteEvents(applied, { ...src, now: Date.now() }));
  if (added.length) { save(src.viewer, box); subs.forEach((f) => f({ added })); }
  return added;
}

/** Локальные напоминания; не чаще раза в минуту (force — сразу). */
export function refreshLocal(force = false, nowDate = new Date()) {
  const src = source?.(); if (!src?.viewer || !src.state?.settings?.onboarded) return [];
  if (!force && nowDate.getTime() - lastLocal < LOCAL_GAP) return [];
  lastLocal = nowDate.getTime();
  const box = load(src.viewer), cands = localEvents({ ...src, now: nowDate });
  let changed = false;
  if (!box.seeded) { // первый запуск: уже достигнутые цели не считаем новостью
    box.seeded = true; changed = true;
    for (const c of cands.filter((x) => x.type === 'goaldone')) box.shown.push(c.key);
  }
  const added = addEvents(box, cands, nowDate.getTime());
  if (added.length || changed) save(src.viewer, box);
  if (added.length) subs.forEach((f) => f({ added }));
  return added;
}

/** Действие экрана: применяет fn к ленте человека, сохраняет и оповещает подписчиков. */
export function update(viewer, fn) { const box = load(viewer); fn(box); save(viewer, box); subs.forEach((f) => f({ added: [] })); return box; }
