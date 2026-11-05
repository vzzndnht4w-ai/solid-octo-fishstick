import '../lib/savings-icons.js';
import { ic, esc, money as fm } from '../core.js';
import { byKind, totalFor, kindOf } from '../lib/savings.js';
import { bindGo } from '../planui.js';

export default {
  id: 'savings',
  render(s) {
    const items = s.savings || [];
    const total = totalFor(items, s.viewer, s.txs);
    if (!items.length || total <= 0) return '';
    const kinds = byKind(items, s.viewer, s.txs);
    const segs = kinds.map((k) => `<i style="flex:${k.total};background:${kindOf(k.kind).color}" title="${esc(kindOf(k.kind).label)}"></i>`).join('');
    const legend = kinds.slice(0, 3).map((k) => `<span><i style="background:${kindOf(k.kind).color}"></i>${esc(kindOf(k.kind).label)}</span>`).join('');
    return `<section class="sec wsav"><div class="row whead"><b>${ic('bank')} Накопления · ${fm(total)}</b><button class="linkbtn" data-plan-go="savings" aria-label="Все накопления">Все ${ic('right')}</button></div>
      <div class="svbar" role="img" aria-label="Накопления по типам: ${esc(kinds.map((k) => `${kindOf(k.kind).label} ${fm(k.total)}`).join(', '))}">${segs}</div>
      <div class="svlegend">${legend}</div></section>`;
  },
  bind: (root, s, a) => bindGo(root, a),
};
