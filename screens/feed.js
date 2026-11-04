import { WALLETS, other, inMonth, method as methodOf } from '../ledger.js';
import { ic, esc, nameOf, feminine, tile, methodTag, money as fm, monthSwitch, dayLabel, $$ } from '../core.js';

/** Как показать операцию в списке и в шторке. */
export function txView(t, viewer) {
  const secret = t.hidden && t.person !== viewer;
  const mname = (m) => (m === 'cash' ? 'наличные' : 'карта');
  if (t.type === 'transfer') {
    const same = t.from === t.to, mf = methodOf(t, 'from'), mt = methodOf(t, 'to');
    const settle = !same && t.from !== 'joint' && t.to !== 'joint';
    const title = same ? (mt === 'cash' ? 'Снятие наличных' : 'Внесение на карту') : settle ? 'Взаиморасчёт' : t.to === 'joint' ? 'В общий котёл' : t.from === 'joint' ? 'Из общего котла' : 'Перевод';
    const short = (w) => (w === 'joint' ? 'котёл' : nameOf(w));
    const route = same ? short(t.from) : `${short(t.from)} → ${short(t.to)}`;
    return { icon: `<span class="tile" style="--h:#7b6cf0">${ic('swap')}</span>`, title, sub: `${esc(route)} · ${mf === mt ? mname(mf) : mname(mf) + ' → ' + mname(mt)}`, amt: fm(t.amount), cls: '' };
  }
  const m = methodTag(methodOf(t));
  const icon = secret ? `<span class="tile" style="--h:#858aa0">${ic('lock')}</span>` : tile(t.category);
  const title = secret ? 'Скрыто' : t.category;
  const note = !secret && t.note ? `<span>${esc(t.note)}</span>` : '';
  if (t.type === 'income') return { icon, title, sub: `<span class="tag ${t.person}">${esc(nameOf(t.person))}</span>${m}${note}`, amt: '+' + fm(t.amount), cls: 'pos' };
  const who = t.scope === 'personal'
    ? `<span class="tag ${t.person}">${esc(nameOf(t.person))} · лично</span>`
    : `<span class="tag joint">Общее ${t.shareMax}/${100 - t.shareMax}</span><span class="tag ${t.paidFrom}">${t.paidFrom === 'joint' ? 'из котла' : 'платил' + feminine(t.paidFrom) + ' ' + esc(nameOf(t.paidFrom))}</span>`;
  return { icon, title, sub: `${who}${m}${note}`, amt: '−' + fm(t.amount), cls: '' };
}

export default {
  render(s, a) {
    const list = inMonth(s.txs, a.month).sort((x, y) => y.date.localeCompare(x.date) || y.createdAt - x.createdAt);
    let html = monthSwitch(a.month);
    if (!list.length) return html + `<div class="empty card"><div class="big">${ic('list')}</div><b>В этом месяце пусто</b><span class="muted">Нажмите «+», чтобы записать первую операцию</span></div>`;
    const groups = [];
    for (const t of list) { const g = groups[groups.length - 1]; if (g && g.date === t.date) g.items.push(t); else groups.push({ date: t.date, items: [t] }); }
    for (const g of groups) {
      const dayNet = g.items.reduce((acc, t) => acc + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0);
      html += `<div class="day"><span>${dayLabel(g.date)}</span><span>${dayNet ? (dayNet > 0 ? '+' : '') + fm(dayNet) : ''}</span></div><div class="list">`;
      for (const t of g.items) { const v = txView(t, s.viewer); html += `<button class="tx" data-id="${t.id}">${v.icon}<div class="mid"><b>${esc(v.title)}</b><div class="sub">${v.sub}</div></div><span class="amt ${v.cls}">${v.amt}</span></button>`; }
      html += '</div>';
    }
    return html;
  },
  bind(root, s, a) { $$('[data-id]', root).forEach((r) => (r.onclick = () => a.openTx(r.dataset.id))); },
};
