// Интерфейс реакций и комментариев к операциям: блок в шторке, бейдж в ленте. Общие иконки «про нас двоих».
import { registerIcons } from '../icons.js';
import { ic, esc, nameOf, $, $$ } from '../core.js';
import { other } from '../ledger.js';
import { store } from '../store.js';
import { REACTIONS, REACTION_LABEL, commentOf, applyComment } from './together.js';

registerIcons({
  chat: 'M4 5h16v11H9.5L5 20v-4H4z',
  scale: 'M12 4v16M7 20h10M4 7l8-3 8 3M4 7l-2.5 6a3.2 3.2 0 0 0 5 0zM20 7l-2.5 6a3.2 3.2 0 0 0 5 0z',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
  note: 'M5 4h14v16H5zM8.5 9h7M8.5 13h7M8.5 17h4',
});

/** Скрытые чужие операции комментировать нельзя. */
export const canComment = (t, viewer) => !t.hidden || t.person === viewer;

const plural = (n, a, b, c) => { const m = n % 100, d = n % 10; return m > 10 && m < 15 ? c : d === 1 ? a : d > 1 && d < 5 ? b : c; };
export { plural };

/** Маленький бейдж в строке ленты: реакция/комментарий партнёра. */
export function txBadge(s, t) {
  if (!s.viewer || !canComment(t, s.viewer)) return '';
  const p = other(s.viewer), c = commentOf(s.comments, t.id, p);
  if (!c || (!c.emoji && !c.text)) return '';
  const label = `${nameOf(p)}: ${c.emoji ? REACTION_LABEL[c.emoji] || 'реакция' : ''}${c.emoji && c.text ? ', ' : ''}${c.text ? `«${c.text}»` : ''}`;
  return `<span class="tg-badge ${p}" title="${esc(label)}">${c.emoji ? `<span aria-hidden="true">${esc(c.emoji)}</span>` : ''}${c.text ? ic('chat') : ''}<span class="tg-sr">${esc(label)}</span></span>`;
}

const boxHtml = (s, t, note = '') => {
  const me = s.viewer, p = other(me), mine = commentOf(s.comments, t.id, me), theirs = commentOf(s.comments, t.id, p);
  const bubble = theirs && (theirs.emoji || theirs.text)
    ? `<div class="tg-bubble ${p}"><b>${esc(nameOf(p))}</b>${theirs.emoji ? `<span class="tg-em" aria-label="${esc(REACTION_LABEL[theirs.emoji] || '')}">${esc(theirs.emoji)}</span>` : ''}${theirs.text ? `<span>${esc(theirs.text)}</span>` : ''}</div>` : '';
  const btns = REACTIONS.map((e) => `<button type="button" class="tg-r ${mine?.emoji === e ? 'on' : ''}" data-tg-r="${e}" aria-pressed="${mine?.emoji === e}" aria-label="${esc(REACTION_LABEL[e])}"><span aria-hidden="true">${e}</span></button>`).join('');
  return `${bubble}<div class="tg-react" role="group" aria-label="Ваша реакция">${btns}</div>
    <form class="tg-form"><label class="tg-sr" for="tg-text">Комментарий к операции</label><input id="tg-text" maxlength="280" autocomplete="off" placeholder="Короткий комментарий" value="${esc(mine?.text || '')}"><button type="submit" class="tg-send">${mine?.text ? 'Сохранить' : 'Отправить'}</button></form>
    <div class="tg-live" role="status">${esc(note)}</div>`;
};

/** Блок для шторки операции (вставляется в app.js). Пусто, если комментировать нельзя. */
export const sheetBlock = (s, t) => (s.viewer && canComment(t, s.viewer) ? `<section class="tg-box" aria-label="Реакции и комментарии" data-tg-box>${boxHtml(s, t)}</section>` : '');

/** Привязка блока в шторке. */
export function bindSheetBlock(sheetEl, t) {
  const box = $('[data-tg-box]', sheetEl);
  if (!box) return;
  const draw = (note, focusEmoji) => {
    box.innerHTML = boxHtml(store.get(), t, note);
    wire();
    if (focusEmoji) $(`[data-tg-r="${focusEmoji}"]`, box)?.focus({ preventScroll: true });
  };
  const save = (patch) => store.mutate((st) => applyComment(st.comments, { txId: t.id, person: st.viewer, at: Date.now(), ...patch }));
  const wire = () => {
    $$('[data-tg-r]', box).forEach((b) => (b.onclick = () => { save({ emoji: b.dataset.tgR }); draw('Реакция сохранена', b.dataset.tgR); }));
    const f = $('form', box);
    f.onsubmit = (e) => {
      e.preventDefault();
      const v = $('#tg-text', box).value.trim(), had = commentOf(store.get().comments, t.id, store.get().viewer)?.text || '';
      if (v === had) return;
      save({ text: v });
      draw(v ? 'Комментарий сохранён' : 'Комментарий удалён');
      $('#tg-text', box)?.focus({ preventScroll: true });
    };
  };
  wire();
}
