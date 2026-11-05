# «Мы» — учёт денег для двоих (PWA, без сборки)

Чистый JS (ES-модули), без фреймворков и сборки. Деплой: GitHub Pages (`.github/workflows/pages.yml`).
Тесты: `npm test` (node:test, только чистая логика). Локально: `python3 -m http.server 8099`.
Язык интерфейса — русский. Деньги — целые копейки. Люди — ключи `'max'` и `'dinara'` (имена настраиваются в профилях).

## Архитектура
- `ledger.js` — чистая логика (балансы, долги, статистика, валидация). Без DOM. Тестируется.
- `store.js` — состояние в localStorage, схема v2 (`profiles`, `settings`, `budgets`, `goals`, `recurring`, `categories`). Менять через `store.mutate(fn)`.
- `core.js` — общие помощники интерфейса (`esc`, `money`, `av`, `tile`, `nameOf`, `subHeader`…). Все пользовательские строки в HTML — через `esc()`.
- `app.js` — роутер. Экран = модуль `screens/<имя>.js`: `export default { render(s, a) → html, bind(root, s, a) }`.
  `a` — api: `a.go(route)`, `a.back()`, `a.render()`, `a.month`, `a.store`, `a.toast(msg, {label, fn})`, `a.openTx(id)`, `a.editTx(tx)`.
- Виджеты главной: `widgets/*.js` → `{ id, render(s, a), bind?(root, s, a) }`, список в `widgets/index.js`.
- `lib/` — чистые модули логики для новых функций (с тестами в `test/`).
- Стили — `style.css`: ЕДИНСТВЕННОЕ место значений цвета (токены в `:root`; тёмная тема через `prefers-color-scheme` и `data-theme`). Остальные `css/*.css` берут только `var(--…)`, hex-цвета и свои `:root` (кроме локальных `--vz-*`) не заводить. Палитра: тёмный графит, один фирменный цвет — изумруд (`--max`/`--accent`), у Динары нейтральный лавандовый (`--dinara`), «общее» — приглушённое золото (`--joint`). Градиент допустим только у героя (`--hero`). Глубина — цвет поверхности и тонкая линия, тени только у меню, шторок, тоста.
- Анимации: `lib/motion.js` (countUp, stagger, ringFill; уважает prefers-reduced-motion). Ряд для графика главной: `lib/series.js` (balanceSeries, rangeDelta, geometry), тесты в `test/series.test.mjs`.
- Сканер QR чеков: `lib/receipt.js` (разбор кассового чека ФНС и платёжного QR ST0001x, тесты) + `screens/scan.js` (камера или фото из галереи) + `lib/vendor/jsQR.min.js` (Apache 2.0, подгружается только при открытии сканера). В чеке только сумма, дата и номер: товаров там нет.
- Иконки — `icons.js` (`ic('имя')`). Новую иконку добавлять в объект `P`.

## Синхронизация
`lib/sync-core.js` (чистая логика, тесты) + `lib/sync.js` (сеть, Supabase RPC) + `screens/sync.js` (интерфейс). Записи шифруются AES-GCM на телефоне.
Новые данные синхронизируются автоматически, если это: операция, цель, платёж, профиль и т.д. (см. collect()), либо элемент одной из `COLLECTIONS` (`comments`, `challenges`, `templates`, `dateNotes`) — список объектов с полем `id` в состоянии (`store.mutate(s => s.comments.push({...}))`). Любое другое новое поле состояния сначала нужно добавить в collect()/applyRemote().

## Агенты и скиллы
В `.claude/agents/` и `.claude/skills/` лежат подобранные агенты и скиллы (когда кого звать: `.claude/README.md`). Это только текстовые инструкции. Хуки и скрипты из сторонних наборов не ставим.
