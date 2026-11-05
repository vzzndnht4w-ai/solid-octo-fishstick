// Мелкие HTML-компоненты для «Профиля», «Настройки» и знакомства (стили — css/settings.css).
import { esc, ic } from '../core.js';
import './profile-icons.js';

/** Сегментный переключатель. items: [[value, label], …]. Кнопки помечены data-seg=name. */
export const seg = (name, items, cur, label) => `<div class="seg s-seg" role="group" aria-label="${esc(label)}">${items.map(([v, l]) =>
  `<button type="button" data-seg="${name}" data-v="${esc(v)}" data-fk="${name}-${esc(v)}" aria-pressed="${String(cur) === String(v)}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;

/** Группа настроек: заголовок + карточка со строками. */
export const group = (title, rows, note = '') =>
  `<section class="grp">${title ? `<h2>${esc(title)}</h2>` : ''}<div class="glist">${rows}</div>${note ? `<p class="gnote">${note}</p>` : ''}</section>`;

/** Строка: плитка-иконка, подпись, значение справа. tag — 'button' для нажимаемой. */
export const row = ({ icon, hue = 'var(--accent)', label, sub = '', value = '', go = '', fk = '', danger = false, tag = go ? 'button' : 'div', extra = '' }) =>
  `<${tag} class="srow${danger ? ' danger' : ''}"${tag === 'button' ? ` type="button" data-go="${esc(go)}"` : ''}${fk ? ` data-fk="${esc(fk)}"` : ''}${extra}>${icon ? `<span class="tile sm" style="--h:${hue}">${ic(icon)}</span>` : ''}<span class="lbl"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${value ? `<span class="val">${esc(value)}</span>` : ''}${go ? `<span class="chev">${ic('right')}</span>` : ''}</${tag}>`;

/** Строка с элементом управления под подписью. */
export const ctl = ({ icon, hue, label, sub = '', control }) =>
  `<div class="srow col"><div class="top2">${icon ? `<span class="tile sm" style="--h:${hue || 'var(--accent)'}">${ic(icon)}</span>` : ''}<span class="lbl"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></div>${control}</div>`;
