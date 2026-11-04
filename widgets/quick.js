// Виджет «Быстро добавить»: до 4 шаблонов в одно касание. Долгое нажатие или «…» — открыть форму с заготовкой.
import { ic, esc, tile, money as fm, $$ } from '../core.js';
import { startWith } from '../screens/add.js';
import { suggestTemplates } from '../lib/tools.js';
import { quickAdd, draftFromTemplate } from '../lib/tools-ui.js';

const LONG_MS = 550;
const sign = (t) => (t.type === 'income' ? '+' : '');

export default {
  id: 'quick',
  render(s, a) {
    const list = s.templates.filter((x) => x && x.tpl && x.title).slice(0, 4);
    if (!list.length) {
      const sug = suggestTemplates(s.txs, a.today(), s.templates, s.viewer)[0];
      if (!sug) return '';
      return `<section class="card wquick"><div class="row whead"><b>${ic('qbolt')} Быстро добавить</b><button class="linkbtn" data-q-go>Шаблоны ${ic('right')}</button></div>
        <p class="qhint">${esc(sug.category)} за ${fm(sug.amount)} — уже ${sug.count} раза за 3 месяца. Сделать шаблоном, чтобы добавлять в одно касание?</p></section>`;
    }
    const tiles = list.map((x) => {
      const t = x.tpl, amt = `${sign(t)}${fm(t.amount)}`;
      return `<div class="qt"><button type="button" class="qmain" data-qt="${esc(x.id)}" aria-label="Добавить сегодня: ${esc(x.title)}, ${esc(amt)}">${tile(t.category)}<span class="qtxt"><b>${esc(x.title)}</b><small>${esc(amt)}</small></span></button><button type="button" class="qmore" data-qm="${esc(x.id)}" aria-label="Открыть форму: ${esc(x.title)}">${ic('more')}</button></div>`;
    }).join('');
    return `<section class="card wquick"><div class="row whead"><b>${ic('qbolt')} Быстро добавить</b><button class="linkbtn" data-q-go>Все шаблоны ${ic('right')}</button></div><div class="qgrid">${tiles}</div><p class="qnote muted sm">Касание — добавить на сегодня. Долгое нажатие или «…» — открыть форму.</p></section>`;
  },
  bind(root, s, a) {
    const byId = (id) => s.templates.find((x) => x.id === id);
    const openForm = (item) => { startWith(draftFromTemplate(item, s.viewer), s); a.go('add', { keepDraft: true }); };
    $$('[data-q-go]', root).forEach((b) => (b.onclick = () => a.go('templates')));
    $$('[data-qm]', root).forEach((b) => (b.onclick = () => { const it = byId(b.dataset.qm); if (it) openForm(it); }));
    $$('[data-qt]', root).forEach((b) => {
      let timer = null, long = false;
      const stop = () => { clearTimeout(timer); timer = null; };
      b.addEventListener('pointerdown', () => { long = false; stop(); timer = setTimeout(() => { long = true; const it = byId(b.dataset.qt); if (it) openForm(it); }, LONG_MS); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, stop));
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      b.onclick = () => { if (long) { long = false; return; } const it = byId(b.dataset.qt); if (it) quickAdd(it, a); };
    });
  },
};
