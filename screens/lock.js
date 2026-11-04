// Экран ввода PIN-кода: цифровая клавиатура поверх приложения. Используется для блокировки, смены
// пользователя и установки/смены/отключения PIN в профиле. Логика хэшей и лимитов — в lib/pin.js.
import { PIN_LENGTH, verifyPin, canAttempt, recordFail, recordSuccess, attemptsLeft, newThrottle } from '../lib/pin.js';
import { esc, ic, av, nameOf } from '../core.js';
import { store } from '../store.js';
import '../lib/profile-icons.js';

const TKEY = 'we-pin-throttle';
const loadT = (k) => { try { return { ...newThrottle(), ...(JSON.parse(localStorage.getItem(TKEY) || '{}')[k] || {}) }; } catch { return newThrottle(); } };
const saveT = (k, v) => { try { const all = JSON.parse(localStorage.getItem(TKEY) || '{}'); all[k] = v; localStorage.setItem(TKEY, JSON.stringify(all)); } catch {} };

let current = null;   // { close } — открытый сейчас экран ввода
const host = () => document.getElementById('lock') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'lock' });
const setInert = (on) => ['view', 'tabs', 'sheet', 'toast'].forEach((id) => { const el = document.getElementById(id); if (el) el.inert = on; });

/** Закрыть открытый экран ввода (как «отмена»). */
export const closePad = () => { if (current) current.close(null); };
export const isPadOpen = () => !!current;

/**
 * Показать экран ввода PIN. Возвращает Promise: { pin } | { extra: id } | null (отмена).
 * opts: { title, sub, person (для аватара), check(pin) → true | false | 'сообщение', throttleKey,
 *         cancelable, extras: [{ id, label }] }
 */
export function pinPad(opts) {
  if (current) current.close(null);
  const prevFocus = document.activeElement;
  const el = host();
  let value = '', busy = false, timer = null, wait = 0;
  const key = opts.throttleKey;

  return new Promise((resolve) => {
    const close = (result) => {
      clearInterval(timer); document.removeEventListener('keydown', onKey, true);
      el.innerHTML = ''; el.hidden = true; setInert(false); current = null;
      if (prevFocus && prevFocus.isConnected && prevFocus.focus) try { prevFocus.focus(); } catch {}
      resolve(result);
    };
    current = { close };

    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button type="button" class="pk" data-d="${d}" aria-label="${d}">${d}</button>`).join('');
    el.hidden = false;
    const tz = document.getElementById('toast'); if (tz) tz.hidden = true;
    el.innerHTML = `<div class="pin" role="dialog" aria-modal="true" aria-labelledby="pin-title" aria-describedby="pin-sub">
      <div class="pin-top">${opts.person ? av(opts.person, 'xl') : `<span class="av joint xl">${ic('lock')}</span>`}
        <h1 id="pin-title" tabindex="-1">${esc(opts.title)}</h1><p class="muted" id="pin-sub">${esc(opts.sub || '')}</p></div>
      <div class="pin-dots" id="pin-dots" role="img" aria-label="Введено 0 из ${PIN_LENGTH}">${'<i></i>'.repeat(PIN_LENGTH)}</div>
      <p class="pin-msg" id="pin-msg" role="alert"></p>
      <div class="pin-keys">${digits}<span></span><button type="button" class="pk" data-d="0" aria-label="0">0</button><button type="button" class="pk fn" data-back aria-label="Стереть цифру">${ic('backspace')}</button></div>
      <div class="pin-links">${(opts.extras || []).map((x) => `<button type="button" class="link" data-extra="${esc(x.id)}">${esc(x.label)}</button>`).join('')}${opts.cancelable ? '<button type="button" class="link" data-cancel>Отмена</button>' : ''}</div></div>`;
    setInert(true);
    const $ = (s) => el.querySelector(s);
    const dots = $('#pin-dots'), msg = $('#pin-msg'), keys = [...el.querySelectorAll('.pk')];

    const paint = () => {
      [...dots.children].forEach((d, i) => d.classList.toggle('on', i < value.length));
      dots.setAttribute('aria-label', `Введено ${value.length} из ${PIN_LENGTH}`);
    };
    const say = (text, bad) => { msg.textContent = text; msg.classList.toggle('bad', !!bad); };
    const lockKeys = (off) => keys.forEach((k) => (k.disabled = off));
    const shake = () => { dots.classList.remove('shake', 'flash'); void dots.offsetWidth; dots.classList.add('shake', 'flash'); };

    const tick = () => {
      const c = canAttempt(loadT(key), Date.now());
      wait = c.waitMs;
      if (c.ok) { clearInterval(timer); timer = null; lockKeys(false); say('', false); return; }
      lockKeys(true); say(`Много попыток. Подождите ${Math.ceil(c.waitMs / 1000)}\u00a0с`, true);
    };
    if (key) { tick(); if (wait > 0) timer = setInterval(tick, 500); }

    const submit = async () => {
      busy = true;
      const pin = value;
      let res = true;
      if (opts.check) {
        try { res = await opts.check(pin); } catch { res = 'Не удалось проверить PIN-код. Откройте приложение по https-ссылке'; }
        if (key) {
          const t = loadT(key), now = Date.now();
          if (res === true) saveT(key, recordSuccess());
          else saveT(key, recordFail(t, now));
        }
      }
      if (res === true) return close({ pin });
      value = ''; paint(); shake();
      if (key && !canAttempt(loadT(key), Date.now()).ok) { tick(); timer = timer || setInterval(tick, 500); }
      else {
        const left = key ? attemptsLeft(loadT(key)) : 0;
        say(typeof res === 'string' ? res : `Неверный PIN-код${key && left < 3 ? `. Осталось попыток: ${left}` : ''}`, true);
      }
      busy = false;
    };
    const press = (d) => {
      if (busy || value.length >= PIN_LENGTH || (key && !canAttempt(loadT(key), Date.now()).ok)) return;
      value += d; say('', false); paint();
      if (value.length === PIN_LENGTH) setTimeout(submit, 140);
    };
    const erase = () => { if (busy) return; value = value.slice(0, -1); paint(); };

    keys.forEach((k) => (k.onclick = () => (k.dataset.d !== undefined ? press(k.dataset.d) : erase())));
    $('[data-back]').onclick = erase;
    el.querySelectorAll('[data-extra]').forEach((b) => (b.onclick = () => close({ extra: b.dataset.extra })));
    const cn = $('[data-cancel]'); if (cn) cn.onclick = () => close(null);

    function onKey(e) {
      if (/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); press(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); erase(); }
      else if (e.key === 'Escape' && opts.cancelable) { e.preventDefault(); close(null); }
      else if (e.key === 'Tab') {   // фокус не уходит за пределы окна
        const f = [...el.querySelectorAll('button:not(:disabled)')];
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    $('#pin-title').focus({ preventScroll: true });
  });
}

/** Проверка PIN конкретного человека по сохранённому хэшу. */
export const checkFor = (person) => (pin) => verifyPin(pin, store.get().settings.pins?.[person]);

/** Просит ввести текущий PIN человека; true — введён верно. */
export async function confirmPin(person, { title, sub, cancelable = true, extras } = {}) {
  const r = await pinPad({ title: title || 'Введите PIN-код', sub, person, check: checkFor(person), throttleKey: person, cancelable, extras });
  return r && r.pin ? true : r;
}

/** Просит придумать новый PIN и повторить его. Возвращает PIN или null. */
export async function askNewPin(person, name) {
  for (;;) {
    const a = await pinPad({ title: 'Придумайте PIN-код', sub: `${PIN_LENGTH} цифры, чтобы никто не открыл профиль «${name}»`, person, cancelable: true });
    if (!a) return null;
    const b = await pinPad({ title: 'Повторите PIN-код', sub: 'Введите те же цифры ещё раз', person, cancelable: true, extras: [{ id: 'again', label: 'Начать заново' }], check: (p) => p === a.pin || 'PIN-коды не совпали, попробуйте ещё раз' });
    if (!b) return null;
    if (b.pin) return a.pin;
  }
}

/**
 * Экран блокировки при запуске и после фона. Возвращает Promise, который завершается,
 * когда приложение разблокировано (viewer остаётся тем же) или выбран другой пользователь.
 * Возвращает 'unlocked' | 'switched' | 'reset'.
 */
export async function lockScreen(s, api) {
  const me = s.viewer, partner = me === 'max' ? 'dinara' : 'max';
  for (;;) {
    const r = await pinPad({
      title: `Привет, ${nameOf(me)}`, sub: 'Введите PIN-код, чтобы открыть «Мы»', person: me, check: checkFor(me), throttleKey: me,
      extras: [{ id: 'switch', label: `Я — ${nameOf(partner)}` }, { id: 'forgot', label: 'Забыли PIN?' }],
    });
    if (!r) return 'cancelled';
    if (r.pin) return 'unlocked';
    if (r.extra === 'switch') {
      const cur = store.get();
      if (cur.settings.pins?.[partner]) {
        const ok = await confirmPin(partner, { title: `PIN-код: ${nameOf(partner)}`, sub: 'Чтобы войти как другой человек', cancelable: true });
        if (ok !== true) continue;
      }
      store.setViewer(partner);
      return 'switched';
    }
    if (r.extra === 'forgot') {
      // Сброс PIN возможен только с PIN партнёра (или если у партнёра PIN нет — после явного подтверждения).
      if (store.get().settings.pins?.[partner]) {
        const ok = await confirmPin(partner, { title: `Сброс PIN: нужен PIN ${nameOf(partner)}`, sub: `Партнёр подтверждает, что это вы. PIN-код «${nameOf(me)}» будет отключён.`, cancelable: true });
        if (ok !== true) continue;
      } else {
        api.toast(`Сброс возможен через PIN партнёра: войдите как «${nameOf(partner)}», задайте ему PIN в профиле и вернитесь сюда`);
        continue;
      }
      store.mutate((st) => { delete st.settings.pins[me]; });
      saveT(me, newThrottle());
      api.toast('PIN-код отключён. Задайте новый в профиле');
      return 'reset';
    }
  }
}
