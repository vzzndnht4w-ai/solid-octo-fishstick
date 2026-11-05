import { balancesByMethod, debt, stats, inMonth, other, reservedInGoals } from '../ledger.js';
import { ic, av, esc, nameOf, init, feminine, money as fm, monthLabel, dayLabel, $, $$ } from '../core.js';
import { registerIcons } from '../icons.js';
import widgets from '../widgets/index.js';
import { debtAgeDays, plural } from '../lib/tools.js';
import { load as loadInbox, unreadCount } from '../lib/inbox.js';
import { balanceSeries, rangeDelta, chartPoints, smoothPath } from '../lib/series.js';
import { countUp, stagger, ringFill } from '../lib/motion.js';
import { startWith } from './add.js';
import { txView } from './feed.js';
import { txBadge } from '../lib/together-ui.js';

registerIcons({
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeoff: 'M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
});

const OLD_DEBT_DAYS = 14, OLD_DEBT_MIN = 100000;
/** Мягкое напоминание, если долг висит дольше 14 дней и больше 1 000 ₽. */
export function debtNote(txs, d, today) {
  if (Math.abs(d) <= OLD_DEBT_MIN) return '';
  const days = debtAgeDays(txs, today);
  if (days == null || days <= OLD_DEBT_DAYS) return '';
  const w = Math.round(days / 7), m = Math.round(days / 30);
  const age = days < 60 ? `${w} ${plural(w, 'неделю', 'недели', 'недель')}` : `около ${m} ${plural(m, 'месяца', 'месяцев', 'месяцев')}`;
  return `<p class="debtnote" role="note">Долг висит ${age} — самое время рассчитаться</p>`;
}

// ---------- Состояние экрана между перерисовками ----------
const HIDE_KEY = 'we-hide-bal';
const PERIODS = [[7, '7 дн'], [30, '30 дн'], [90, '3 мес']];
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const CHART_H = 190, SPIKE_STEP = 3;
let period = 30, resizeWatch = null;

const isHidden = () => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } };
const setHidden = (v) => { try { v ? localStorage.setItem(HIDE_KEY, '1') : localStorage.removeItem(HIDE_KEY); } catch {} };
const shortDate = (ymd) => `${+ymd.slice(8)} ${MON[+ymd.slice(5, 7) - 1]}`;

// ---------- Разметка ----------
/** Колокольчик «Что нового» с числом непрочитанных. */
const bell = (viewer) => {
  const n = unreadCount(loadInbox(viewer));
  return `<button class="bell" data-inbox aria-label="Что нового${n ? `: непрочитанных ${n}` : ''}">${ic('bell')}${n ? `<span class="bn" aria-hidden="true">${n > 99 ? '99+' : n}</span>` : ''}</button>`;
};

function heroHtml(all, d) {
  const bm = balancesByMethod(all), total = bm.joint.card + bm.joint.cash, reserved = reservedInGoals(all);
  const sub = reserved ? `свободно ${fm(total - reserved)} · в целях ${fm(reserved)}` : `карта ${fm(bm.joint.card)} · наличные ${fm(bm.joint.cash)}`;
  const settle = d
    ? `<button class="act" data-settle>${ic('check')}Рассчитаться<i>${fm(Math.abs(d))}</i></button>`
    : `<button class="act" disabled>${ic('check')}Квиты</button>`;
  return `<section class="hero${isHidden() ? ' hide' : ''}" data-hero aria-label="Общий баланс"><i class="bl b1"></i><i class="bl b2"></i><i class="bl b3"></i>
    <div class="hl"><span>Общий баланс</span><button class="eye" data-eye aria-pressed="${isHidden()}" aria-label="Скрыть сумму"><span class="on">${ic('eye')}</span><span class="off">${ic('eyeoff')}</span></button></div>
    <div class="bal" data-bal>${fm(total)}</div><div class="hs">${sub}</div>
    <div class="acts"><button class="act" data-act="add">${ic('plus')}Операция</button><button class="act" data-act="transfer">${ic('swap')}Перевод</button>${settle}</div></section>`;
}

function debtHtml(all, d, today) {
  if (!d) return '';
  const debtor = d > 0 ? 'dinara' : 'max';
  return `<p class="debtline">${esc(nameOf(debtor))} → ${esc(nameOf(other(debtor)))} <b>${fm(Math.abs(d))}</b></p>${debtNote(all, d, today)}`;
}

const chartHtml = () => `<section class="panel" aria-label="Динамика общего баланса">
  <div class="ph"><h2 class="ptitle">Динамика</h2><div class="pseg" role="group" aria-label="Период"><i class="pill" data-pill></i>${PERIODS.map(([n, l]) => `<button type="button" data-period="${n}" class="${n === period ? 'on' : ''}" aria-pressed="${n === period}">${l}</button>`).join('')}</div></div>
  <div class="cbig"><span class="cval" data-cval></span><span class="delta" data-cdelta></span></div>
  <div class="chart" data-chart></div><div class="axis" data-axis></div></section>`;

function personHtml(p, ms) {
  const spent = ms[p].personal + ms[p].sharedShare, earned = ms[p].earned, left = earned - spent;
  const pct = earned ? Math.round((spent / earned) * 100) : 0;
  const label = earned ? `осталось из ${fm(earned)}` : 'доходов за месяц нет';
  return `<div class="pp ${p}${pct > 100 ? ' over' : ''}" data-frac="${Math.min(1, pct / 100)}" data-left="${left}">
    <div class="nm">${av(p, 'sm')}${esc(nameOf(p))}</div>
    <div class="prg" role="img" aria-label="${esc(nameOf(p))} потратил${feminine(p)} ${pct}% дохода за месяц"><svg viewBox="0 0 88 88" aria-hidden="true"><circle class="bg" cx="44" cy="44" r="35"/><circle class="fg" cx="44" cy="44" r="35"/></svg><span class="tt">${earned ? `${pct}%` : '—'}</span></div>
    <div class="pv ${left < 0 ? 'neg' : ''}">${fm(left)}</div><div class="pl">${label}</div></div>`;
}

function peopleHtml(s, a) {
  const ms = stats(inMonth(s.txs, a.month));
  return `<section class="sec"><div class="row whead"><b>${esc(monthLabel(a.month))}</b><span class="mswitch"><button data-m="-1" aria-label="Предыдущий месяц">${ic('left')}</button><button data-m="1" aria-label="Следующий месяц">${ic('right')}</button></span></div>
    <div class="ppl">${personHtml('max', ms)}${personHtml('dinara', ms)}</div></section>`;
}

function recentHtml(s) {
  const last = s.txs.map((t, i) => [t, i]).sort((x, y) => y[0].date.localeCompare(x[0].date) || y[1] - x[1]).slice(0, 5).map((x) => x[0]);
  if (!last.length) return '';
  const rows = last.map((t) => {
    const v = txView(t, s.viewer);
    return `<button class="tx" data-tx="${esc(t.id)}">${v.icon}<div class="mid"><b>${esc(v.title)}</b><div class="sub">${v.sub}${txBadge(s, t)}</div></div><span class="amt ${v.cls}">${v.amt}<small>${esc(dayLabel(t.date))}</small></span></button>`;
  }).join('');
  return `<section class="sec"><div class="row whead"><b>Последние операции</b><button class="linkbtn" data-feed>Все ${ic('right')}</button></div><div class="rlist">${rows}</div></section>`;
}

// ---------- Порядок блоков: цели и бюджеты, ближайшее, остальное ----------
const pick = (...ids) => ids.map((id) => widgets.find((w) => w.id === id)).filter(Boolean);
const PLAN = pick('goals', 'savings', 'budgets'), SOON = pick('upcoming');
const REST = widgets.filter((w) => !PLAN.includes(w) && !SOON.includes(w));
const draw = (list, s, a) => list.map((w) => w.render(s, a)).join('');

// ---------- График «Динамика» ----------
function drawChart(root, s, a, st, animate) {
  const box = $('[data-chart]', root), val = $('[data-cval]', root), dl = $('[data-cdelta]', root), axis = $('[data-axis]', root);
  const full = balanceSeries(s.txs, { days: period, end: a.today() }), last = full[full.length - 1];
  const from = val._v ?? 0;
  val._v = last.value;
  countUp(val, last.value, { format: fm, from, ms: animate ? 900 : 0 });
  box.classList.toggle('still', !animate);
  if (full.every((p) => p.value === 0)) {
    st.pts = [];
    box.innerHTML = '<div class="chart-empty">График появится, когда в общем балансе будут операции</div>';
    dl.hidden = true; axis.innerHTML = '';
    return;
  }
  const { pct, amount } = rangeDelta(full);
  dl.hidden = false;
  dl.className = `delta ${amount > 0 ? 'up' : amount < 0 ? 'down' : ''}`;
  dl.textContent = !amount ? '0 %' : `${amount > 0 ? '▲' : '▼'} ${pct == null ? fm(Math.abs(amount)) : `${Math.abs(pct).toFixed(1).replace('.', ',')} %`}`;
  const W = Math.round(box.clientWidth) || 320;
  const plot = period === 90 ? full.filter((_, i) => (full.length - 1 - i) % SPIKE_STEP === 0) : full;
  const pts = st.pts = chartPoints(plot, { w: W, h: CHART_H, top: 44 });
  const line = smoothPath(pts), end = pts[pts.length - 1], first = pts[0];
  const sw = pts.length > 40 ? 1.5 : 2.4;
  const spikes = pts.map((p, i) => `<line class="ch-spike" x1="${p.x}" y1="${p.y}" x2="${p.x}" y2="${CHART_H}" stroke="url(#chS)" stroke-width="${sw}" stroke-linecap="round" style="animation-delay:${i * 14}ms"/>`).join('');
  box.innerHTML = `<svg viewBox="0 0 ${W} ${CHART_H}" role="img" aria-label="График общего баланса за ${period} дн.: с ${esc(fm(full[0].value))} до ${esc(fm(last.value))}">
    <defs><linearGradient id="chA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="st-a1"/><stop offset="1" class="st-a0"/></linearGradient>
    <linearGradient id="chS" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${CHART_H}"><stop offset="0" class="st-s1"/><stop offset="1" class="st-s0"/></linearGradient></defs>
    ${spikes}<path class="ch-area" fill="url(#chA)" d="${line} L${end.x} ${CHART_H} L${first.x} ${CHART_H}Z"/><path class="ch-line" d="${line}" pathLength="1"/>
    <g class="ch-mk"><line class="ch-mkl" y2="${CHART_H}"/><circle class="ch-glow" r="13"/><circle class="ch-dot" r="6"/></g></svg><div class="ctip"></div>`;
  place(box, pts[pts.length - 1]);
  axis.innerHTML = [0, 1, 2, 3].map((k) => `<span>${shortDate(full[Math.round((k * (full.length - 1)) / 3)].date)}</span>`).join('');
}

function place(box, p) {
  $$('.ch-glow,.ch-dot', box).forEach((c) => { c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); });
  const l = $('.ch-mkl', box);
  l.setAttribute('x1', p.x); l.setAttribute('x2', p.x); l.setAttribute('y1', p.y);
}

/** Движение пальцем/мышью по графику: маркер, сумма и дата. */
function bindScrub(root, st) {
  const box = $('[data-chart]', root), val = $('[data-cval]', root);
  let down = false;
  const reset = () => {
    const tip = $('.ctip', box);
    if (!tip) return;
    tip.style.opacity = 0;
    place(box, st.pts[st.pts.length - 1]);
    val.textContent = fm(val._v);
  };
  const scrub = (e) => {
    if (!st.pts.length) return;
    const x = e.clientX - box.getBoundingClientRect().left;
    const p = st.pts.reduce((b, c) => (Math.abs(c.x - x) < Math.abs(b.x - x) ? c : b));
    place(box, p);
    val.textContent = fm(p.value);
    const tip = $('.ctip', box), half = tip.offsetWidth / 2;
    tip.innerHTML = `${esc(fm(p.value))}<small>${esc(shortDate(p.date))}</small>`;
    tip.style.left = `${Math.max(half, Math.min(box.clientWidth - half, p.x))}px`;
    tip.style.opacity = 1;
  };
  box.onpointerdown = (e) => { down = true; box.setPointerCapture?.(e.pointerId); scrub(e); };
  box.onpointermove = (e) => { if (down || e.pointerType === 'mouse') scrub(e); };
  box.onpointerup = box.onpointercancel = () => { down = false; reset(); };
  box.onpointerleave = () => { if (!down) reset(); };
}

function bindChart(root, s, a, fresh) {
  const st = { pts: [] }, box = $('[data-chart]', root), pill = $('[data-pill]', root);
  const movePill = () => {
    const on = $('.pseg .on', root);
    pill.style.transform = `translateX(${on.offsetLeft}px)`;
    pill.style.width = `${on.offsetWidth}px`;
  };
  movePill();
  requestAnimationFrame(() => pill.classList.add('ready'));
  document.fonts?.ready.then(() => pill.isConnected && movePill());
  $$('[data-period]', root).forEach((b) => (b.onclick = () => {
    period = +b.dataset.period;
    $$('[data-period]', root).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    movePill();
    drawChart(root, s, a, st, true);
  }));
  drawChart(root, s, a, st, fresh);
  bindScrub(root, st);
  resizeWatch?.disconnect();
  let width = box.clientWidth;
  resizeWatch = new ResizeObserver(() => {
    if (!box.isConnected) return resizeWatch.disconnect();
    if (Math.abs(box.clientWidth - width) < 2) return;
    width = box.clientWidth;
    movePill();
    drawChart(root, s, a, st, false);
  });
  resizeWatch.observe(box);
}

// ---------- Герой, люди ----------
function bindHero(root, s, a) {
  const hero = $('[data-hero]', root), bal = $('[data-bal]', root);
  const total = balancesByMethod(s.txs).joint;
  $('[data-eye]', root).onclick = (e) => {
    const hide = hero.classList.toggle('hide');
    setHidden(hide);
    e.currentTarget.setAttribute('aria-pressed', hide);
  };
  $$('[data-act]', root).forEach((b) => (b.onclick = () => {
    if (b.dataset.act === 'transfer') { startWith({ type: 'transfer' }, s); a.go('add', { keepDraft: true }); } else a.go('add');
  }));
  const st = $('[data-settle]', root);
  if (st) st.onclick = () => {
    const d = debt(s.txs); if (!d) return;
    const from = d > 0 ? 'dinara' : 'max', to = other(from);
    a.store.add({ type: 'transfer', amount: Math.abs(d), from, to, fromMethod: 'card', toMethod: 'card', date: a.today(), note: 'Взаиморасчёт', hidden: false });
    a.toast('Долг погашен');
  };
  return { bal, total: total.card + total.cash };
}

export default {
  render(s, a) {
    const all = s.txs, d = debt(all);
    const first = !all.length ? `<div class="tip"><span class="tile">${ic('bulb')}</span><div><b>Начните с дохода</b><br><span class="muted">Нажмите «+», выберите «Доход» и запишите зарплату. Потом пополните общий баланс переводом.</span></div></div>` : '';
    return `<div class="home stack"><div class="top"><div class="hello"><div class="muted">Привет,</div><b>${esc(nameOf(s.viewer))}</b></div><div class="topr">${bell(s.viewer)}<button class="av ${s.viewer}" data-switch aria-label="Сменить пользователя">${esc(init(s.viewer))}</button></div></div>
    ${first}${heroHtml(all, d)}${debtHtml(all, d, a.today())}${chartHtml()}${peopleHtml(s, a)}${draw(PLAN, s, a)}${draw(SOON, s, a)}${recentHtml(s)}${draw(REST, s, a)}</div>`;
  },
  bind(root, s, a) {
    const fresh = root.classList.contains('enter');   // анимации — только при переходе на экран, не при каждой перерисовке
    const { bal, total } = bindHero(root, s, a);
    countUp(bal, total, { format: fm, ms: fresh ? 1100 : 0 });
    bindChart(root, s, a, fresh);
    $$('.pp', root).forEach((el) => {
      ringFill($('.fg', el), +el.dataset.frac, { ms: fresh ? 1100 : 0 });
      countUp($('.pv', el), +el.dataset.left, { format: fm, ms: fresh ? 1200 : 0 });
    });
    $('[data-inbox]', root).onclick = () => a.go('inbox');
    $$('[data-tx]', root).forEach((b) => (b.onclick = () => a.openTx(b.dataset.tx)));
    const all = $('[data-feed]', root);
    if (all) all.onclick = () => a.go('feed');
    widgets.forEach((w) => w.bind && w.bind(root, s, a));
    if (fresh) stagger(root, '.home>*');
  },
};
