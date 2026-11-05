// Виджеты главного экрана. Каждый: { id, render(s, a) → html, bind?(root, s, a) }.
// Порядок в массиве = порядок на экране. Виджет, которому нечего показать, возвращает ''.
import budgets from './budgets.js';
import goals from './goals.js';
import insights from './insights.js';
import fairness from './fairness.js';
import upcoming from './upcoming.js';
import streaks from './streaks.js';
import savingsW from './savings.js';
import quick from './quick.js';
// Главная сама ставит цели, накопления, бюджеты и «ближайшие 7 дней» выше последних операций;
// остальные идут после них в порядке массива: быстрое действие, наблюдения, пара, игры.
export default [goals, savingsW, budgets, upcoming, quick, insights, fairness, streaks];
