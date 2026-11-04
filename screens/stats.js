import { stats, spendByMethod, inMonth, other } from '../ledger.js';
import { ic, esc, av, tile, catOf, money as fm, monthSwitch, MONTHS, monthLabel, $, $$ } from '../core.js';
import { monthlySeries, potSeries, categoryTotals, dailyAverage, forecast, elapsedDays, compactMoney, niceScale } from '../lib/analytics.js';
import { setFilter, resetFilter } from './feed.js';

// Выбор в блоке категорий (живёт, пока открыто приложение).
const pick = { scope: 'all', who: 'both' };

const short = (ym) => MONTHS[+ym.slice(5) - 1].slice(0, 3).toLowerCase();
const W = 340, H = 196, L = 44, R = 8, T = 12, B = 26;

/** Каркас графика: ось Y с сеткой, подписи месяцев, невидимые зоны касания. */
function frame(yms, sc, y) {
  const slot = (W - L - R) / yms.length;
  let g = '';
  for (let v = sc.min; v <= sc.max + 1; v += sc.step) {
    const yy = y(v);
    g += `<line class="vz-grid ${v === 0 ? 'zero' : ''}" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text class="vz-tick" x="${L - 6}" y="${yy + 3.5}" text-anchor="end">${compactMoney(v)}</text>`;
  }
  const labels = yms.map((ym, i) => `<text class="vz-x ${i === yms.length - 1 ? 'sel' : ''}" data-i="${i}" x="${L + slot * (i + 0.5)}" y="${H - 8}" text-anchor="middle">${short(ym)}</text>`).join('');
  return { slot, g, labels };
}

function barChart(series) {
  const max = Math.max(...series.flatMap((m) => [m.income, m.expense]), 1);
  const sc = niceScale(max), y = (v) => T + (H - T - B) * (1 - (v - sc.min) / (sc.max - sc.min));
  const f = frame(series.map((m) => m.ym), sc, y), base = y(0), bw = 14, gap = 2;
  // столбик с скруглением 4px только на свободном конце
  const bar = (cx, v, cls) => {
    if (v <= 0) return '';
    const h = Math.max(base - y(v), 1), r = Math.min(4, h), x = cx;
    return `<path class="vz-bar ${cls}" d="M${x} ${base}V${base - h + r}a${r} ${r} 0 0 1 ${r} ${-r}h${bw - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}V${base}z"/>`;
  };
  const bars = series.map((m, i) => {
    const c = L + f.slot * (i + 0.5);
    return `<g class="vz-g ${i === series.length - 1 ? 'sel' : ''}" data-i="${i}">${bar(c - bw - gap / 2, m.income, 'inc')}${bar(c + gap / 2, m.expense, 'exp')}</g>`;
  }).join('');
  const hits = series.map((m, i) => `<rect class="vz-hit" data-i="${i}" x="${L + f.slot * i}" y="${T}" width="${f.slot}" height="${H - T}" fill="transparent"/>`).join('');
  return `<svg class="vz" viewBox="0 0 ${W} ${H}" role="img" aria-label="Доходы и расходы по месяцам, последние ${series.length} месяцев">${f.g}${bars}${f.labels}${hits}</svg>`;
}

function lineChart(pot, cur) {
  const pts = pot.points, vals = pts.map((p) => p.value);
  const sc = niceScale(Math.max(...vals, 0), Math.min(...vals, 0));
  const y = (v) => T + 10 + (H - T - 10 - B) * (1 - (v - sc.min) / (sc.max - sc.min));
  const f = frame(pts.map((p) => p.ym), sc, y);
  const xy = pts.map((p, i) => [L + f.slot * (i + 0.5), y(p.value)]);
  const line = xy.map(([x, yy], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${yy.toFixed(1)}`).join('');
  const area = `${line}L${xy[xy.length - 1][0]} ${y(0)}L${xy[0][0]} ${y(0)}z`;
  const dots = xy.map(([x, yy], i) => `<circle class="vz-dot ${i === xy.length - 1 ? 'sel' : ''}" data-i="${i}" cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="4.5"/>`).join('');
  const [lx, ly] = xy[xy.length - 1];
  const hits = pts.map((p, i) => `<rect class="vz-hit" data-i="${i}" x="${L + f.slot * i}" y="${T}" width="${f.slot}" height="${H - T}" fill="transparent"/>`).join('');
  const lab = `<text class="vz-end" x="${lx}" y="${ly - 11}" text-anchor="end">${compactMoney(pts[pts.length - 1].value)} ${esc(cur)}</text>`;
  return `<svg class="vz" viewBox="0 0 ${W} ${H}" role="img" aria-label="${pot.kind === 'joint' ? 'Общий котёл' : 'Общий баланс'} по месяцам">${f.g}<path class="vz-area" d="${area}"/><path class="vz-line" d="${line}"/>${dots}${lab}${f.labels}${hits}</svg>`;
}

const sgn = (v) => (v > 0 ? '+' : v < 0 ? '' : '') + fm(v);

export default {
  render(s, a) {
    const txs = inMonth(s.txs, a.month), st = stats(txs), sp = spendByMethod(txs);
    const today = a.today();
    const cmp = (label, k) => { const x = st.max[k], y = st.dinara[k], t = x + y || 1; return `<div class="card cmp"><div class="muted sm">${label}</div><div class="nums"><span>${fm(x)}</span><span>${fm(y)}</span></div><div class="duo"><i style="width:${(x / t) * 100}%"></i><i style="width:${(y / t) * 100}%"></i></div></div>`; };
    const spTotal = sp.card + sp.cash || 1;

    // средний расход и прогноз
    const avg = dailyAverage(s.txs, a.month, today), fc = forecast(s.txs, a.month, today), days = elapsedDays(a.month, today);
    const pace = avg === null || !(sp.card + sp.cash) ? '' : `<div class="card pace"><div><div class="muted sm">В среднем в день</div><b>${fm(avg)}</b><span class="muted sm">за ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}</span></div>${fc !== null ? `<div><div class="muted sm">К концу месяца, прогноз</div><b>${fm(fc)}</b><span class="muted sm">если тратить в том же темпе</span></div>` : ''}</div>`;

    // графики
    const series = monthlySeries(s.txs, a.month, 6), pot = potSeries(s.txs, a.month, 6);
    const hasData = series.some((m) => m.income || m.expense);
    const charts = hasData ? `
      <h2>Доходы и расходы</h2>
      <div class="card vzc" data-chart="bars"><div class="vz-legend"><span><i class="inc"></i>Доходы</span><span><i class="exp"></i>Расходы</span></div>${barChart(series)}<div class="vz-detail" aria-live="polite"></div>
        <details class="vz-table"><summary>Таблица</summary><table><thead><tr><th>Месяц</th><th>Доходы</th><th>Расходы</th><th>Итог</th></tr></thead><tbody>${series.map((m) => `<tr><td>${short(m.ym)} ${m.ym.slice(2, 4)}</td><td>${fm(m.income)}</td><td>${fm(m.expense)}</td><td>${sgn(m.net)}</td></tr>`).join('')}</tbody></table></details></div>
      <h2>${pot.kind === 'joint' ? 'Общий котёл' : 'Баланс'} по месяцам</h2>
      <div class="card vzc" data-chart="line">${lineChart(pot, s.settings.currency || "₽")}<div class="vz-detail" aria-live="polite"></div>
        <details class="vz-table"><summary>Таблица</summary><table><thead><tr><th>На конец</th><th>${pot.kind === 'joint' ? 'Котёл' : 'Баланс'}</th></tr></thead><tbody>${pot.points.map((p) => `<tr><td>${short(p.ym)} ${p.ym.slice(2, 4)}</td><td>${fm(p.value)}</td></tr>`).join('')}</tbody></table></details></div>` : '';

    // категории
    const you = s.viewer, her = other(you);
    const cats = categoryTotals(s.txs, { ym: a.month, viewer: you, scope: pick.scope, who: pick.who });
    const top = cats[0]?.[1] || 1, total = cats.reduce((x, [, v]) => x + v, 0);
    const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-pick="${key}" data-v="${v}" class="${pick[key] === v ? 'on' : ''}" aria-pressed="${pick[key] === v}">${esc(l)}</button>`).join('')}</div>`;
    const catRows = cats.length ? cats.map(([k, v]) => { const [, h] = catOf(k); return `<button class="cat catbtn" style="--h:${h}" data-cat="${esc(k)}" aria-label="${esc(k)}, ${fm(v)}. Открыть операции">${tile(k)}<div class="g"><div class="row"><b style="font-weight:600">${esc(k)}</b><b>${fm(v)}</b></div><div class="bar"><i style="width:${(v / top) * 100}%"></i></div></div><span class="muted chev">${ic('right')}</span></button>`; }).join('') : '<div class="muted" style="text-align:center;padding:12px">Расходов пока нет</div>';

    return `${monthSwitch(a.month)}<div class="stack">
      <div class="row sm muted" style="padding:0 6px"><span>${av('max', 'sm')} ${esc(a.name('max'))}</span><span>${esc(a.name('dinara'))} ${av('dinara', 'sm')}</span></div>
      ${cmp('Заработали', 'earned')}${cmp('Личные траты', 'personal')}${cmp('Доля в общих тратах', 'sharedShare')}${pace}</div>
    ${charts}
    <h2>Карта и наличные</h2><div class="card cmp"><div class="nums" style="color:var(--ink)"><span style="color:var(--ink)">${ic('card')} ${fm(sp.card)}</span><span style="color:var(--ink)">${fm(sp.cash)} ${ic('cash')}</span></div><div class="duo"><i style="width:${(sp.card / spTotal) * 100}%;background:var(--max)"></i><i style="width:${(sp.cash / spTotal) * 100}%;background:var(--joint)"></i></div></div>
    <h2>Куда уходят деньги</h2>
    <div class="stack" style="margin-bottom:10px">${seg('scope', [['all', 'Все'], ['shared', 'Общие'], ['personal', 'Личные']])}${seg('who', [['me', 'Мои'], ['other', esc(a.name(her))], ['both', 'Обе']])}</div>
    <div class="card">${catRows}${cats.length > 1 ? `<div class="row cat-total"><span class="muted">Всего</span><b>${fm(total)}</b></div>` : ''}</div>`;
  },
  bind(root, s, a) {
    $$('[data-pick]', root).forEach((b) => (b.onclick = () => { pick[b.dataset.pick] = b.dataset.v; a.render(); }));
    $$('[data-cat]', root).forEach((b) => (b.onclick = () => {
      resetFilter();
      setFilter({ cat: b.dataset.cat, type: 'expense', scope: pick.scope === 'all' ? 'all' : pick.scope });
      a.go('feed');
    }));

    // касание по графикам: подсветка месяца и подпись под графиком
    const series = monthlySeries(s.txs, a.month, 6), pot = potSeries(s.txs, a.month, 6);
    const info = {
      bars: (i) => { const m = series[i]; return `<b>${esc(monthLabel(m.ym))}</b><span><i class="dot inc"></i>Доходы ${fm(m.income)}</span><span><i class="dot exp"></i>Расходы ${fm(m.expense)}</span><span class="${m.net < 0 ? 'neg' : 'pos'}">Итог ${sgn(m.net)}</span>`; },
      line: (i) => { const p = pot.points[i]; return `<b>${esc(monthLabel(p.ym))}</b><span>${pot.kind === 'joint' ? 'Котёл' : 'Баланс'} на конец месяца ${fm(p.value)}</span>`; },
    };
    $$('[data-chart]', root).forEach((box) => {
      const kind = box.dataset.chart, detail = $('.vz-detail', box);
      const select = (i) => {
        $$('.vz-g,.vz-dot,.vz-x', box).forEach((el) => el.classList.toggle('sel', +el.dataset.i === i));
        detail.innerHTML = info[kind](i);
      };
      $$('.vz-hit', box).forEach((h) => { h.onclick = () => select(+h.dataset.i); h.onpointerenter = (e) => e.pointerType === 'mouse' && select(+h.dataset.i); });
      select(5);
    });
  },
};
