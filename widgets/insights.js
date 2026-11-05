// Виджет «Замечено»: 1–2 коротких наблюдения по данным месяца. Мало данных — ничего не показывает.
import { ic, esc, money as fm } from '../core.js';
import { insights } from '../lib/analytics.js';

export default {
  id: 'insights',
  render(s, a) {
    const list = insights(s.txs, a.month, s.viewer, fm);
    if (!list.length) return '';
    return `<div class="sec insights" aria-label="Наблюдения">${list.map((i) => `<div class="ins ${esc(i.tone)}"><span class="ins-ic">${ic(i.icon)}</span><span>${esc(i.text)}</span></div>`).join('')}</div>`;
  },
};
