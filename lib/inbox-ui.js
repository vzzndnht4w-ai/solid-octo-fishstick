// Связка центра уведомлений с интерфейсом: напоминания по расписанию, значок на иконке, тост про новое от партнёра.
import { bindSource, subscribe, refreshLocal, load, unreadCount, describe, genitive, LOCAL_GAP } from './inbox.js';
import { plural } from './tools.js';
import { nameOf, feminine, money } from '../core.js';

export const ctxFor = () => ({ name: nameOf, fem: feminine, money });
/** Число непрочитанных для текущего человека. */
export const unreadFor = (s) => (s.viewer ? unreadCount(load(s.viewer)) : 0);

export function setBadge(n) {
  try {
    if (n > 0 && typeof navigator.setAppBadge === 'function') navigator.setAppBadge(n).catch(() => {});
    else if (n <= 0 && typeof navigator.clearAppBadge === 'function') navigator.clearAppBadge().catch(() => {});
  } catch {}
}

export function initInbox(store, api, todayFn) {
  bindSource(() => ({ state: store.get(), viewer: store.get().viewer, today: todayFn() }));
  const refreshBadge = () => setBadge(unreadFor(store.get()));
  const REDRAW = ['home', 'more', 'inbox'];

  // тост: не чаще одного в 5 секунд, накопленное объединяем
  let queue = [], lastToast = 0, timer = null;
  const flush = () => {
    timer = null;
    const list = queue; queue = [];
    if (!list.length || document.hidden || api.route === 'inbox') return;
    lastToast = Date.now();
    const text = list.length === 1 ? describe(list[0], ctxFor()).title : `${list.length} ${plural(list.length, 'новое действие', 'новых действия', 'новых действий')} от ${genitive(nameOf(list[0].who))}`;
    api.toast(text, { label: 'Смотреть', fn: () => api.go('inbox') });
  };
  subscribe(({ added }) => {
    refreshBadge();
    if (REDRAW.includes(api.route)) api.render();
    const partner = added.filter((e) => e.kind === 'partner');
    if (!partner.length || api.route === 'inbox') return;
    queue.push(...partner);
    if (!timer) timer = setTimeout(flush, Math.max(0, lastToast + 5000 - Date.now()));
  });

  // напоминания: при старте, после изменений данных и при возврате в приложение, не чаще раза в минуту
  let pending = null;
  const tick = () => { pending = null; if (!refreshLocal(false).length) refreshBadge(); };
  const poke = () => { if (!pending) pending = setTimeout(tick, 400); };
  store.subscribe(poke);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshBadge(); poke(); } });
  setInterval(() => { if (!document.hidden) poke(); }, LOCAL_GAP);
  refreshBadge(); poke();
}
