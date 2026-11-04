// Виджет «В ближайшие 7 дней»: списания регулярных платежей и запас котла. Нечего показать — ''.
import { ic, esc, money as fm } from '../core.js';
import { upcomingCharges, chargesTotals, plural, runway } from '../lib/tools.js';
import { runwayText, chargeTitle } from '../screens/calendar.js';

export default {
  id: 'upcoming',
  render(s, a) {
    const today = a.today();
    const list = upcomingCharges(s.recurring, today, 7).filter((c) => c.tpl.type === 'expense');
    const rw = runway(s.txs, today.slice(0, 7));
    if (!list.length) return '';
    const total = chargesTotals(list).out;
    const shown = list.slice(0, 3).map((c) => `<div class="up"><span class="uptitle">${esc(chargeTitle(c.tpl, s.viewer, today))}</span><span class="upamt">${fm(c.tpl.amount)} <span class="muted">(${esc(c.in <= 0 ? 'сегодня' : c.in === 1 ? 'завтра' : `${c.in} ${plural(c.in, 'день', 'дня', 'дней')}`)})</span></span></div>`).join('');
    const more = list.length > 3 ? `<div class="muted sm">и ещё ${list.length - 3} ${plural(list.length - 3, 'платёж', 'платежа', 'платежей')}</div>` : '';
    return `<section class="card wup"><div class="row whead"><b>${ic('qcal')} В ближайшие 7 дней</b><button class="linkbtn" data-up-go="calendar">Календарь ${ic('right')}</button></div>${shown}${more}<div class="uptotal">Всего <b>${fm(total)}</b></div>${rw ? `<p class="qhint">${esc(runwayText(rw))}</p>` : ''}</section>`;
  },
  bind(root, s, a) {
    root.querySelectorAll('.wup [data-up-go]').forEach((b) => (b.onclick = () => a.go(b.dataset.upGo)));
  },
};
