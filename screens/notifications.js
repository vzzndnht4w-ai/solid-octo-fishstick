// Экран «Уведомления»: мастер включения push по шагам + настройки типов уведомлений.
import { esc, ic, subHeader, $, $$ } from '../core.js';
import { registerIcons } from '../icons.js';
import { generateVapidKeys, normPrefs } from '../lib/push-core.js';
import { PUSH_SQL, FUNCTION_CODE, buildCronSql } from '../lib/push-sql.js';
import * as push from '../lib/push.js';
import * as sync from '../lib/sync.js';

registerIcons({ bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4', copy: 'M9 9h10v11H9zM5 15V4h10', cloud: 'M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 0 9.5z' });

const DAYS = [[1, 'Понедельник'], [2, 'Вторник'], [3, 'Среда'], [4, 'Четверг'], [5, 'Пятница'], [6, 'Суббота'], [0, 'Воскресенье']];
const hours = (cur) => Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === cur ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');

const ui = { busy: '', err: '', ok: '', keys: null, sub: null, open: {}, confirmRekey: false, keyInput: '', keyErr: '', checked: false };

async function copy(text, a, msg = 'Скопировано') {
  try { await navigator.clipboard.writeText(text); a.toast(msg); }
  catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); a.toast(msg); } catch { a.toast('Не удалось скопировать'); } ta.remove(); }
}

const badge = (ok, okText = 'Готово', todoText = 'Нужно сделать') => `<span class="nf-state ${ok ? 'ok' : 'todo'}">${ok ? '✓ ' + okText : todoText}</span>`;
const step = (n, title, ok, body, opts = {}) => `<section class="card nf-step" aria-labelledby="nf-h${n}">
  <div class="nf-head"><span class="nf-num" aria-hidden="true">${n}</span><h3 id="nf-h${n}">${esc(title)}</h3>${badge(ok, opts.okText, opts.todoText)}</div>${body}</section>`;
const block = (id, title, hint, text, extra = '') => `<details class="nf-det" data-det="${id}"${ui.open[id] ? ' open' : ''}><summary>${esc(title)}</summary>
  <p class="muted sm">${hint}</p>${extra}<button class="ghost" data-copy="${id}">${ic('copy')} Скопировать</button>
  <pre class="nf-code" tabindex="0" aria-label="${esc(title)}">${esc(text)}</pre></details>`;
const toggle = (key, label, sub, on) => `<label class="switch nf-sw"><span><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><input type="checkbox" role="switch" data-sw="${key}" data-fk="nf-sw-${key}" ${on ? 'checked' : ''}></label>`;

function stepDevice() {
  const sup = push.isSupported(), sa = push.isStandalone(), ios = push.isIOS();
  const ok = sup && (sa || !ios);
  let body;
  if (ok) body = `<p class="nf-p">Всё в порядке: это приложение умеет получать уведомления.</p>`;
  else if (ios && !sa) body = `<p class="nf-p">На iPhone уведомления работают только у приложения на экране «Домой» (iOS 16.4 или новее). Сейчас «Мы» открыто в обычном Safari.</p>
    <ol class="nf-ol"><li>Откройте этот сайт в Safari.</li><li>Нажмите кнопку «Поделиться» (квадрат со стрелкой) внизу.</li><li>Выберите «На экран “Домой”» и подтвердите.</li><li>Закройте Safari и откройте «Мы» с экрана «Домой». Затем вернитесь сюда.</li></ol>`;
  else body = `<p class="nf-p">Этот браузер не поддерживает уведомления. Нужен iPhone с iOS 16.4 или новее: обновите iOS в Настройки → Основные → Обновление ПО.</p>`;
  return step(1, 'iPhone и экран «Домой»', ok, body, { todoText: 'Нужно исправить' });
}

function stepServer() {
  const connected = sync.isConnected(), cfg = sync.getCfg(), pub = push.getVapidPublic();
  const ok = connected && !!pub;
  if (!connected) return step(2, 'Серверная часть', false, `<p class="nf-p">Уведомления идут через ваш бесплатный проект Supabase, тот же, что и для синхронизации. Сначала подключите синхронизацию.</p><button class="primary nf-btn" id="nf-gosync">Открыть «Синхронизацию»</button>`);
  const keyBlock = ui.keys
    ? `<div class="nf-keys" role="group" aria-label="Новые ключи"><p class="nf-p"><b>Приватный ключ. Показывается один раз.</b> Скопируйте его и вставьте в Supabase → Edge Functions → Secrets как <code>VAPID_PRIVATE_KEY</code>. Потом сохранить его будет негде, но можно создать новые ключи.</p>
      <label class="l" for="nf-priv">Приватный ключ</label><input id="nf-priv" readonly value="${esc(ui.keys.privateKey)}"><button class="ghost" id="nf-copy-priv">${ic('copy')} Скопировать приватный ключ</button></div>`
    : '';
  const keyCreate = pub
    ? `<p class="nf-p">Ключи созданы. Публичный ключ сохранён на этом телефоне и передаётся партнёру в ссылке-приглашении.</p>
       ${ui.confirmRekey ? `<div class="opts"><button class="opt" id="nf-rekey-no"><b>Отмена</b></button><button class="opt" id="nf-rekey-yes" style="color:var(--neg)"><b>Создать заново</b></button></div><p class="muted sm">Старые ключи перестанут работать: уведомления придётся включить заново на обоих телефонах.</p>` : `<button class="ghost" id="nf-rekey">Создать новые ключи</button>`}`
    : `<p class="nf-p">Ключи нужны, чтобы сервер мог отправлять вам уведомления. Они создаются прямо на телефоне.</p>
       <button class="primary nf-btn" id="nf-keys" ${ui.busy === 'keys' ? 'disabled' : ''}>Создать ключи уведомлений</button>
       <details class="nf-det"><summary>У партнёра уже есть ключи</summary><p class="muted sm">Попросите прислать публичный ключ или откройте новую ссылку-приглашение. Вставьте публичный ключ сюда:</p>
       <label class="l" for="nf-pubin">Публичный ключ</label><input id="nf-pubin" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(ui.keyInput)}" ${ui.keyErr ? 'aria-invalid="true" aria-describedby="nf-keyerr"' : ''}>
       ${ui.keyErr ? `<div class="error" id="nf-keyerr" role="alert">${esc(ui.keyErr)}</div>` : ''}<button class="ghost" id="nf-savepub" style="margin-top:8px">Сохранить ключ</button></details>`;
  const server = pub ? `
    <h4 class="nf-sub">Настройка сервера (один раз на пару)</h4>
    <p class="muted sm">Если это делал партнёр, повторять не нужно: переходите к шагу 3. Действия выполняются на сайте supabase.com, в вашем проекте. Подробнее: docs/PUSH-SETUP.md.</p>
    ${block('sql', 'А. Таблицы (SQL)', 'Supabase → SQL Editor → New query → вставьте → Run.', PUSH_SQL)}
    ${block('fn', 'Б. Код функции we-push', 'Supabase → Edge Functions → Deploy a new function → Via Editor. Назовите функцию <b>we-push</b>, вставьте код, <b>выключите «Verify JWT»</b> и нажмите Deploy.', FUNCTION_CODE)}
    ${block('sec', 'В. Секреты', 'Supabase → Edge Functions → Secrets. Добавьте три секрета:', `VAPID_PUBLIC_KEY=${pub}\nVAPID_PRIVATE_KEY=<приватный ключ из шага «Создать ключи»>\nVAPID_SUBJECT=mailto:ваш-адрес@почта.ру`, '')}
    ${block('cron', 'Г. Таймер раз в минуту (SQL)', 'Сначала включите Database → Extensions → pg_cron и pg_net. Затем SQL Editor → вставьте → Run. Адрес и ключ вашего проекта уже подставлены.', buildCronSql(cfg.url, cfg.key))}` : '';
  return step(2, 'Серверная часть', ok, `${keyCreate}${keyBlock}${server}`, { okText: 'Ключи есть' });
}

function stepEnable(p, ready) {
  const on = p.enabled && ui.sub === true && push.permission() === 'granted';
  let body;
  if (!ready) body = `<p class="nf-p muted">Станет доступно после шагов 1 и 2.</p>`;
  else if (push.permission() === 'denied') body = `<p class="nf-p">Уведомления для «Мы» запрещены в iPhone. Откройте Настройки → Уведомления → Мы и включите «Допуск уведомлений», затем вернитесь сюда.</p>`;
  else if (on) body = `<p class="nf-p">Этот телефон подписан на уведомления.</p>`;
  else body = `<p class="nf-p">iPhone спросит разрешение. Нажмите «Разрешить».</p><button class="primary nf-btn" id="nf-enable" ${ui.busy === 'enable' ? 'disabled' : ''}>${ui.busy === 'enable' ? 'Включаем…' : 'Включить уведомления на этом телефоне'}</button>`;
  return step(3, 'Включить на этом телефоне', on, body, { okText: 'Включено' });
}

function stepTest(p, on) {
  const body = !on ? `<p class="nf-p muted">Станет доступно после шага 3.</p>`
    : `<p class="nf-p">Сервер отправит уведомление на этот телефон. Оно может прийти через несколько секунд.</p><button class="ghost nf-btn" id="nf-test" ${ui.busy === 'test' ? 'disabled' : ''}>${ui.busy === 'test' ? 'Отправляем…' : 'Отправить тестовое уведомление'}</button>`;
  return step(4, 'Проверка', ui.ok === 'test', body, { okText: 'Дошло', todoText: 'Не проверено' });
}

function settings(p) {
  return `<h2>Что присылать</h2><div class="card nf-set">
    ${toggle('partnerAdds', 'Партнёр добавил операцию', 'Без суммы и названия', p.partnerAdds)}
    ${toggle('partnerReacts', 'Реакции и комментарии', 'Когда партнёр отреагировал на операцию', p.partnerReacts)}
    ${toggle('payments', 'Регулярные платежи', 'За день до и в день платежа', p.payments)}
    ${toggle('debt', 'Долг висит давно', 'Раз в неделю, если долг больше 1000 ₽ и ему больше 14 дней', p.debt)}
    ${toggle('date', 'Финансовое свидание', 'Раз в неделю', p.date.on)}
    <div class="nf-pick"><div><label for="nf-dow">День</label><select id="nf-dow" data-sel="dow" data-fk="nf-sel-dow">${DAYS.map(([v, l]) => `<option value="${v}"${v === p.date.dow ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label for="nf-dhour">Время</label><select id="nf-dhour" data-sel="dhour" data-fk="nf-sel-dhour">${hours(p.date.hour)}</select></div></div>
    ${toggle('evening', 'Вечером записать траты', 'Если за день нет ни одной операции', p.evening.on)}
    ${p.evening.on ? `<div class="nf-pick"><div><label for="nf-ehour">Время</label><select id="nf-ehour" data-sel="ehour" data-fk="nf-sel-ehour">${hours(p.evening.hour)}</select></div></div>` : ''}
  </div>
  <h2>Тихие часы</h2><div class="card nf-set"><p class="muted sm" style="margin:0 0 10px">В это время уведомления не приходят: напоминания переносятся на конец тихих часов. Время по часам телефона.</p>
    <div class="nf-pick"><div><label for="nf-qfrom">С</label><select id="nf-qfrom" data-sel="qfrom" data-fk="nf-sel-qfrom">${hours(p.quiet.from)}</select></div>
      <div><label for="nf-qto">До</label><select id="nf-qto" data-sel="qto" data-fk="nf-sel-qto">${hours(p.quiet.to)}</select></div></div></div>
  <p class="muted sm nf-priv">Тексты уведомлений общие и хранятся на сервере открытым текстом, поэтому в них нет сумм, категорий и заметок.</p>
  <button class="ghost danger" id="nf-off">Выключить на этом телефоне</button>`;
}

export default {
  render(s) {
    const p = normPrefs(s.settings.notify);
    const dev = push.isSupported() && (push.isStandalone() || !push.isIOS());
    const ready = dev && sync.isConnected() && !!push.getVapidPublic();
    const on = p.enabled && ui.sub === true && push.permission() === 'granted';
    return `${subHeader('Уведомления')}<div class="stack nf">
      <div class="card"><div class="row" style="justify-content:flex-start;gap:12px"><span class="tile" style="--h:var(--accent)">${ic('bell')}</span><div><b>Напоминания и новости от партнёра</b><div class="muted sm">Нужен один раз пройти четыре шага ниже.</div></div></div></div>
      <div id="nf-live" role="status" aria-live="polite">${ui.ok && ui.ok !== 'test' ? `<div class="nf-msg ok">${esc(ui.ok)}</div>` : ''}${ui.ok === 'test' ? `<div class="nf-msg ok">Сервер отправил тестовое уведомление. Если оно не пришло за минуту, проверьте разрешения в Настройки → Уведомления → Мы.</div>` : ''}</div>
      ${ui.err ? `<div class="error nf-msg bad" role="alert">${esc(ui.err)}</div>` : ''}
      ${stepDevice()}${stepServer()}${stepEnable(p, ready)}${stepTest(p, on)}
      ${on ? settings(p) : ''}
    </div>`;
  },
  leave() { ui.keys = null; ui.err = ''; ui.ok = ''; ui.confirmRekey = false; ui.keyErr = ''; ui.checked = false; },
  bind(root, s, a) {
    if (!ui.checked && push.isSupported()) { ui.checked = true; push.isSubscribed().then((v) => { if (ui.sub !== v) { ui.sub = v; if (a.route === 'notifications') a.render(); } }); }
    const run = async (name, fn) => {
      ui.busy = name; ui.err = ''; ui.ok = ''; a.render();
      try { await fn(); } catch (e) { ui.err = e.message || 'Не получилось'; }
      ui.busy = ''; if (a.route === 'notifications') a.render();
    };
    const pubIn = () => { ui.keyInput = $('#nf-pubin', root)?.value ?? ui.keyInput; };
    const go = $('#nf-gosync', root); if (go) go.onclick = () => a.go('sync');
    $$('[data-det]', root).forEach((d) => (d.ontoggle = () => { ui.open[d.dataset.det] = d.open; }));
    const sources = () => ({ sql: PUSH_SQL, fn: FUNCTION_CODE, sec: `VAPID_PUBLIC_KEY=${push.getVapidPublic()}\nVAPID_PRIVATE_KEY=\nVAPID_SUBJECT=mailto:`, cron: sync.getCfg() ? buildCronSql(sync.getCfg().url, sync.getCfg().key) : '' });
    $$('[data-copy]', root).forEach((b) => (b.onclick = () => copy(sources()[b.dataset.copy], a, 'Скопировано')));
    const keys = $('#nf-keys', root);
    if (keys) keys.onclick = () => run('keys', async () => { const k = await generateVapidKeys(); push.setVapidPublic(k.publicKey); ui.keys = k; });
    const cp = $('#nf-copy-priv', root); if (cp) cp.onclick = () => copy(ui.keys.privateKey, a, 'Приватный ключ скопирован');
    const sp = $('#nf-savepub', root);
    if (sp) sp.onclick = () => { pubIn(); if (push.setVapidPublic(ui.keyInput)) { ui.keyErr = ''; ui.keyInput = ''; a.toast('Ключ сохранён'); } else ui.keyErr = 'Это не похоже на публичный ключ уведомлений'; a.render(); };
    const rk = $('#nf-rekey', root); if (rk) rk.onclick = () => { ui.confirmRekey = true; a.render(); };
    const rkn = $('#nf-rekey-no', root); if (rkn) rkn.onclick = () => { ui.confirmRekey = false; a.render(); };
    const rky = $('#nf-rekey-yes', root);
    if (rky) rky.onclick = () => run('keys', async () => { await push.disable(); const k = await generateVapidKeys(); push.setVapidPublic(k.publicKey); ui.keys = k; ui.confirmRekey = false; ui.sub = false; });
    const en = $('#nf-enable', root);
    if (en) en.onclick = () => run('enable', async () => { await push.enable(); ui.sub = await push.isSubscribed(); ui.ok = 'Уведомления включены на этом телефоне'; });
    const t = $('#nf-test', root);
    if (t) t.onclick = () => run('test', async () => { await push.sendTest(); ui.ok = 'test'; });
    const off = $('#nf-off', root);
    if (off) off.onclick = () => run('off', async () => { await push.disable(); ui.sub = false; ui.ok = 'Уведомления выключены на этом телефоне'; });

    $$('[data-sw]', root).forEach((i) => (i.onchange = () => {
      const k = i.dataset.sw, v = i.checked;
      push.setPrefs((n) => { if (k === 'date' || k === 'evening') n[k].on = v; else n[k] = v; });
    }));
    $$('[data-sel]', root).forEach((i) => (i.onchange = () => {
      const k = i.dataset.sel, v = +i.value;
      push.setPrefs((n) => { if (k === 'dow') n.date.dow = v; else if (k === 'dhour') n.date.hour = v; else if (k === 'ehour') n.evening.hour = v; else if (k === 'qfrom') n.quiet.from = v; else if (k === 'qto') n.quiet.to = v; });
    }));
  },
};
