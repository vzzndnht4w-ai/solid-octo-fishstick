// Хранилище. Сейчас — localStorage. Синхронизация между телефонами (Supabase)
// подключается здесь же, не меняя остальной код.
const KEY = 'we-money-v1';
const empty = () => ({ txs: [], viewer: null });
let state = empty();
const listeners = new Set();

try { state = { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { state = empty(); }

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} listeners.forEach((f) => f()); };

export const store = {
  get: () => state,
  subscribe: (f) => listeners.add(f),
  add(tx) { state.txs.push({ id: crypto.randomUUID(), createdAt: Date.now(), ...tx }); save(); },
  remove(id) { state.txs = state.txs.filter((t) => t.id !== id); save(); },
  setViewer(v) { state.viewer = v; save(); },
  exportJson: () => JSON.stringify(state),
  importJson(text) {
    const d = JSON.parse(text);
    if (!Array.isArray(d.txs)) throw new Error('bad');
    state = { ...empty(), ...d }; save();
  },
  reset() { state = { ...empty(), viewer: state.viewer }; save(); },
};
