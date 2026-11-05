// Хранилище (localStorage). Схема версии 2. Синхронизация между телефонами подключится здесь же.
const KEY = 'we-money-v1';
export const SCHEMA = 2;

export const defaults = () => ({
  v: SCHEMA,
  viewer: null,                       // 'max' | 'dinara' — кто сейчас за телефоном
  txs: [],                            // операции (см. ledger.js)
  profiles: {                         // профиль каждого: имя, цвет, пол (для окончаний: «заработал/а»)
    max: { name: 'Максим', female: false, color: 'blue' },
    dinara: { name: 'Динара', female: true, color: 'rose' },
  },
  settings: {
    theme: 'auto',                    // 'auto' | 'light' | 'dark'
    currency: '₽',
    defaultShare: 50,                 // доля первого человека в общих тратах по умолчанию, %
    defaultMethod: 'card',            // 'card' | 'cash'
    pins: {},                         // { max: '<хэш>', dinara: '<хэш>' } — PIN каждого
    autoLockMin: 1,                   // через сколько минут в фоне блокировать (0 — выкл.)
    onboarded: false,
    notify: {                         // push-уведомления этого телефона (см. lib/push-core.js, normPrefs)
      enabled: false, partnerAdds: true, partnerReacts: true, payments: true,
      date: { on: true, dow: 0, hour: 19 }, debt: true, evening: { on: false, hour: 21 }, quiet: { from: 22, to: 8 },
    },
  },
  budgets: {},                        // { 'Продукты': 3000000 } — лимит на месяц, копейки
  goals: [],                          // [{ id, name, target, emoji, createdAt, deadline? }]
  recurring: [],                      // [{ id, tpl:{...операция без id/date}, day:1..28, lastRun:'YYYY-MM'|null, active }]
  categories: { expense: [], income: [] }, // свои категории поверх встроенных
  // Списки с id, которые синхронизируются автоматически (см. COLLECTIONS в lib/sync-core.js):
  comments: [],                       // [{ id, txId, person, text?, emoji?, at }] — реакции и комментарии к операциям
  challenges: [],                     // [{ id, type, title, startedAt, ... }] — челленджи и их прогресс
  templates: [],                      // [{ id, title, tpl:{...операция без id/date} }] — быстрые шаблоны
  dateNotes: [],                      // [{ id, month|date, person, text, at }] — заметки «финансового свидания»
});

const migrate = (d) => {
  const base = defaults();
  const out = { ...base, ...d, profiles: { ...base.profiles, ...(d.profiles || {}) }, settings: { ...base.settings, ...(d.settings || {}) }, categories: { ...base.categories, ...(d.categories || {}) } };
  for (const c of ['comments', 'challenges', 'templates', 'dateNotes']) out[c] = Array.isArray(d[c]) ? d[c] : [];
  // защита от повреждённой копии: коллекции должны быть нужного типа
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  if (!Array.isArray(out.txs)) out.txs = [];
  if (!Array.isArray(out.goals)) out.goals = [];
  if (!Array.isArray(out.recurring)) out.recurring = [];
  out.budgets = obj(out.budgets);
  out.settings.pins = obj(out.settings.pins);
  out.categories = { expense: Array.isArray(out.categories.expense) ? out.categories.expense : [], income: Array.isArray(out.categories.income) ? out.categories.income : [] };
  out.v = SCHEMA;
  if (d.txs && d.txs.length && !('onboarded' in (d.settings || {}))) out.settings.onboarded = true; // у уже пользующихся пропускаем знакомство
  return out;
};

let state = defaults();
const listeners = new Set();
try { state = migrate(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { state = defaults(); }

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} listeners.forEach((f) => f()); };

export const store = {
  get: () => state,
  subscribe: (f) => listeners.add(f),
  /** Любое изменение состояния: store.mutate((s) => { s.settings.theme = 'dark'; }) */
  mutate(fn) { fn(state); save(); },
  add(tx) { state.txs.push({ id: crypto.randomUUID(), createdAt: Date.now(), ...tx }); save(); },
  update(id, tx) { state.txs = state.txs.map((t) => (t.id === id ? { ...t, ...tx, id } : t)); save(); },
  remove(id) { state.txs = state.txs.filter((t) => t.id !== id); save(); },
  restore(tx) { if (!state.txs.some((t) => t.id === tx.id)) { state.txs.push(tx); save(); } },
  setViewer(v) { state.viewer = v; save(); },
  /** Резервная копия: без PIN-хэшей (их можно подобрать за миллисекунды; после восстановления PIN задаётся заново). */
  exportJson: () => JSON.stringify({ ...state, settings: { ...state.settings, pins: {} } }),
  importJson(text) {
    const d = JSON.parse(text);
    if (!Array.isArray(d.txs)) throw new Error('bad');
    state = migrate(d); save();
  },
  /** Удаляет операции, цели, бюджеты и регулярные платежи; профили и настройки остаются. */
  reset() { state = { ...defaults(), viewer: state.viewer, profiles: state.profiles, settings: state.settings }; save(); },
};
