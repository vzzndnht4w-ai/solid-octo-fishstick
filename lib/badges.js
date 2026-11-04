// Новые достижения и завершённые челленджи: тост + конфетти. Отметки о полученных — в localStorage, у каждого человека свои.
import { achievements, doneChallenges } from './play.js';
import { celebrate } from './confetti.js';

export const BADGES_KEY = 'we-money-badges';
const read = () => { try { const d = JSON.parse(localStorage.getItem(BADGES_KEY) || '{}'); return d && typeof d === 'object' ? d : {}; } catch { return {}; } };
const write = (d) => { try { localStorage.setItem(BADGES_KEY, JSON.stringify(d)); } catch {} };

/** Что получено сейчас: [{key, text}] — достижения 'a:<id>' и завершённые челленджи 'c:<id>'. */
export function earnedNow(s, today) {
  return [
    ...achievements(s, today).filter((a) => a.earned).map((a) => ({ key: `a:${a.id}`, text: `Новое достижение: ${a.title}` })),
    ...doneChallenges(s, today).map((c) => ({ key: `c:${c.id}`, text: `Челлендж пройден: ${c.title}` })),
  ];
}

/** Проверка; первый запуск для человека молча запоминает уже полученное. Возвращает новые элементы. */
export function checkBadges(s, today, toast) {
  if (!s.viewer || !s.settings?.onboarded) return [];
  const all = read(), seen = all[s.viewer], now = earnedNow(s, today);
  if (!Array.isArray(seen)) { all[s.viewer] = now.map((x) => x.key); write(all); return []; }
  const fresh = now.filter((x) => !seen.includes(x.key));
  if (fresh.length) {
    all[s.viewer] = [...seen, ...fresh.map((x) => x.key)]; write(all);
    toast?.(fresh.length === 1 ? fresh[0].text : `${fresh[0].text} (и ещё ${fresh.length - 1})`);
    celebrate();
  }
  return fresh;
}

/** Подписка на store: при старте и после изменений, не чаще раза в gap мс. */
export function initBadges(store, toast, todayFn, gap = 3000) {
  let last = 0, timer = null;
  const run = () => { timer = null; last = Date.now(); try { checkBadges(store.get(), todayFn(), toast); } catch {} };
  const poke = () => { if (!timer) timer = setTimeout(run, Math.max(0, last + gap - Date.now())); };
  store.subscribe(poke);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poke(); });
  poke();
}
