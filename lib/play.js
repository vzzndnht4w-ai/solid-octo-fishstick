// «Игровая» логика: итоги месяца в историях, челленджи, стрики, достижения. Чистые функции, без DOM. Деньги — копейки.
import { PEOPLE, balances, method } from '../ledger.js';
import { categoryTotals, shiftYm, daysInMonth } from './analytics.js';
import { goalSaved, spentByCategory, budgetRows } from './plan.js';

// ---------- даты ----------
export const dayNum = (s) => Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);
const pad = (n) => String(n).padStart(2, '0');
export const dayStr = (n) => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const addDays = (s, k) => dayStr(dayNum(s) + k);
/** День недели: 0 = понедельник … 6 = воскресенье. */
export const weekday = (s) => (new Date(dayNum(s) * 86400000).getUTCDay() + 6) % 7;
const PEOPLE_KEYS = ['max', 'dinara'];

/** Операции, которые viewer вправе видеть: чужие скрытые отбрасываются. */
export const visibleTxs = (txs, viewer) => txs.filter((t) => !(t.hidden && t.person !== viewer));

/** Серии подряд идущих дней из множества дат: { current (заканчивая today или вчера), best }. */
export function dayStreak(days, today) {
  const set = days instanceof Set ? days : new Set(days);
  if (!set.size) return { current: 0, best: 0 };
  const nums = [...set].map(dayNum).sort((a, b) => a - b);
  let best = 1, run = 1;
  for (let i = 1; i < nums.length; i++) { run = nums[i] === nums[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); }
  const t = dayNum(today), has = (n) => set.has(dayStr(n));
  let n = has(t) ? t : t - 1, current = 0;
  while (has(n)) { current++; n--; }
  return { current, best };
}

// ---------- итоги месяца ----------
const WD_NAME = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const WD_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, k = m % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k > 1 && k < 5 ? b : c; };
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

/**
 * Карточки «историй» за месяц ym с точки зрения viewer. Пустой месяц → [].
 * extra: { goals, money (форматтер копеек), female: {max, dinara} }.
 * Карточка: { id, theme, icon, kicker, big?:{value, fmt:'money'|'pct'}, text?, sub?, rows?, bars?, category? }.
 */
export function buildStory(txs, ym, viewer, extra = {}) {
  const money = extra.money || ((k) => `${Math.round(k / 100)} ₽`);
  const goals = extra.goals || [], female = extra.female || {};
  const vis = visibleTxs(txs, viewer);
  const cur = vis.filter((t) => t.date.startsWith(ym));
  if (!cur.length) return [];
  const cards = [];
  const exps = cur.filter((t) => t.type === 'expense');
  const income = sum(cur.filter((t) => t.type === 'income'), (t) => t.amount);
  const expense = sum(exps, (t) => t.amount);
  const toPot = sum(cur.filter((t) => t.type === 'transfer' && t.to === 'joint' && t.from !== 'joint'), (t) => t.amount);
  const net = income - expense;

  cards.push({ id: 'numbers', theme: 'blue', icon: 'chart', kicker: 'Ваш месяц в цифрах', rows: [
    { label: 'Доходы', value: income, fmt: 'money' },
    { label: 'Расходы', value: expense, fmt: 'money' },
    { label: 'Отложили в общий баланс', value: toPot, fmt: 'money' },
  ] });

  const big = [...exps].sort((a, b) => b.amount - a.amount)[0];
  if (big) {
    const d = big.date;
    cards.push({ id: 'biggest', theme: 'rose', icon: 'star', kicker: 'Самая большая трата', big: { value: big.amount, fmt: 'money' }, category: big.category, text: big.category,
      sub: `${PEOPLE[big.person]} · ${+d.slice(8)} ${MONTHS_GEN[+d.slice(5, 7) - 1]}` });
  }

  const cats = categoryTotals(vis, { ym, viewer });
  if (cats.length) {
    const [cat, v] = cats[0], total = sum(cats, (c) => c[1]), n = exps.filter((t) => t.category === cat).length;
    cards.push({ id: 'favorite', theme: 'amber', icon: 'star', kicker: 'Любимая категория', category: cat, text: cat,
      big: { value: Math.round((v / total) * 100), fmt: 'pct' }, sub: `всех расходов · ${money(v)}, ${n} ${plural(n, 'трата', 'траты', 'трат')}` });
  }

  const paid = { max: 0, dinara: 0 }, paidN = { max: 0, dinara: 0 };
  for (const t of exps) if (t.scope === 'shared' && PEOPLE_KEYS.includes(t.paidFrom)) { paid[t.paidFrom] += t.amount; paidN[t.paidFrom]++; }
  if (paidN.max + paidN.dinara) {
    const diff = paid.max - paid.dinara, tot = paid.max + paid.dinara, who = diff > 0 ? 'max' : 'dinara';
    const equal = Math.abs(diff) < tot * 0.12;
    const verb = female[who] ? 'платила' : 'платил';
    cards.push({ id: 'payer', theme: 'teal', icon: 'users', kicker: 'Кто чаще платил за общее',
      text: equal ? 'Почти поровну — за общее платили оба' : `Чаще за общее ${verb} ${PEOPLE[who]}`,
      sub: equal ? 'Приятно, когда забота делится пополам' : `Спасибо! В следующий раз — очередь ${PEOPLE[who === 'max' ? 'dinara' : 'max']}`,
      rows: PEOPLE_KEYS.map((p) => ({ label: PEOPLE[p], value: paid[p], fmt: 'money', person: p, note: `${paidN[p]} ${plural(paidN[p], 'раз', 'раза', 'раз')}` })) });
  }

  const byWd = Array(7).fill(0), days = new Set();
  for (const t of exps) { byWd[weekday(t.date)] += t.amount; days.add(t.date); }
  if (days.size >= 2) {
    const topI = byWd.indexOf(Math.max(...byWd));
    const occ = Array.from({ length: daysInMonth(ym) }, (_, i) => weekday(`${ym}-${pad(i + 1)}`)).filter((w) => w === topI).length;
    cards.push({ id: 'weekday', theme: 'violet', icon: 'calendar', kicker: 'Самый дорогой день недели', text: WD_NAME[topI][0].toUpperCase() + WD_NAME[topI].slice(1),
      sub: `в среднем ${money(Math.round(byWd[topI] / occ / 100) * 100)} за такой день`,
      bars: byWd.map((v, i) => ({ label: WD_SHORT[i], value: v, top: i === topI })) });
  }

  const potEnd = balances(vis.filter((t) => t.date.slice(0, 7) <= ym)).joint, potStart = balances(vis.filter((t) => t.date.slice(0, 7) < ym)).joint;
  if (potEnd !== potStart) {
    const d = potEnd - potStart;
    cards.push({ id: 'pot', theme: 'gold', icon: 'bank', kicker: d > 0 ? 'Ваш общий баланс вырос на' : 'Из общего баланса ушло', big: { value: Math.abs(d), fmt: 'money' },
      text: d > 0 ? 'Копится понемногу' : 'Он для того и нужен', sub: `Теперь в балансе ${money(potEnd)}` });
  }

  const endMs = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 1).getTime();
  const upto = vis.filter((t) => t.date.slice(0, 7) <= ym), before = vis.filter((t) => t.date.slice(0, 7) < ym);
  const grows = goals.filter((g) => !g.createdAt || g.createdAt < endMs).map((g) => {
    const saved = goalSaved(upto, g.id), gain = saved - goalSaved(before, g.id), pct = g.target > 0 ? Math.min(1, saved / g.target) : 0;
    return { label: g.name, emoji: g.emoji, value: saved, target: g.target, pct, gain, done: g.target > 0 && saved >= g.target, fmt: 'money' };
  }).sort((a, b) => b.gain - a.gain || b.pct - a.pct).slice(0, 3);
  if (grows.length) {
    const gainSum = sum(grows, (g) => g.gain);
    cards.push({ id: 'goals', theme: 'green', icon: 'target', kicker: 'Ваши цели', text: gainSum > 0 ? `За месяц на цели отложено ${money(gainSum)}` : 'В этом месяце цели отдыхали', sub: grows.some((g) => g.done) ? 'Есть достигнутые — поздравляем!' : 'Каждый взнос приближает мечту', rows: grows });
  }

  // один вывод
  const prevExp = sum(vis.filter((t) => t.type === 'expense' && t.date.startsWith(shiftYm(ym, -1))), (t) => t.amount);
  const rate = income > 0 ? Math.round((net / income) * 100) : null;
  let text, sub = '';
  if (rate !== null && rate >= 20) text = `Вы сохранили ${rate}% дохода — отличный месяц`;
  else if (net > 0) text = `Месяц в плюсе на ${money(net)}. Так держать`;
  else if (net === 0 && income > 0) text = 'Вышли ровно в ноль — тоже мастерство';
  else if (income === 0) text = `Расходы за месяц — ${money(expense)}. Доходов пока нет`;
  else text = `Расходы обогнали доходы на ${money(-net)} — в следующем месяце вернёте баланс`;
  if (prevExp > 0 && expense > 0) {
    const ch = Math.round(((expense - prevExp) / prevExp) * 100);
    if (ch <= -5) sub = `И тратили на ${-ch}% меньше, чем в прошлом месяце`;
    else if (ch >= 5) sub = `Расходы на ${ch}% выше, чем в прошлом месяце${cats.length ? ` — присмотритесь к «${cats[0][0]}»` : ''}`;
  }
  if (!sub && toPot > 0) sub = `В общий баланс отправили ${money(toPot)}`;
  cards.push({ id: 'verdict', theme: 'brand', icon: 'heart', kicker: 'Один вывод', text, sub, share: { income, expense, saved: toPot } });
  return cards;
}

// ---------- челленджи ----------
export const CHALLENGE_TYPES = {
  avoid: { icon: 'shield', unit: ['день', 'дня', 'дней'] },
  nocash: { icon: 'cash', unit: ['день', 'дня', 'дней'] },
  weekend: { icon: 'calendar', unit: ['выходной', 'выходных', 'выходных'] },
  daily: { icon: 'coins', unit: ['день', 'дня', 'дней'] },
  piggy52: { icon: 'bank', unit: ['неделя', 'недели', 'недель'] },
};
/** Сумма копилки на 52 недели: шаг × (1+2+…+52). */
export const piggyTotal = (step) => (step * 52 * 53) / 2;
export const piggyWeekAmount = (step, week) => step * week;
/** Номер текущей недели копилки 1..52. */
export const piggyWeekNow = (ch, today) => Math.max(1, Math.min(52, Math.floor((dayNum(today) - dayNum(ch.startedAt)) / 7) + 1));

/** Серии «чистых» дней: current — подряд до конца диапазона, best — лучший отрезок. Диапазон [start, end]. */
function cleanRuns(badDays, start, end) {
  let cur = 0, best = 0;
  for (let n = dayNum(start); n <= dayNum(end); n++) { if (badDays.has(dayStr(n))) cur = 0; else { cur++; best = Math.max(best, cur); } }
  return { current: cur, best };
}

/**
 * Состояние челленджа на today. txs — уже отфильтрованные для viewer (visibleTxs).
 * Возвращает { pct (0..1|null), streak, best, unit, done, failed, failedAt, failedBy, ended, active, label, contrib:{max,dinara}, contribKind:'money'|'slips', daysLeft }.
 */
export function challengeProgress(ch, txs, today) {
  const start = ch.startedAt, p = ch.params || {}, log = Array.isArray(ch.log) ? ch.log : [];
  const out = { pct: null, streak: 0, best: 0, unit: CHALLENGE_TYPES[ch.type]?.unit || ['', '', ''], done: false, failed: false, failedAt: null, failedBy: null, ended: false, active: true, label: '', contrib: { max: 0, dinara: 0 }, contribKind: 'slips', daysLeft: null };
  const fin = (o) => { o.ended = !!ch.endsAt && today > ch.endsAt; o.active = !o.done && !o.failed && !o.ended; if (ch.endsAt && !o.ended) o.daysLeft = dayNum(ch.endsAt) - dayNum(today) + 1; return o; };
  if (today < start) return fin({ ...out, label: 'Ещё не началось' });
  const exps = txs.filter((t) => t.type === 'expense' && t.date >= start && t.date <= today && (!ch.endsAt || t.date <= ch.endsAt));

  if (ch.type === 'avoid') {
    const end = ch.endsAt || today, last = today < end ? today : end, total = dayNum(end) - dayNum(start) + 1;
    const bad = exps.filter((t) => t.category === p.category).sort((a, b) => a.date.localeCompare(b.date));
    for (const t of bad) out.contrib[t.person] = (out.contrib[t.person] || 0) + 1;
    const days = dayNum(last) - dayNum(start) + 1;
    if (bad.length) {
      const held = dayNum(bad[0].date) - dayNum(start);
      out.failed = true; out.failedAt = bad[0].date; out.failedBy = bad[0].person;
      out.streak = Math.max(0, dayNum(today) - dayNum(bad[bad.length - 1].date));
      out.pct = Math.min(1, held / total);
      out.label = `Выдержали ${held} из ${total}`;
    } else {
      out.streak = days; out.pct = Math.min(1, days / total); out.done = today > end;
      out.label = out.done ? `Все ${total} ${plural(total, ...out.unit)} без срывов` : `День ${days} из ${total}`;
    }
    out.best = out.streak;
    return fin(out);
  }

  if (ch.type === 'nocash') {
    const bad = new Set();
    for (const t of exps) if (method(t) === 'cash') { bad.add(t.date); out.contrib[t.person] = (out.contrib[t.person] || 0) + 1; }
    const r = cleanRuns(bad, start, today);
    out.streak = r.current; out.best = r.best;
    if (ch.target) { out.pct = Math.min(1, r.best / ch.target); out.done = r.best >= ch.target; }
    out.label = ch.target ? `Лучшая серия ${r.best} из ${ch.target}` : `Серия ${r.current} ${plural(r.current, ...out.unit)}`;
    return fin(out);
  }

  if (ch.type === 'weekend') {
    // выходные = суббота+воскресенье; считаем завершённые (воскресенье уже прошло)
    const byDay = new Map();
    for (const t of exps) { if (!byDay.has(t.date)) byDay.set(t.date, []); byDay.get(t.date).push(t); }
    const res = [];
    for (let n = dayNum(start); n < dayNum(today); n++) {
      const d = dayStr(n);
      if (weekday(d) !== 6) continue;
      const list = [...(byDay.get(addDays(d, -1)) || []), ...(byDay.get(d) || [])];
      res.push(list.length === 0);
      for (const t of list) out.contrib[t.person] = (out.contrib[t.person] || 0) + 1;
    }
    let best = 0, run = 0;
    for (const ok of res) { run = ok ? run + 1 : 0; best = Math.max(best, run); }
    out.streak = run; out.best = best;
    if (ch.target) { out.pct = Math.min(1, best / ch.target); out.done = best >= ch.target; }
    out.label = res.length ? `Выходных без трат: ${res.filter(Boolean).length} из ${res.length}` : 'Первые выходные впереди';
    return fin(out);
  }

  if (ch.type === 'daily') {
    out.contribKind = 'money';
    const days = new Set(log.map((e) => e.date));
    for (const e of log) out.contrib[e.person] = (out.contrib[e.person] || 0) + (e.amount || p.amount || 0);
    const st = dayStreak(days, today);
    out.streak = st.current; out.best = st.best;
    if (ch.target) { out.pct = Math.min(1, days.size / ch.target); out.done = days.size >= ch.target; }
    out.label = ch.target ? `${days.size} из ${ch.target} ${plural(ch.target, ...out.unit)}` : `Отложено ${days.size} ${plural(days.size, ...out.unit)}`;
    out.doneToday = { max: false, dinara: false };
    for (const e of log) if (e.date === today) out.doneToday[e.person] = true;
    return fin(out);
  }

  if (ch.type === 'piggy52') {
    out.contribKind = 'money';
    const weeks = new Set(log.map((e) => e.week));
    let got = 0;
    for (const e of log) { got += e.amount || 0; out.contrib[e.person] = (out.contrib[e.person] || 0) + (e.amount || 0); }
    const total = ch.target || piggyTotal(p.step || 0), now = piggyWeekNow(ch, today);
    out.pct = total > 0 ? Math.min(1, got / total) : 0;
    out.done = weeks.size >= 52;
    let w = weeks.has(now) ? now : now - 1, run = 0;
    while (w >= 1 && weeks.has(w)) { run++; w--; }
    out.streak = run; out.best = run; out.weeksDone = weeks; out.weekNow = now; out.saved = got; out.total = total;
    out.label = `${weeks.size} из 52 недель`;
    return fin(out);
  }
  return fin(out);
}

// ---------- достижения ----------
export const ACHIEVEMENTS = [
  { id: 'pot1k', icon: 'bank', title: 'Первая тысяча в балансе', desc: 'В общем балансе набралась 1 000 ₽' },
  { id: 'pot10k', icon: 'coins', title: 'Десять тысяч в балансе', desc: 'В общем балансе набралось 10 000 ₽' },
  { id: 'streak7', icon: 'flame', title: '7 дней подряд', desc: 'Записывали операции 7 дней без пропусков' },
  { id: 'goal', icon: 'target', title: 'Цель достигнута', desc: 'Накопили всю сумму хотя бы одной цели' },
  { id: 'budget', icon: 'gauge', title: 'Месяц без перерасхода', desc: 'Один из прошлых месяцев уложился во все лимиты бюджета' },
  { id: 'together', icon: 'users', title: 'Вдвоём в баланс', desc: 'За один месяц пополнили общий баланс оба' },
  { id: 'challenge', icon: 'shield', title: 'Вызов принят', desc: 'Запустили первый челлендж' },
  { id: 'challenge-done', icon: 'trophy', title: 'Челлендж пройден', desc: 'Довели до конца любой челлендж' },
];

/** Максимум, которого достигал общий баланс за всё время (копейки). */
export function peakPot(txs) {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  let v = 0, peak = 0;
  for (const t of sorted) {
    if (t.type === 'income' && t.wallet === 'joint') v += t.amount;
    else if (t.type === 'expense' && t.paidFrom === 'joint') v -= t.amount;
    else if (t.type === 'transfer') { if (t.to === 'joint') v += t.amount; if (t.from === 'joint') v -= t.amount; }
    peak = Math.max(peak, v);
  }
  return peak;
}

/** Список достижений: [{…описание, earned, progress 0..1}] для состояния s (store.get()) на today. */
export function achievements(s, today) {
  const viewer = s.viewer, txs = visibleTxs(s.txs || [], viewer), curYm = today.slice(0, 7);
  const peak = peakPot(txs), streak = dayStreak(new Set(txs.map((t) => t.date)), today);
  const chs = (s.challenges || []).map((c) => challengeProgress(c, txs, today));
  const goalDone = (s.goals || []).some((g) => g.target > 0 && goalSaved(txs, g.id) >= g.target);
  const goalBest = Math.max(0, ...(s.goals || []).map((g) => (g.target > 0 ? Math.min(1, goalSaved(txs, g.id) / g.target) : 0)));
  const months = [...new Set(txs.map((t) => t.date.slice(0, 7)))].filter((m) => m < curYm);
  const budgetOk = Object.values(s.budgets || {}).some((v) => v > 0) && months.some((ym) => {
    const rows = budgetRows(s.budgets, spentByCategory(txs, ym, viewer));
    return rows.length > 0 && rows.some((r) => r.spent > 0) && rows.every((r) => r.level !== 'over');
  });
  const togetherOk = (() => {
    const by = {};
    for (const t of txs) if (t.type === 'transfer' && t.to === 'joint' && PEOPLE_KEYS.includes(t.from)) (by[t.date.slice(0, 7)] ||= new Set()).add(t.from);
    return Object.values(by).some((set) => set.size === 2);
  })();
  const st = {
    pot1k: [peak >= 100000, peak / 100000], pot10k: [peak >= 1000000, peak / 1000000], streak7: [streak.best >= 7, streak.best / 7],
    goal: [goalDone, goalBest], budget: [budgetOk, 0], together: [togetherOk, 0],
    challenge: [(s.challenges || []).length > 0, 0], 'challenge-done': [chs.some((c) => c.done), 0],
  };
  return ACHIEVEMENTS.map((a) => ({ ...a, earned: st[a.id][0], progress: st[a.id][0] ? 1 : Math.max(0, Math.min(1, st[a.id][1])) }));
}

/** Завершённые челленджи (для уведомлений): [{id, title}]. */
export function doneChallenges(s, today) {
  const txs = visibleTxs(s.txs || [], s.viewer);
  return (s.challenges || []).filter((c) => challengeProgress(c, txs, today).done).map((c) => ({ id: c.id, title: c.title }));
}
