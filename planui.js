// Общие кусочки интерфейса для бюджетов, целей и регулярных платежей: шторка, кольцо, полоса, чипы.
import { registerIcons } from './icons.js';
import { ic, av, esc, nameOf, money as fm, $, $$ } from './core.js';

registerIcons({
  check: 'M5 12.5l4.5 4.5L19 7.5',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6',
  pause: 'M9 5v14M15 5v14',
  play: 'M8 5l11 7-11 7z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 12h.01',
  repeat: 'M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3',
  gauge: 'M4 18a8 8 0 1 1 16 0M12 18l4-6M8 18h.01M16 18h.01',
});

/** Открыть шторку (общий контейнер #sheet из index.html). Возвращает { el, close }. */
export function openSheet(inner, { onClose } = {}) {
  const sheet = $('#sheet');
  sheet.hidden = false;
  sheet.innerHTML = `<div class="sheet tall" role="dialog" aria-modal="true"><div class="grab"></div>${inner}</div>`;
  const close = () => { sheet.hidden = true; sheet.innerHTML = ''; sheet.onclick = null; onClose && onClose(); };
  sheet.onclick = (e) => { if (e.target === sheet) close(); };
  return { el: $('.sheet', sheet), close };
}

/** Группа чипов. items: [[value, html]]; рендерится как .chips, клики вешает bindChips. */
export const chips = (name, items, cur, cls = () => '') =>
  `<div class="chips" data-chips="${name}">${items.map(([v, l]) => `<button type="button" data-v="${esc(v)}" class="chip ${cls(v)} ${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
export const personChips = (name, cur) => chips(name, ['max', 'dinara'].map((p) => [p, `${av(p, 'sm')}${esc(nameOf(p))}`]), cur, (v) => v);
export function bindChips(root, fn) {
  $$('[data-chips]', root).forEach((box) => $$('[data-v]', box).forEach((b) => (b.onclick = () => fn(box.dataset.chips, b.dataset.v))));
}

/** Поле суммы крупными цифрами. */
export const amountField = (id, value, cur) => `<div class="card amount"><input id="${id}" inputmode="decimal" placeholder="0" value="${esc(value)}" aria-label="Сумма"><span>${esc(cur)}</span></div>`;
export const kopToInput = (k) => (k ? String(k / 100).replace('.', ',') : '');

/** Кольцо прогресса. pct 0..1, inner — содержимое по центру. Цвет — через .lvl-* (--rc). */
export function ring(pct, size, stroke, inner = '') {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, o = c * (1 - Math.max(0, Math.min(1, pct)));
  const m = size / 2;
  return `<span class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle class="rt" cx="${m}" cy="${m}" r="${r}" stroke-width="${stroke}"/><circle class="rf" cx="${m}" cy="${m}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${o.toFixed(2)}" transform="rotate(-90 ${m} ${m})"/></svg><span class="rin">${inner}</span></span>`;
}

/** Горизонтальная полоса прогресса. */
export const pbar = (pct) => `<div class="pbar"><i style="width:${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%"></i></div>`;

/** Подпись под бюджетной полосой: «осталось X» / «перерасход X». */
export const budgetCaption = (st) => (st.left >= 0 ? `осталось ${fm(st.left)}` : `перерасход ${fm(-st.left)}`);

/** Привязка ссылок вида data-plan-go="budgets". */
export function bindGo(root, a) {
  $$('[data-plan-go]', root).forEach((b) => (b.onclick = () => a.go(b.dataset.planGo)));
}

export const dateRu = (s, gen) => `${+s.slice(8, 10)} ${gen[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`;
