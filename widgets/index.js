// Виджеты главного экрана. Каждый: { id, render(s, a) → html, bind?(root, s, a) }.
// Порядок в массиве = порядок на экране. Виджет, которому нечего показать, возвращает ''.
import budgets from './budgets.js';
import goals from './goals.js';
import insights from './insights.js';
import fairness from './fairness.js';
import upcoming from './upcoming.js';
import streaks from './streaks.js';
import quick from './quick.js';
export default [quick, upcoming, budgets, goals, streaks, fairness, insights];
