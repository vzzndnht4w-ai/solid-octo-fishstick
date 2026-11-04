import { stats, spendByMethod, inMonth } from '../ledger.js';
import { ic, esc, av, tile, catOf, money as fm, monthSwitch } from '../core.js';

export default {
  render(s, a) {
    const txs = inMonth(s.txs, a.month), st = stats(txs), sp = spendByMethod(txs);
    const cmp = (label, k) => { const x = st.max[k], y = st.dinara[k], t = x + y || 1; return `<div class="card cmp"><div class="muted sm">${label}</div><div class="nums"><span>${fm(x)}</span><span>${fm(y)}</span></div><div class="duo"><i style="width:${(x / t) * 100}%"></i><i style="width:${(y / t) * 100}%"></i></div></div>`; };
    const byCat = {};
    for (const t of txs) if (t.type === 'expense' && !(t.hidden && t.person !== s.viewer)) byCat[t.category] = (byCat[t.category] || 0) + t.amount;
    const cats = Object.entries(byCat).sort((x, y) => y[1] - x[1]), top = cats[0]?.[1] || 1;
    const spTotal = sp.card + sp.cash || 1;
    return `${monthSwitch(a.month)}<div class="stack">
      <div class="row sm muted" style="padding:0 6px"><span>${av('max', 'sm')} ${esc(a.name('max'))}</span><span>${esc(a.name('dinara'))} ${av('dinara', 'sm')}</span></div>
      ${cmp('Заработали', 'earned')}${cmp('Личные траты', 'personal')}${cmp('Доля в общих тратах', 'sharedShare')}</div>
    <h2>Карта и наличные</h2><div class="card cmp"><div class="nums" style="color:var(--ink)"><span style="color:var(--ink)">${ic('card')} ${fm(sp.card)}</span><span style="color:var(--ink)">${fm(sp.cash)} ${ic('cash')}</span></div><div class="duo"><i style="width:${(sp.card / spTotal) * 100}%;background:var(--max)"></i><i style="width:${(sp.cash / spTotal) * 100}%;background:var(--joint)"></i></div></div>
    <h2>Куда уходят деньги</h2><div class="card">${cats.length ? cats.map(([k, v]) => { const [, h] = catOf(k); return `<div class="cat" style="--h:${h}">${tile(k)}<div class="g"><div class="row"><b style="font-weight:600">${esc(k)}</b><b>${fm(v)}</b></div><div class="bar"><i style="width:${(v / top) * 100}%"></i></div></div></div>`; }).join('') : '<div class="muted" style="text-align:center;padding:12px">Расходов пока нет</div>'}</div>`;
  },
  bind() {},
};
