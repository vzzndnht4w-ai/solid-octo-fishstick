import { subHeader, ic, esc, nameOf, monthLabel, MONTHS_GEN, $, $$ } from '../core.js';
import { registerIcons } from '../icons.js';
import { toCsv, parseBackup, dataSummary, backupFilename, csvFilename } from '../lib/exporter.js';

registerIcons({
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  copy: 'M9 9h10v11H9zM5 15V4h10',
});

// Состояние экрана (на время работы приложения).
const ui = { scope: 'all', out: null, restoreText: '', pending: null, err: '', del: 0 };

const dateRu = (d) => `${+d.slice(8, 10)} ${MONTHS_GEN[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
const plural = (n, a, b, c) => { const m = n % 100, d = n % 10; return m > 10 && m < 15 ? c : d === 1 ? a : d > 1 && d < 5 ? b : c; };
const countText = (n) => `${n} ${plural(n, 'операция', 'операции', 'операций')}`;
const periodText = (sm) => (sm.count ? `с ${dateRu(sm.from)} по ${dateRu(sm.to)}` : 'пока пусто');

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = $('#outText'); if (!ta) return false;
  ta.focus(); ta.select();
  try { return document.execCommand('copy'); } catch { return false; }
}

/** Отдать файл через системное меню «Поделиться». true — получилось (или пользователь закрыл меню). */
async function shareFile(name, mime, text, title) {
  try {
    const file = new File([text], name, { type: mime });
    if (!navigator.canShare || !navigator.canShare({ files: [file] })) return false;
    await navigator.share({ files: [file], title });
    return true;
  } catch (e) { return e && e.name === 'AbortError'; }
}

export default {
  render(s, a) {
    const sm = dataSummary(s.txs);
    const monthCount = s.txs.filter((t) => t.date.startsWith(a.month)).length;
    const seg = (v, l) => `<button data-scope="${v}" class="${ui.scope === v ? 'on' : ''}" aria-pressed="${ui.scope === v}">${l}</button>`;
    const out = ui.out ? `<div class="dout"><div class="row sm"><b>${esc(ui.out.title)}</b><span class="muted">${ui.out.hint}</span></div>
      <textarea id="outText" readonly rows="6" aria-label="${esc(ui.out.title)}">${esc(ui.out.text)}</textarea>
      <div class="dbtns"><button class="primary sm-btn" data-d="copy">${ic('copy')} Скопировать</button><button class="ghost" data-d="closeOut" style="width:auto">Закрыть</button></div></div>` : '';

    let restore;
    if (ui.pending) {
      const p = ui.pending, cur = sm;
      restore = `<div class="dwarn"><b>Заменить данные этой копией?</b>
        <div class="dcmp"><div><span class="muted sm">В копии</span><b>${countText(p.sum.count)}</b><span class="muted sm">${periodText(p.sum)}</span></div>
        <div><span class="muted sm">Сейчас в приложении</span><b>${countText(cur.count)}</b><span class="muted sm">${periodText(cur)}</span></div></div>
        <p class="muted sm">Все текущие операции, цели, бюджеты и настройки будут заменены данными из копии. Это нельзя отменить, поэтому сначала можно сохранить текущую копию выше.</p>
        <div class="dbtns"><button class="ghost" data-d="restoreCancel" style="width:auto">Отмена</button><button class="primary danger-btn" data-d="restoreGo">Заменить данные</button></div></div>`;
    } else {
      restore = `<textarea id="rText" rows="4" placeholder="Вставьте сюда текст резервной копии" aria-label="Текст резервной копии">${esc(ui.restoreText)}</textarea>
        ${ui.err ? `<div class="error" role="alert">${esc(ui.err)}</div>` : ''}
        <div class="dbtns"><button class="ghost" data-d="restoreText" style="width:auto">Проверить текст</button>
        <label class="ghost filebtn">${ic('upload')} Выбрать файл<input type="file" id="rFile" accept=".json,application/json,text/plain" hidden></label></div>`;
    }

    let danger;
    if (ui.del === 0) danger = `<button class="ghost danger" data-d="del1" ${sm.count ? '' : 'disabled'}>${ic('trash')} Удалить все операции</button>`;
    else if (ui.del === 1) danger = `<div class="dwarn"><b>Удалить все операции?</b><p class="muted sm">Будет удалено: ${countText(sm.count)}. Цели, бюджеты и профили останутся. Лучше сначала сохранить резервную копию.</p>
      <div class="dbtns"><button class="ghost" data-d="delCancel" style="width:auto">Нет, оставить</button><button class="ghost danger" data-d="del2" style="width:auto">Да, продолжить</button></div></div>`;
    else danger = `<div class="dwarn strong"><b>Последний шаг</b><p class="sm">Вы точно хотите навсегда удалить ${countText(sm.count)}? После этого вернуть их можно будет только в течение нескольких секунд — по кнопке «Вернуть» внизу экрана.</p>
      <div class="dbtns"><button class="ghost" data-d="delCancel" style="width:auto">Отмена</button><button class="primary danger-btn" data-d="delGo">Удалить навсегда</button></div></div>`;

    return `${subHeader('Данные')}<div class="stack">
      <div class="card dsum"><div><div class="muted sm">Операций</div><b>${sm.count}</b></div><div><div class="muted sm">Период</div><b class="per">${sm.count ? `${dateRu(sm.from)} —<br>${dateRu(sm.to)}` : '—'}</b></div></div>
      <div class="card"><b>Экспорт в таблицу (CSV)</b><p class="muted sm">Открывается в Excel и Numbers. Скрытые траты партнёра в файл попадают без деталей.</p>
        <div class="seg" role="group">${seg('all', `Все операции`)}${seg('month', esc(monthLabel(a.month)))}</div>
        <button class="primary sm-btn" data-d="csv" ${(ui.scope === 'month' ? monthCount : sm.count) ? '' : 'disabled'}>${ic('download')} Экспортировать${ui.scope === 'month' ? ` (${monthCount})` : ` (${sm.count})`}</button></div>
      <div class="card"><b>Резервная копия</b><p class="muted sm">Всё содержимое приложения одним файлом: операции, цели, бюджеты, настройки.</p>
        <div class="dbtns"><button class="primary sm-btn" data-d="backup">${ic('download')} Сохранить</button><button class="ghost" data-d="backupText" style="width:auto">${ic('copy')} Как текст</button></div></div>
      ${out}
      <div class="card"><b>Восстановить из копии</b><p class="muted sm">Выберите файл или вставьте текст копии. Перед заменой данных мы покажем, что именно изменится.</p>${restore}</div>
      <div class="card"><b>Опасная зона</b>${danger}</div></div>`;
  },

  bind(root, s, a) {
    const redo = () => a.render();
    const viewer = s.viewer, names = { max: nameOf('max'), dinara: nameOf('dinara') };
    const rText = $('#rText', root);
    if (rText) rText.oninput = () => { ui.restoreText = rText.value; ui.err = ''; };
    $$('[data-scope]', root).forEach((b) => (b.onclick = () => { ui.scope = b.dataset.scope; redo(); }));

    const showText = (title, text, hint) => { ui.out = { title, text, hint }; redo(); };
    const actions = {
      async csv() {
        const ym = ui.scope === 'month' ? a.month : null, text = toCsv(s.txs, { viewer, ym, names });
        if (await shareFile(csvFilename(a.today(), ym), 'text/csv', text, 'Операции — «Мы»')) return;
        showText('CSV', text, 'Скопируйте и вставьте в таблицу или заметку');
      },
      async backup() {
        const text = JSON.stringify(a.store.get(), null, 1);
        if (await shareFile(backupFilename(a.today()), 'application/json', text, 'Резервная копия — «Мы»')) return;
        showText('Резервная копия', text, 'Сохраните этот текст в надёжном месте');
      },
      backupText() { showText('Резервная копия', JSON.stringify(a.store.get(), null, 1), 'Сохраните этот текст в надёжном месте'); },
      async copy() { a.toast((await copyText(ui.out.text)) ? 'Скопировано' : 'Не удалось скопировать — выделите текст вручную'); },
      closeOut() { ui.out = null; redo(); },
      restoreText() {
        try { ui.pending = { data: parseBackup(ui.restoreText), raw: ui.restoreText }; ui.pending.sum = dataSummary(ui.pending.data.txs); ui.err = ''; } catch (e) { ui.err = e.message; }
        redo();
      },
      restoreCancel() { ui.pending = null; redo(); },
      restoreGo() {
        const keep = a.store.get().viewer;
        try { a.store.importJson(ui.pending.raw); } catch { ui.err = 'Не удалось восстановить данные.'; ui.pending = null; redo(); return; }
        if (!a.store.get().viewer && keep) a.store.setViewer(keep);
        ui.pending = null; ui.restoreText = ''; ui.err = '';
        a.toast('Данные восстановлены из копии');
      },
      del1() { ui.del = 1; redo(); },
      del2() { ui.del = 2; redo(); },
      delCancel() { ui.del = 0; redo(); },
      delGo() {
        const old = [...a.store.get().txs];
        ui.del = 0;
        a.store.mutate((st) => { st.txs = []; });
        a.toast('Все операции удалены', { label: 'Вернуть', fn: () => a.store.mutate((st) => { if (!st.txs.length) st.txs = old; }) });
      },
    };
    $$('[data-d]', root).forEach((b) => (b.onclick = () => actions[b.dataset.d]?.()));

    const file = $('#rFile', root);
    if (file) file.onchange = async () => {
      const f = file.files[0]; if (!f) return;
      try { ui.restoreText = await f.text(); actions.restoreText(); } catch { ui.err = 'Не удалось прочитать файл.'; redo(); }
    };
  },
};
