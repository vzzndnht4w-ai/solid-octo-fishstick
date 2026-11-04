// Челленджи вдвоём и достижения. Данные — store.challenges (синхронизируются сами); логика — lib/play.js.
import { parseMoney, validate, EXPENSE_CATEGORIES } from '../ledger.js';
import { ic, esc, av, nameOf, money as fm, subHeader, $, $$ } from '../core.js';
import { seg } from '../lib/ui.js';
import { openSheet, chips, bindChips, amountField, kopToInput, pbar } from '../planui.js';
import { challengeProgress, visibleTxs, achievements, CHALLENGE_TYPES, piggyTotal, piggyWeekAmount, addDays, plural } from '../lib/play.js';
import '../lib/play-icons.js';

let tab = 'list', confirmId = null;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
const PEOPLE_KEYS = ['max', 'dinara'];
const catList = (s) => [...EXPENSE_CATEGORIES, ...(s.categories?.expense || []).map((c) => (typeof c === 'string' ? c : c?.name)).filter((c) => c && !EXPENSE_CATEGORIES.includes(c))];

const TEMPLATES = [
  { k: 'cafe', type: 'avoid', icon: 'food', title: 'Неделя без кафе', sub: 'Ни одной траты на «Еда вне дома»' },
  { k: 'impulse', type: 'avoid', icon: 'cart', title: 'Без импульсивных покупок', sub: 'Выберите категорию, где чаще срываетесь' },
  { k: 'piggy52', type: 'piggy52', icon: 'bank', title: 'Копилка 52 недели', sub: 'В неделю N откладываем N × шаг' },
  { k: 'daily', type: 'daily', icon: 'coins', title: 'Откладывать каждый день', sub: 'Небольшая сумма в котёл — и стрик' },
  { k: 'nocash', type: 'nocash', icon: 'cash', title: 'Не тратим наличные', sub: 'Дни подряд без трат наличными' },
  { k: 'weekend', type: 'weekend', icon: 'calendar', title: 'Выходные без трат', sub: 'Суббота и воскресенье без расходов' },
];

const unitWord = (p, n) => plural(n, ...p.unit);
const goalOf = (s, id) => s.goals.find((g) => g.id === id);

function contribHtml(ch, p) {
  const [m, d] = [p.contrib.max, p.contrib.dinara];
  if (p.contribKind === 'money') {
    const tot = m + d;
    return `<div class="pc-split" role="img" aria-label="Вклад: ${esc(nameOf('max'))} ${esc(fm(m))}, ${esc(nameOf('dinara'))} ${esc(fm(d))}">${tot ? `<i class="max" style="flex:${m}"></i><i class="dinara" style="flex:${d}"></i>` : '<i class="none" style="flex:1"></i>'}</div>
      <div class="pc-legend">${PEOPLE_KEYS.map((k) => `<span>${av(k, 'sm')}<b>${esc(fm(p.contrib[k]))}</b></span>`).join('')}</div>`;
  }
  const total = m + d;
  return `<div class="pc-legend">${PEOPLE_KEYS.map((k) => `<span>${av(k, 'sm')}<b>${p.contrib[k] || 0}</b><small>${(p.contrib[k] || 0) === 1 ? 'срыв' : (p.contrib[k] || 0) > 1 && (p.contrib[k] || 0) < 5 ? 'срыва' : 'срывов'}</small></span>`).join('')}${total === 0 ? '<span class="pc-ok">Оба держатся</span>' : ''}</div>`;
}

function describe(ch, s) {
  const pr = ch.params || {};
  if (ch.type === 'avoid') return `без «${pr.category}»`;
  if (ch.type === 'daily') return `по ${fm(pr.amount)} в день${goalOf(s, pr.goalId) ? ` · на «${goalOf(s, pr.goalId).name}»` : ''}`;
  if (ch.type === 'piggy52') return `шаг ${fm(pr.step)} · всего ${fm(ch.target || piggyTotal(pr.step))}${goalOf(s, pr.goalId) ? ` · на «${goalOf(s, pr.goalId).name}»` : ''}`;
  if (ch.type === 'nocash') return ch.target ? `цель — ${ch.target} ${plural(ch.target, 'день', 'дня', 'дней')} подряд` : 'без цели по сроку';
  if (ch.type === 'weekend') return ch.target ? `цель — ${ch.target} ${plural(ch.target, 'выходной', 'выходных', 'выходных')} подряд` : 'без цели по сроку';
  return '';
}

function weekGrid(ch, p, s, a) {
  const log = new Map((ch.log || []).map((e) => [e.week, e])), step = ch.params.step;
  let cells = '';
  for (let w = 1; w <= 52; w++) {
    const e = log.get(w), cls = e ? `on ${e.person}` : w === p.weekNow ? 'now' : '';
    cells += `<button type="button" class="pc-wk ${cls}" data-week="${w}" aria-pressed="${!!e}" aria-label="Неделя ${w}, ${esc(fm(piggyWeekAmount(step, w)))}${e ? `, отложил${s.profiles[e.person]?.female ? 'а' : ''} ${esc(nameOf(e.person))}` : ''}${w === p.weekNow ? ', текущая' : ''}"><span>${w}</span>${e ? ic('check') : ''}</button>`;
  }
  return `<div class="pc-weeks">${cells}</div>`;
}

function card(ch, s, a, txs) {
  const today = a.today(), p = challengeProgress(ch, txs, today), meta = CHALLENGE_TYPES[ch.type] || { icon: 'target' };
  const lvl = p.done ? 'done' : p.failed ? 'over' : 'ok';
  const badge = p.done ? `<span class="pc-badge good">${ic('check')} Пройден</span>` : p.failed ? `<span class="pc-badge bad">Не вышло</span>` : p.ended ? '<span class="pc-badge">Срок вышел</span>' : '';
  const streak = p.streak > 0 ? `<span class="pc-streak" title="Серия">${ic('flame')}<b>${p.streak}</b> ${unitWord(p, p.streak)}</span>` : '';
  let actions = '';
  const viewer = s.viewer;
  if (ch.type === 'daily' && p.active) {
    const mine = p.doneToday[viewer], other = PEOPLE_KEYS.find((k) => k !== viewer);
    actions = `${mine ? `<div class="pc-today">${ic('check')} Сегодня вы уже отложили</div>` : `<button class="primary pc-act" type="button" data-daily="${esc(ch.id)}">${ic('plus')} Отложить ${esc(fm(ch.params.amount))} сегодня</button>`}
      <p class="pc-note">${esc(nameOf(other))} сегодня: ${p.doneToday[other] ? 'отложил' + (s.profiles[other]?.female ? 'а' : '') + ' ✓' : 'пока нет'}</p>`;
  } else if (ch.type === 'piggy52' && p.active) {
    const w = Array.from({ length: 52 }, (_, i) => i + 1).find((x) => !p.weeksDone.has(x));
    actions = `${w ? `<button class="primary pc-act" type="button" data-week="${w}">${ic('plus')} Отложить за неделю ${w} — ${esc(fm(piggyWeekAmount(ch.params.step, w)))}</button>` : ''}${weekGrid(ch, p, s, a)}`;
  } else if (ch.type === 'piggy52') {
    actions = weekGrid(ch, p, s, a);
  } else if (p.failed) {
    actions = `<p class="pc-note">Срыв: ${esc(nameOf(p.failedBy))}, ${+p.failedAt.slice(8)}.${p.failedAt.slice(5, 7)}</p><button class="ghost pc-act" type="button" data-again="${esc(ch.id)}" style="text-align:center">Начать заново</button>`;
  } else if (p.active && p.daysLeft !== null) {
    actions = `<p class="pc-note">Осталось ${p.daysLeft} ${plural(p.daysLeft, 'день', 'дня', 'дней')}</p>`;
  }
  const del = confirmId === ch.id
    ? `<div class="btns2"><button class="ghost" data-keep type="button" style="text-align:center">Оставить</button><button class="ghost danger" data-del2="${esc(ch.id)}" type="button" style="text-align:center">Да, удалить</button></div>`
    : `<button class="linkbtn pc-del" type="button" data-del="${esc(ch.id)}">Удалить</button>`;
  return `<article class="card pc lvl-${lvl}" data-cid="${esc(ch.id)}" aria-label="${esc(ch.title)}">
    <div class="pc-head"><span class="tile pc-tile" style="--h:#7b6cf0">${ic(meta.icon)}</span><div class="pc-title"><b>${esc(ch.title)}</b><small>${esc(describe(ch, s))}</small></div>${badge || streak}</div>
    ${p.pct !== null ? pbar(p.pct) : ''}
    <div class="pc-label"><span>${esc(p.label)}</span>${badge ? streak : ''}${p.pct !== null ? `<b>${Math.round(p.pct * 100)}%</b>` : ''}</div>
    <div class="pc-sect">Вклад каждого</div>${contribHtml(ch, p)}
    ${actions}${del}</article>`;
}

function achView(s, a) {
  const list = achievements(s, a.today()), got = list.filter((x) => x.earned).length;
  return `<p class="pa-sum"><b>${got}</b> из ${list.length} получено</p>${pbar(got / list.length)}
    <ul class="pa-grid">${list.map((x) => `<li class="pa ${x.earned ? 'got' : 'lock'}"><span class="pa-ic">${ic(x.earned ? x.icon : 'lock')}</span><b>${esc(x.title)}</b><small>${esc(x.desc)}</small>
      ${x.earned ? '<span class="sr">Получено</span>' : `${x.progress > 0 ? pbar(x.progress) : ''}<span class="sr">Закрыто</span>`}</li>`).join('')}</ul>`;
}

// ---------- создание ----------
function newSheet(s, a) {
  const cats = catList(s), today = a.today();
  const f = { tpl: null, title: '', edited: false, category: 'Еда вне дома', days: 7, step: '100', amount: '100', goalId: '', target: 0, err: '' };
  const sh = openSheet('');
  const autoTitle = () => {
    if (f.edited || !f.tpl) return;
    const t = f.tpl;
    if (t.k === 'cafe') f.title = f.days === 7 ? 'Неделя без кафе' : `${f.days} ${plural(f.days, 'день', 'дня', 'дней')} без кафе`;
    else if (t.k === 'impulse') f.title = `Без импульсивных: ${f.category}`;
    else f.title = t.title;
  };
  const goalChips = () => s.goals.length ? `<label class="l">Куда откладываем</label>${chips('goal', [['', 'Просто в котёл'], ...s.goals.map((g) => [g.id, `${esc(g.emoji || '🎯')} ${esc(g.name)}`])], f.goalId)}` : '';
  const draw = () => {
    if (!f.tpl) {
      sh.el.innerHTML = `<div class="grab"></div><h1 style="font-size:22px">Новый челлендж</h1><div class="pc-tpls">${TEMPLATES.map((t) => `<button type="button" class="pc-tpl" data-tpl="${t.k}"><span class="tile" style="--h:#7b6cf0">${ic(t.icon)}</span><span><b>${esc(t.title)}</b><small>${esc(t.sub)}</small></span>${ic('right')}</button>`).join('')}</div>`;
      $$('[data-tpl]', sh.el).forEach((b) => (b.onclick = () => {
        f.tpl = TEMPLATES.find((t) => t.k === b.dataset.tpl);
        if (f.tpl.k === 'impulse') f.category = 'Одежда';
        if (f.tpl.k === 'nocash') f.days = 7; if (f.tpl.k === 'weekend') f.days = 4; if (f.tpl.k === 'daily') f.days = 30;
        autoTitle(); draw();
      }));
      return;
    }
    const t = f.tpl;
    let fields = '';
    if (t.type === 'avoid') fields += `${t.k === 'impulse' ? `<label class="l">Категория</label>${chips('category', cats.map((c) => [c, esc(c)]), f.category)}` : ''}<label class="l">Срок</label>${chips('days', [7, 14, 30].map((d) => [d, `${d} дней`]), f.days)}`;
    if (t.type === 'piggy52') fields += `<label class="l">Шаг: в неделю N откладываем N × шаг</label>${amountField('pc-step', f.step, s.settings.currency)}<div class="preview" id="pc-total">За год получится ${esc(fm(piggyTotal(parseMoney(f.step) || 0)))}</div>${goalChips()}`;
    if (t.type === 'daily') fields += `<label class="l">Сколько откладываем в день</label>${amountField('pc-amount', f.amount, s.settings.currency)}<label class="l">Сколько дней</label>${chips('days', [[14, '14'], [30, '30'], [60, '60'], [0, 'Без срока']], f.days)}${goalChips()}`;
    if (t.type === 'nocash') fields += `<label class="l">Цель — дней подряд</label>${chips('days', [[7, '7'], [14, '14'], [30, '30'], [0, 'Без цели']], f.days)}`;
    if (t.type === 'weekend') fields += `<label class="l">Цель — выходных подряд</label>${chips('days', [[2, '2'], [4, '4'], [8, '8'], [0, 'Без цели']], f.days)}`;
    sh.el.innerHTML = `<div class="grab"></div><div class="row" style="justify-content:flex-start;gap:8px"><button class="iconbtn" type="button" id="pc-back" aria-label="К списку шаблонов">${ic('left')}</button><h1 style="font-size:22px">${esc(t.title)}</h1></div>
      <label class="l">Название</label><input id="pc-title" maxlength="40" value="${esc(f.title)}">${fields}
      ${f.err ? `<div class="error">${esc(f.err)}</div>` : ''}<button class="primary" type="button" id="pc-save">Начать челлендж</button>`;
    const read = () => {
      const ti = $('#pc-title', sh.el); if (ti) { if (ti.value !== f.title) f.edited = true; f.title = ti.value; }
      const st = $('#pc-step', sh.el); if (st) f.step = st.value;
      const am = $('#pc-amount', sh.el); if (am) f.amount = am.value;
    };
    $('#pc-back', sh.el).onclick = () => { f.tpl = null; f.edited = false; draw(); };
    bindChips(sh.el, (name, v) => { read(); if (name === 'days') f.days = +v; else if (name === 'category') f.category = v; else if (name === 'goal') f.goalId = v; f.err = ''; autoTitle(); draw(); });
    const st = $('#pc-step', sh.el);
    if (st) st.oninput = () => { $('#pc-total', sh.el).textContent = `За год получится ${fm(piggyTotal(parseMoney(st.value) || 0))}`; };
    $('#pc-save', sh.el).onclick = () => {
      read();
      const title = f.title.trim();
      if (!title) { f.err = 'Назовите челлендж'; draw(); return; }
      const ch = { id: uid(), type: t.type, title, startedAt: today, params: {}, log: [] };
      if (t.type === 'avoid') { ch.params.category = t.k === 'cafe' ? 'Еда вне дома' : f.category; ch.endsAt = addDays(today, f.days - 1); }
      if (t.type === 'nocash' || t.type === 'weekend') { if (f.days) ch.target = f.days; }
      if (t.type === 'daily') {
        const amt = parseMoney(f.amount); if (!amt) { f.err = 'Укажите сумму больше нуля'; draw(); return; }
        ch.params.amount = amt; if (f.goalId) ch.params.goalId = f.goalId; if (f.days) ch.target = f.days;
      }
      if (t.type === 'piggy52') {
        const step = parseMoney(f.step); if (!step) { f.err = 'Укажите шаг больше нуля'; draw(); return; }
        ch.params.step = step; ch.target = piggyTotal(step); if (f.goalId) ch.params.goalId = f.goalId;
      }
      sh.close();
      a.store.mutate((st2) => { st2.challenges.push(ch); });
      a.toast('Челлендж начат. Вы справитесь вдвоём!');
    };
  };
  draw();
}

// ---------- действия ----------
function deposit(s, a, ch, amount, extraLog) {
  const goal = goalOf(s, ch.params.goalId);
  const id = uid();
  const tx = { id, type: 'transfer', from: s.viewer, to: 'joint', fromMethod: 'card', toMethod: 'card', amount, date: a.today(), note: `Челлендж: ${ch.title}`, hidden: false };
  if (goal) tx.goalId = goal.id;
  if (validate(tx).length) return false;
  a.store.add(tx);
  a.store.mutate((st) => { const c = st.challenges.find((x) => x.id === ch.id); if (c) (c.log ||= []).push({ ...extraLog, person: s.viewer, amount, txId: id }); });
  return true;
}

export default {
  render(s, a) {
    const txs = visibleTxs(s.txs, s.viewer);
    let h = subHeader('Челленджи') + seg('ptab', [['list', 'Челленджи'], ['ach', 'Достижения']], tab, 'Раздел');
    if (tab === 'ach') return h + `<div class="pa-wrap">${achView(s, a)}</div>`;
    h += `<button class="primary addbtn" data-new type="button" style="margin-top:14px">${ic('plus')} Новый челлендж</button>`;
    const today = a.today(), items = s.challenges.map((c) => ({ c, p: challengeProgress(c, txs, today) }));
    const act = items.filter((x) => x.p.active), fin = items.filter((x) => !x.p.active);
    if (!items.length) return h + `<div class="empty card" style="margin-top:16px"><div class="big">${ic('flame')}</div><b>Играйте на деньги вдвоём</b><span class="muted">Неделя без кафе, копилка на 52 недели, откладывать по чуть-чуть каждый день. Стрики, общий прогресс и значки за успехи.</span></div>`;
    h += `<div class="stack" style="margin-top:16px">${act.map((x) => card(x.c, s, a, txs)).join('')}</div>`;
    if (fin.length) h += `<h2>Завершённые</h2><div class="stack">${fin.map((x) => card(x.c, s, a, txs)).join('')}</div>`;
    return h;
  },
  bind(root, s, a) {
    $$('[data-seg="ptab"]', root).forEach((b) => (b.onclick = () => { tab = b.dataset.v; a.render(); }));
    const nb = $('[data-new]', root); if (nb) nb.onclick = () => newSheet(s, a);
    const find = (id) => s.challenges.find((c) => c.id === id);
    $$('[data-daily]', root).forEach((b) => (b.onclick = () => {
      const ch = find(b.dataset.daily); if (!ch) return;
      if (deposit(s, a, ch, ch.params.amount, { date: a.today() })) a.toast(`Отложено ${fm(ch.params.amount)} — серия растёт`);
    }));
    $$('[data-week]', root).forEach((b) => (b.onclick = () => {
      const ch = find(b.closest('[data-cid]').dataset.cid); if (!ch) return;
      const w = +b.dataset.week, e = (ch.log || []).find((x) => x.week === w);
      if (e) {
        if (e.person !== s.viewer) { a.toast(`Эту неделю отметил${s.profiles[e.person]?.female ? 'а' : ''} ${nameOf(e.person)}`); return; }
        a.store.mutate((st) => { const c = st.challenges.find((x) => x.id === ch.id); c.log = (c.log || []).filter((x) => x.week !== w); });
        if (e.txId) a.store.remove(e.txId);
        a.toast(`Неделя ${w} снята`);
        return;
      }
      if (deposit(s, a, ch, piggyWeekAmount(ch.params.step, w), { week: w })) a.toast(`Неделя ${w}: отложено ${fm(piggyWeekAmount(ch.params.step, w))}`);
    }));
    $$('[data-again]', root).forEach((b) => (b.onclick = () => {
      const ch = find(b.dataset.again); if (!ch) return;
      const len = ch.endsAt ? Math.max(1, Math.round((Date.parse(ch.endsAt) - Date.parse(ch.startedAt)) / 86400000) + 1) : 0;
      const copy = { ...ch, id: uid(), startedAt: a.today(), log: [] };
      if (len) copy.endsAt = addDays(a.today(), len - 1);
      a.store.mutate((st) => { st.challenges.push(copy); });
    }));
    $$('[data-del]', root).forEach((b) => (b.onclick = () => { confirmId = b.dataset.del; a.render(); }));
    $$('[data-keep]', root).forEach((b) => (b.onclick = () => { confirmId = null; a.render(); }));
    $$('[data-del2]', root).forEach((b) => (b.onclick = () => { const id = b.dataset.del2; confirmId = null; a.store.mutate((st) => { st.challenges = st.challenges.filter((c) => c.id !== id); }); }));
  },
  leave() { confirmId = null; tab = 'list'; },
};
