// Календарь платежей: ближайшие 30 дней регулярных платежей, итог, «пропустить в этом месяце», запас котла.
import { subHeader, ic, esc, tile, money as fm, dayLabel, MONTHS_GEN, $$ } from '../core.js';
import { upcomingCharges, chargesTotals, skipLastRun, runway, isSecret, plural } from '../lib/tools.js';
import '../lib/tools-ui.js';

const DAYS = 30;

/** «завтра», «через 4 дня». */
export const inText = (n) => (n <= 0 ? 'сегодня' : n === 1 ? 'завтра' : `через ${n} ${plural(n, 'день', 'дня', 'дней')}`);
/** Название платежа с учётом сюрприза. */
export const chargeTitle = (tpl, viewer, today) => (isSecret(tpl, viewer, today) ? 'Скрыто' : tpl.note || (tpl.type === 'transfer' ? 'Перевод' : tpl.category) || 'Платёж');
/** Фраза про запас котла. */
export const runwayText = (rw) => {
  const m = rw.months;
  const w = Number.isInteger(m) ? plural(m, 'месяц', 'месяца', 'месяцев') : 'месяца';
  return m >= 24 ? `Котла хватит больше чем на 2 года при общих тратах ${fm(rw.monthly)} в месяц` : `Котла хватит примерно на ${String(m).replace('.', ',')} ${w} при общих тратах ${fm(rw.monthly)} в месяц`;
};
const weekday = (d) => new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)).toLocaleDateString('ru-RU', { weekday: 'short' });

function item(c, s, today) {
  const t = c.tpl, secret = isSecret(t, s.viewer, today), title = chargeTitle(t, s.viewer, today);
  const icon = t.type === 'transfer' ? `<span class="tile" style="--h:#7b6cf0">${ic('swap')}</span>` : secret ? `<span class="tile" style="--h:#858aa0">${ic('lock')}</span>` : tile(t.category);
  const sg = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
  const label = `Пропустить «${title}» ${c.date.slice(0, 7) === today.slice(0, 7) ? 'в этом месяце' : `в ${MONTHS_GEN[+c.date.slice(5, 7) - 1]}`}`;
  return `<div class="cal-it">${icon}<div class="mid"><b>${esc(title)}</b><div class="sub muted sm">${t.type === 'income' ? 'Придёт' : t.type === 'transfer' ? 'Перевод' : t.scope === 'personal' ? 'Личное' : 'Общее'}</div></div><div class="cal-r"><span class="amt ${t.type === 'income' ? 'pos' : ''}">${sg}${fm(t.amount)}</span><button type="button" class="skipbtn" data-skip="${esc(c.recId)}" data-date="${esc(c.date)}" aria-label="${esc(label)}">${ic('qskip')} Пропустить</button></div></div>`;
}

export default {
  render(s, a) {
    const today = a.today(), list = upcomingCharges(s.recurring, today, DAYS);
    const rw = runway(s.txs, today.slice(0, 7));
    if (!list.length && !s.recurring.some((r) => r.active !== false)) {
      return `${subHeader('Календарь платежей')}<div class="empty card"><div class="big">${ic('qcal')}</div><b>Регулярных платежей пока нет</b><span class="muted">Добавьте аренду, подписки или зарплату — и здесь появится график списаний.</span><button class="primary" data-cal-go="recurring" style="max-width:280px">Добавить платёж</button></div>${rw ? `<div class="card cal-run">${ic('qrun')}<span>${esc(runwayText(rw))}</span></div>` : ''}`;
    }
    const { out, inc } = chargesTotals(list);
    const hero = `<section class="cal-hero"><div class="lab">${ic('qcal')} Ближайшие ${DAYS} дней</div><div class="sum">${fm(out)}</div><div class="ccap">на ближайшие ${DAYS} дней уйдёт ${fm(out)}${inc ? ` · придёт ${fm(inc)}` : ''}</div></section>`;
    const run = rw ? `<div class="card cal-run" role="note">${ic('qrun')}<span><b>Хватит ли котла.</b> ${esc(runwayText(rw))}</span></div>` : '';
    const groups = [];
    for (const c of list) { const g = groups[groups.length - 1]; if (g && g.date === c.date) g.items.push(c); else groups.push({ date: c.date, in: c.in, items: [c] }); }
    const body = groups.length ? groups.map((g) => `<div class="day"><span>${esc(dayLabel(g.date))}, ${esc(weekday(g.date))}</span><span>${esc(inText(g.in))}</span></div><div class="list">${g.items.map((c) => item(c, s, today)).join('')}</div>`).join('')
      : `<div class="empty card"><b>В ближайшие ${DAYS} дней списаний нет</b><span class="muted">Все платежи уже проведены или пропущены.</span></div>`;
    return `${subHeader('Календарь платежей')}<div class="stack">${hero}${run}</div>${body}<button class="ghost" data-cal-go="recurring" style="margin-top:18px">${ic('swap')} Управлять регулярными платежами</button>`;
  },
  bind(root, s, a) {
    $$('[data-cal-go]', root).forEach((b) => (b.onclick = () => a.go(b.dataset.calGo)));
    $$('[data-skip]', root).forEach((b) => (b.onclick = () => {
      const id = b.dataset.skip, date = b.dataset.date, rec = s.recurring.find((r) => r.id === id); if (!rec) return;
      const prev = rec.lastRun ?? null;
      a.store.mutate((x) => { const r = x.recurring.find((z) => z.id === id); if (r) r.lastRun = skipLastRun(r, date); });
      a.toast('Платёж пропущен', { label: 'Отменить', fn: () => a.store.mutate((x) => { const r = x.recurring.find((z) => z.id === id); if (r) r.lastRun = prev; }) });
    }));
  },
};
