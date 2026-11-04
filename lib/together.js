// Логика «про нас двоих»: справедливость вкладов, финансовое свидание, реакции. Без DOM. Деньги — копейки.
import { other, splitAmount } from '../ledger.js';

const pad = (n) => String(n).padStart(2, '0');
const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const DAY = 86400000;

// ---------- Справедливость ----------

/** Доли по доходам: { max, dinara } в долях единицы (в сумме 1). Нет доходов — null. */
export function fairShare(incomes) {
  const m = Math.max(0, incomes?.max || 0), d = Math.max(0, incomes?.dinara || 0), total = m + d;
  if (!total) return null;
  return { max: m / total, dinara: d / total };
}

/** Доходы каждого за месяц 'YYYY-MM'. */
export function monthIncomes(txs, ym) {
  const r = { max: 0, dinara: 0 };
  for (const t of txs) if (t.type === 'income' && t.date?.startsWith(ym) && t.person in r) r[t.person] += t.amount;
  return r;
}

/**
 * Вложено в общее за месяц: общие траты, оплаченные из своего кошелька (целиком),
 * плюс переводы из своего кошелька в общий котёл.
 */
export function contributions(txs, ym) {
  const r = { max: 0, dinara: 0 };
  for (const t of txs) {
    if (!t.date?.startsWith(ym)) continue;
    if (t.type === 'expense' && t.scope === 'shared' && (t.paidFrom === 'max' || t.paidFrom === 'dinara')) r[t.paidFrom] += t.amount;
    else if (t.type === 'transfer' && t.to === 'joint' && (t.from === 'max' || t.from === 'dinara')) r[t.from] += t.amount;
  }
  return r;
}

/**
 * Сводка справедливости за месяц. Null, если нет доходов или нет вложений.
 * delta[p] > 0 — вложил(а) больше своей доли, < 0 — меньше. delta.max + delta.dinara = 0.
 * level: 'even' (почти ровно) | 'off'. Ровно — отклонение меньше 50 ₽ или 2% вложенного.
 */
export function fairnessDelta(txs, ym) {
  const share = fairShare(monthIncomes(txs, ym));
  const put = contributions(txs, ym), total = put.max + put.dinara;
  if (!share || !total) return null;
  const fairMax = Math.round(total * share.max), fair = { max: fairMax, dinara: total - fairMax };
  const delta = { max: put.max - fair.max, dinara: put.dinara - fair.dinara };
  const lead = delta.max >= delta.dinara ? 'max' : 'dinara';
  const amount = Math.abs(delta[lead]);
  const level = amount < Math.max(5000, total * 0.02) ? 'even' : 'off';
  return { share, put, fair, delta, total, lead, under: other(lead), amount, level };
}

// ---------- Недели ----------

/** ISO-неделя 'YYYY-Www' для даты 'YYYY-MM-DD'. */
export function weekKey(date) {
  const d = parse(date);
  const wd = (d.getDay() + 6) % 7;            // пн = 0
  const thu = new Date(d.getFullYear(), d.getMonth(), d.getDate() - wd + 3);
  const y = thu.getFullYear();
  const jan4 = new Date(y, 0, 4), w1 = new Date(y, 0, 4 - ((jan4.getDay() + 6) % 7));
  const wk = Math.round((thu - w1) / DAY / 7) + 1;
  return `${y}-W${pad(wk)}`;
}
/** Понедельник и воскресенье недели: { from, to } в 'YYYY-MM-DD'. */
export function weekRange(key) {
  const y = +key.slice(0, 4), w = +key.slice(6);
  const jan4 = new Date(y, 0, 4), mon = new Date(y, 0, 4 - ((jan4.getDay() + 6) % 7) + (w - 1) * 7);
  return { from: ymdOf(mon), to: ymdOf(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)) };
}
export const shiftWeek = (key, n) => { const d = parse(weekRange(key).from); return weekKey(ymdOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * n))); };

/** Итоги недели: доход/расход каждого (личное + доля в общем) и сумма всех трат. */
export function weekSummary(txs, key) {
  const { from, to } = weekRange(key);
  const r = { earned: { max: 0, dinara: 0 }, spent: { max: 0, dinara: 0 }, total: 0, count: 0 };
  for (const t of txs) {
    if (!t.date || t.date < from || t.date > to) continue;
    if (t.type === 'income') { r.earned[t.person] += t.amount; r.count++; }
    else if (t.type === 'expense') {
      r.count++;
      r.total += t.amount;
      if (t.scope === 'personal') r.spent[t.person] += t.amount;
      else { const s = splitAmount(t.amount, t.shareMax); r.spent.max += s.max; r.spent.dinara += s.dinara; }
    }
  }
  return r;
}

/**
 * Самая неожиданная трата недели: чужие скрытые не рассматриваются.
 * Оценка: во сколько раз сумма больше обычной для категории (среднее за 90 дней до недели); без истории — по сумме.
 */
export function surprisingExpense(txs, key, viewer) {
  const { from, to } = weekRange(key);
  const base = parse(from), back = ymdOf(new Date(base.getFullYear(), base.getMonth(), base.getDate() - 90));
  const hist = {};
  for (const t of txs) if (t.type === 'expense' && t.date >= back && t.date < from) (hist[t.category] ||= []).push(t.amount);
  let best = null;
  for (const t of txs) {
    if (t.type !== 'expense' || t.date < from || t.date > to || (t.hidden && t.person !== viewer)) continue;
    const h = hist[t.category];
    const avg = h && h.length >= 2 ? h.reduce((a, b) => a + b, 0) / h.length : null;
    const ratio = avg ? t.amount / avg : null;
    const score = ratio ?? t.amount / 100000;     // без истории: 1000 ₽ ≈ x1
    if (!best || score > best.score) best = { tx: t, ratio, score };
  }
  return best;
}

// ---------- Вопросы для разговора ----------
export const QUESTIONS = [
  'Какая покупка за последний год принесла тебе больше всего радости?',
  'Если бы у нас появились лишние 100 000 ₽, на что бы ты их потратил(а) в первую очередь?',
  'Что в детстве говорили дома про деньги? Что из этого ты до сих пор носишь с собой?',
  'Какое наше совместное воспоминание ты бы с радостью повторил(а) и сколько оно стоило бы?',
  'Где мы хотим жить через пять лет? Что для этого нужно уже сейчас?',
  'Какая трата тебя недавно порадовала, а какая оставила неприятный осадок?',
  'Чего тебе не хватает в нашем обращении с деньгами: спокойствия, лёгкости, порядка?',
  'Какая мечта кажется тебе слишком большой, чтобы произнести вслух?',
  'Когда ты в последний раз чувствовал(а) себя финансово спокойно? Что тогда было иначе?',
  'Что для тебя «хорошая жизнь» в обычный вторник, без отпусков и праздников?',
  'Есть ли вещь, на которую тебе хочется копить, но ты стесняешься сказать?',
  'Как бы ты хотел(а) отмечать важные события: подарки, ужины, поездки? Сколько на это не жалко?',
  'Что мы делаем с деньгами хорошо, и за что ты нас хвалишь?',
  'Чем бы ты занялся(ась), если бы деньги совсем не были проблемой?',
  'Какой минимум в месяц нужен нам обоим, чтобы чувствовать себя в безопасности?',
  'О какой покупке ты думаешь уже давно и всё откладываешь?',
  'Что тебя тревожит в нашем будущем с точки зрения денег, а что вдохновляет?',
  'Какое место на земле ты хочешь мне показать и на что для этого можно скопить?',
  'Как ты относишься к тому, чтобы у каждого были «деньги без отчёта»? Сколько это в месяц?',
  'Что ты хотел(а) бы уметь в деньгах лучше: откладывать, не тревожиться, просить, отказывать?',
  'Какой подарок, купленный или полученный, запомнился тебе навсегда?',
  'Чему нас научили родители в вопросах денег, а что мы хотим делать по-другому?',
  'Какая наша привычка в тратах самая милая, а какая самая смешная?',
  'Если бы мы могли выбрать один день в году для большой общей траты, что это был бы за день?',
  'Что для тебя значит быть щедрым(ой), и где у тебя проходит граница?',
  'Какое дело ты выбрал(а) бы, если бы выбирал(а) заново, и что нам для этого понадобится?',
  'Что ты хотел(а) бы, чтобы я понимал(а) про твои отношения с деньгами?',
  'Какой финансовой цели нам не хватает, чтобы по утрам было приятно просыпаться?',
  'Что в нашем быту мы могли бы упростить, чтобы тратить меньше сил и денег?',
  'Каким ты видишь наш дом через десять лет и что в нём главное?',
];
/** Вопрос недели: одинаков у обоих, меняется каждую неделю. */
export function questionFor(key) {
  const n = Math.floor(parse(weekRange(key).from).getTime() / DAY / 7);
  return QUESTIONS[((n % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length];
}

// ---------- Заметки свидания ----------
export const noteId = (week, person, kind) => `${week}:${person}:${kind}`;
export const notesOf = (notes, week, person) => (notes || []).filter((n) => n.week === week && n.person === person);
export const noteText = (notes, week, person, kind) => (notes || []).find((n) => n.week === week && n.person === person && n.kind === kind)?.text || '';
/** Партнёр видит чужие заметки недели, только когда сохранил(а) свои. */
export const canSeePartner = (notes, week, viewer) => notesOf(notes, week, viewer).length > 0;
/** Недели с заметками, новые сверху. */
export const noteWeeks = (notes) => [...new Set((notes || []).filter((n) => n.week).map((n) => n.week))].sort().reverse();

/** Сохранить заметку: пустой текст удаляет запись. Меняет массив notes на месте. */
export function applyNote(notes, { week, person, kind, text, at }) {
  const id = noteId(week, person, kind), i = notes.findIndex((n) => n.id === id), t = String(text || '').trim().slice(0, 600);
  if (!t) { if (i >= 0) notes.splice(i, 1); return; }
  const rec = { id, week, person, kind, text: t, at };
  if (i >= 0) notes[i] = rec; else notes.push(rec);
}

// ---------- Реакции и комментарии ----------
export const REACTIONS = ['❤️', '👍', '😮', '🤔', '✂️'];
export const REACTION_LABEL = { '❤️': 'Нравится', '👍': 'Одобряю', '😮': 'Ого', '🤔': 'Хм, подумаем', '✂️': 'Можно сократить' };
export const commentId = (txId, person) => `${txId}:${person}`;
export const commentOf = (comments, txId, person) => (comments || []).find((c) => c.txId === txId && c.person === person) || null;

/** Записать реакцию/комментарий человека к операции. Та же реакция повторно снимает её. Пустая запись удаляется. */
export function applyComment(comments, { txId, person, emoji, text, at }) {
  const id = commentId(txId, person), i = comments.findIndex((c) => c.id === id), cur = i >= 0 ? comments[i] : null;
  const rec = { id, txId, person, at };
  const e = emoji === undefined ? cur?.emoji : emoji === cur?.emoji ? '' : emoji;
  const t = text === undefined ? cur?.text : String(text).trim().slice(0, 280);
  if (e) rec.emoji = e;
  if (t) rec.text = t;
  if (!rec.emoji && !rec.text) { if (i >= 0) comments.splice(i, 1); return; }
  if (i >= 0) comments[i] = rec; else comments.push(rec);
}

/** Сколько существующих операций получили реакцию или комментарий от person. */
export function reactedCount(comments, txs, person) {
  const ids = new Set(txs.map((t) => t.id));
  return new Set((comments || []).filter((c) => c.person === person && ids.has(c.txId) && (c.emoji || c.text)).map((c) => c.txId)).size;
}
