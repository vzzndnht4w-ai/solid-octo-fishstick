// Блоки главной, которые можно скрыть. Выбор хранится в настройках этого телефона отдельно для каждого:
// settings.homeHidden = { max: ['fairness'], dinara: [] }. Баланс и строка долга показываются всегда.
export const HOME_BLOCKS = [
  ['chart', 'Динамика', 'График общего баланса'],
  ['people', 'За месяц', 'Сколько заработал и потратил каждый'],
  ['goals', 'Цели', ''],
  ['savings', 'Накопления', ''],
  ['budgets', 'Бюджеты', ''],
  ['upcoming', 'Ближайшие 7 дней', 'Регулярные платежи на неделю'],
  ['recent', 'Последние операции', ''],
  ['quick', 'Быстро добавить', 'Шаблоны в одно касание'],
  ['insights', 'Замечено', 'Наблюдения о тратах'],
  ['fairness', 'Справедливость', 'Вклады по сравнению с доходами'],
  ['streaks', 'Челленджи', ''],
];
const IDS = new Set(HOME_BLOCKS.map((b) => b[0]));

/** Скрытые блоки для человека: только известные id, без повторов. */
export function hiddenBlocks(settings, viewer) {
  const list = settings?.homeHidden?.[viewer];
  return Array.isArray(list) ? [...new Set(list.filter((id) => IDS.has(id)))] : [];
}

/** Показать или скрыть блок (меняет settings на месте). */
export function setBlock(settings, viewer, id, show) {
  if (!IDS.has(id) || (viewer !== 'max' && viewer !== 'dinara')) return;
  const cur = hiddenBlocks(settings, viewer).filter((x) => x !== id);
  if (!show) cur.push(id);
  const old = settings.homeHidden && typeof settings.homeHidden === 'object' ? settings.homeHidden : {};
  settings.homeHidden = { ...old, [viewer]: cur };
}
