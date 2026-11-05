import { esc, ic, subHeader, $, $$ } from '../core.js';
import { registerIcons } from '../icons.js';
import { newCode, parseInvite, normUrl } from '../lib/sync-core.js';
import { SQL } from '../lib/sync-sql.js';
import * as sync from '../lib/sync.js';
import { store } from '../store.js';

registerIcons({ cloud: 'M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 0 9.5z', link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1', copy: 'M9 9h10v11H9zM5 15V4h10' });

const ui = { url: '', key: '', invite: '', err: '', busy: false, reveal: false, confirmOff: false, mode: 'replace' };

const ago = (t) => {
  if (!t) return 'ещё не было';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'только что' : m < 60 ? `${m} мин назад` : m < 1440 ? `${Math.round(m / 60)} ч назад` : `${Math.round(m / 1440)} дн назад`;
};

async function copy(text, a, msg = 'Скопировано') {
  try { await navigator.clipboard.writeText(text); a.toast(msg); }
  catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); a.toast(msg); } catch { a.toast('Не удалось скопировать'); } ta.remove(); }
}

const stateLine = (st) => ({
  syncing: ['Синхронизируем…', 'sync-busy'], idle: [`Синхронизировано ${ago(st.last)}`, 'sync-ok'],
  error: [st.err || 'Ошибка синхронизации', 'sync-bad'], offline: [st.err || 'Нет сети', 'sync-warn'],
}[st.state] || ['Не подключено', 'sync-off']);

function renderConnected(s) {
  const st = sync.getStatus(), [line, cls] = stateLine(st);
  const link = sync.inviteLink(), code = sync.getCode();
  return `${subHeader('Синхронизация')}<div class="stack">
    <div class="card sync-status ${cls}" role="status"><span class="sync-dot" aria-hidden="true"></span><div><b>${esc(line)}</b><div class="muted sm">Данные шифруются на телефоне, сервер видит только шифротекст</div></div></div>
    <button class="primary" id="sy-now" style="margin-top:0" ${st.state === 'syncing' ? 'disabled' : ''}>Синхронизировать сейчас</button>
    <h2>Подключить второй телефон</h2>
    <div class="card"><p style="margin:0 0 10px">Отправьте ссылку партнёру в личном сообщении. На его телефоне сначала добавьте приложение на экран «Домой», откройте его, затем «Ещё → Синхронизация → Присоединиться» и вставьте ссылку.</p>
      <button class="ghost" id="sy-copy-link">${ic('link')} Скопировать ссылку-приглашение</button>
      ${navigator.share ? `<button class="ghost" id="sy-share" style="margin-top:8px">${ic('arrow')} Отправить…</button>` : ''}
      <p class="muted sm" style="margin:10px 0 0">Ссылка содержит ключ к вашим данным. Не публикуйте её.</p></div>
    <div class="card"><div class="row"><span><b>Код пары</b><br><span class="muted sm">Нужен только если потеряете ссылку</span></span><button class="chip" id="sy-reveal">${ui.reveal ? 'Скрыть' : 'Показать'}</button></div>
      ${ui.reveal ? `<div class="sync-code" id="sy-code">${esc(code)}</div><button class="ghost" id="sy-copy-code" style="margin-top:8px">${ic('copy')} Скопировать код</button>` : ''}</div>
    <h2>Отключение</h2>
    ${ui.confirmOff
      ? `<div class="card"><p style="margin:0 0 10px">Этот телефон перестанет получать и отправлять данные. Операции на нём останутся, у партнёра тоже.</p><div class="opts"><button class="opt" id="sy-off-no"><b>Отмена</b></button><button class="opt" id="sy-off-yes" style="color:var(--neg)"><b>Отключить</b></button></div></div>`
      : `<button class="ghost danger" id="sy-off">Отключить на этом телефоне</button>`}
  </div>`;
}

function renderSetup(s) {
  const invite = sync.peekPendingInvite() || (ui.invite ? parseInvite(ui.invite) : null);
  const have = s.txs.length;
  const joinBlock = invite ? `<div class="card sync-join"><b>Приглашение распознано</b><p class="muted sm" style="margin:4px 0 12px">На этом телефоне ${have ? `есть ${have} операций.` : 'пока нет операций.'} Что сделать с ними?</p>
      <div class="opts"><button class="opt ${ui.mode === 'replace' ? 'on' : ''}" data-mode="replace" aria-pressed="${ui.mode === 'replace'}"><b>Взять данные пары</b><small>${have ? 'Ваши операции на этом телефоне удалятся.' : 'Подходит для нового телефона.'}</small></button>
      <button class="opt ${ui.mode === 'merge' ? 'on' : ''}" data-mode="merge" aria-pressed="${ui.mode === 'merge'}"><b>Объединить</b><small>Ваши операции добавятся к общим.</small></button></div>
      <button class="primary" id="sy-join" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Подключаем…' : 'Присоединиться'}</button></div>` : '';
  return `${subHeader('Синхронизация')}<div class="stack">
    <div class="card"><div class="row" style="justify-content:flex-start;gap:12px"><span class="tile" style="--h:#7b6cf0">${ic('cloud')}</span><div><b>Общие данные на двух телефонах</b><div class="muted sm">Операции, цели и бюджеты появляются у вас обоих. Всё шифруется на телефоне.</div></div></div></div>
    ${ui.err ? `<div class="error" role="alert">${esc(ui.err)}</div>` : ''}
    ${joinBlock}
    <h2>Первый телефон: создать пару</h2>
    <div class="card"><p class="muted sm" style="margin:0 0 10px">Нужен бесплатный проект на supabase.com. Пошаговая инструкция с картинками есть в вашем чате с Claude. Таблицу создаёт этот SQL:</p>
      <button class="ghost" id="sy-sql">${ic('copy')} Скопировать SQL</button>
      <label class="l" for="sy-url">Адрес проекта (Project URL)</label><input id="sy-url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="https://abcd.supabase.co" value="${esc(ui.url)}">
      <label class="l" for="sy-key">Ключ anon public</label><input id="sy-key" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="eyJhbGciOi…" value="${esc(ui.key)}">
      <button class="primary" id="sy-create" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Проверяем…' : 'Создать пару'}</button></div>
    <h2>Второй телефон: присоединиться</h2>
    <div class="card"><label class="l" for="sy-inv" style="margin-top:0">Ссылка-приглашение</label><textarea id="sy-inv" rows="3" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Вставьте ссылку, которую прислал партнёр">${esc(ui.invite)}</textarea>
      <button class="ghost" id="sy-paste" style="margin-top:8px">Проверить ссылку</button></div>
  </div>`;
}

export default {
  render(s) { return sync.isConnected() ? renderConnected(s) : renderSetup(s); },
  leave() { ui.err = ''; ui.reveal = false; ui.confirmOff = false; },
  bind(root, s, a) {
    const run = async (fn) => { ui.busy = true; ui.err = ''; a.render(); try { await fn(); } catch (e) { ui.err = e.message || 'Не получилось'; } ui.busy = false; a.render(); };
    const read = () => { ui.url = $('#sy-url', root)?.value ?? ui.url; ui.key = $('#sy-key', root)?.value ?? ui.key; ui.invite = $('#sy-inv', root)?.value ?? ui.invite; };
    if (sync.isConnected()) {
      $('#sy-now', root).onclick = () => sync.syncNow();
      $('#sy-copy-link', root).onclick = () => copy(sync.inviteLink(), a, 'Ссылка скопирована');
      const sh = $('#sy-share', root); if (sh) sh.onclick = () => navigator.share({ title: 'Мы — деньги вдвоём', text: 'Присоединяйся к нашим общим финансам', url: sync.inviteLink() }).catch(() => {});
      $('#sy-reveal', root).onclick = () => { ui.reveal = !ui.reveal; a.render(); };
      const cc = $('#sy-copy-code', root); if (cc) cc.onclick = () => copy(sync.getCode(), a, 'Код скопирован');
      const off = $('#sy-off', root); if (off) off.onclick = () => { ui.confirmOff = true; a.render(); };
      const no = $('#sy-off-no', root); if (no) no.onclick = () => { ui.confirmOff = false; a.render(); };
      const yes = $('#sy-off-yes', root); if (yes) yes.onclick = () => { ui.confirmOff = false; sync.disconnect(); a.toast('Синхронизация отключена'); a.render(); };
      return;
    }
    $('#sy-sql', root).onclick = () => copy(SQL, a, 'SQL скопирован: вставьте его в Supabase');
    $('#sy-create', root).onclick = () => { read(); run(async () => {
      if (!ui.url.trim() || !ui.key.trim()) throw new Error('Заполните адрес проекта и ключ');
      const cfg = { url: normUrl(ui.url), key: ui.key.trim(), code: newCode() };
      const bad = await sync.check(cfg); if (bad) throw new Error(bad);
      await sync.connect(cfg, 'create'); a.toast('Пара создана. Теперь пригласите партнёра');
    }); };
    $('#sy-paste', root).onclick = () => { read(); if (!parseInvite(ui.invite)) { ui.err = 'Не получилось прочитать ссылку. Скопируйте её целиком'; } else ui.err = ''; a.render(); };
    $$('[data-mode]', root).forEach((b) => (b.onclick = () => { read(); ui.mode = b.dataset.mode; a.render(); }));
    const j = $('#sy-join', root);
    if (j) j.onclick = () => run(async () => {
      const inv = sync.takePendingInvite() || parseInvite(ui.invite); if (!inv) throw new Error('Ссылка не распознана');
      const bad = await sync.check(inv); if (bad) throw new Error(bad);
      await sync.connect(inv, ui.mode); ui.invite = ''; a.toast('Подключено');
    });
  },
};
