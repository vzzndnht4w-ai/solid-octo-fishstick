// Хранилище (localStorage). Схема версии 2. Синхронизация между телефонами подключится здесь же.
import { migrateColors, DEFAULT_COLORS } from './lib/appearance.js';
const KEY = 'we-money-v1';
export const SCHEMA = 2;

export const defaults = () => ({
  v: SCHEMA,
  viewer: null,                       // 'max' | 'dinara' — кто сейчас за телефоном
  txs: [],                            // операции (см. ledger.js)
  profiles: {                         // профиль каждого: имя, цвет, пол (для окончаний: «заработал/а»)
    max: { name: 'Максим', female: false, color: DEFAULT_COLORS.max },
    dinara: { name: 'Динара', female: true, color: DEFAULT_COLORS.dinara },
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
  savings: [],                        // [{ id, name, kind, owner:'max'|'dinara'|'joint', amount, rate?, until?, note?, hidden?, history:[{at, amount}] }] — накопления (вне операций)
  dateNotes: [],                      // [{ id, month|date, person, text, at }] — заметки «финансового свидания»
});

const migrate = (d) => {
  const base = defaults();
  const out = { ...base, ...d, profiles: { ...base.profiles, ...(d.profiles || {}) }, settings: { ...base.settings, ...(d.settings || {}) }, categories: { ...base.categories, ...(d.categories || {}) } };
  for (const c of ['comments', 'challenges', 'templates', 'dateNotes', 'savings']) out[c] = Array.isArray(d[c]) ? d[c] : [];
  // защита от повреждённой копии: коллекции должны быть нужного типа
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  if (!Array.isArray(out.txs)) out.txs = [];
  if (!Array.isArray(out.goals)) out.goals = [];
  if (!Array.isArray(out.recurring)) out.recurring = [];
  out.budgets = obj(out.budgets);
  out.settings.pins = obj(out.settings.pins);
  out.categories = { expense: Array.isArray(out.categories.expense) ? out.categories.expense : [], income: Array.isArray(out.categories.income) ? out.categories.income : [] };
  out.profiles = migrateColors(out.profiles); // старые 'blue'/'rose' и др. → новый набор цветов
  out.v = SCHEMA;
  if (d.txs && d.txs.length && !('onboarded' in (d.settings || {}))) out.settings.onboarded = true; // у уже пользующихся пропускаем знакомство
  return out;
};


const MAX_BACKUP_CHARS = 25 * 1024 * 1024;
const MAX_COLLECTION_ITEMS = 100_000;
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** Проверяет резервную копию до замены текущего состояния. Не исправляет сомнительные данные молча. */
export function validateBackup(d) {
  if (!isRecord(d)) throw new Error('Резервная копия должна содержать объект данных');
  if (!Array.isArray(d.txs)) throw new Error('В резервной копии нет списка операций');
  if (d.txs.length > MAX_COLLECTION_ITEMS) throw new Error('Слишком много операций в резервной копии');
  for (const [i, tx] of d.txs.entries()) {
    if (!isRecord(tx)) throw new Error(`Операция №${i + 1} имеет неверный формат`);
    if (typeof tx.id !== 'string' || !tx.id.trim()) throw new Error(`У операции №${i + 1} отсутствует идентификатор`);
    if (!['income', 'expense', 'transfer', 'saving'].includes(tx.type)) throw new Error(`У операции №${i + 1} неизвестный тип`);
    if (!Number.isSafeInteger(tx.amount)) throw new Error(`У операции №${i + 1} некорректная сумма`);
  }
  for (const key of ['goals', 'recurring', 'comments', 'challenges', 'templates', 'savings', 'dateNotes']) {
    if (d[key] !== undefined && (!Array.isArray(d[key]) || d[key].length > MAX_COLLECTION_ITEMS)) throw new Error(`Раздел «${key}» имеет неверный формат`);
  }
  for (const key of ['settings', 'profiles', 'budgets', 'categories']) {
    if (d[key] !== undefined && !isRecord(d[key])) throw new Error(`Раздел «${key}» имеет неверный формат`);
  }
  const scan = (value, depth = 0) => {
    if (depth > 80) throw new Error('Слишком глубокая структура резервной копии');
    if (Array.isArray(value)) { for (const item of value) scan(item, depth + 1); return; }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) throw new Error('В резервной копии обнаружено небезопасное поле');
      scan(child, depth + 1);
    }
  };
  scan(d);
  return d;
};

let state = defaults();
const listeners = new Set();
try { state = migrate(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { state = defaults(); }

let saveFailed = false;   // запись в память телефона не удалась (переполнение, запрет): показываем предупреждение, а не молчим
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); saveFailed = false; } catch { saveFailed = true; } listeners.forEach((f) => f()); };

export const store = {
  get: () => state,
  subscribe: (f) => listeners.add(f),
  /** true, если последнее изменение не удалось записать на телефон. */
  saveFailed: () => saveFailed,
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
    if (typeof text !== 'string' || text.length > MAX_BACKUP_CHARS) throw new Error('Размер резервной копии недопустим');
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error('Файл резервной копии повреждён: неверный JSON'); }
    validateBackup(parsed);
    const next = migrate(parsed);
    next.settings.pins = {}; // PIN задаётся заново на устройстве после восстановления
    state = next;
    save();
    if (saveFailed) throw new Error('Не удалось сохранить восстановленные данные на этом устройстве');
  },
  /** Удаляет операции, цели, бюджеты и регулярные платежи; профили и настройки остаются. */
  reset() { state = { ...defaults(), viewer: state.viewer, profiles: state.profiles, settings: state.settings }; save(); },
};
