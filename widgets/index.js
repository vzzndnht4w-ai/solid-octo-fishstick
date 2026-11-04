// Виджеты главного экрана. Каждый: { id, render(s, a) → html, bind?(root, s, a) }.
// Порядок в массиве = порядок на экране. Виджет, которому нечего показать, возвращает ''.
import budgets from './budgets.js';
import goals from './goals.js';
import insights from './insights.js';
export default [budgets, goals, insights];
