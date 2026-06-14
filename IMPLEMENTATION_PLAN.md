# План реализации Redesign v2

> **Цель:** перенести `frontend-redesign-v2/` (HTML-мокапы) на реальный Next.js проект с подключением к бэкенду. Без ломания продакшена.

> **Версия плана:** 1.0
> **Объём работы:** ~30–50 файлов фронта, ~10–15 модулей бэкенда, 4 миграции БД
> **Реалистичная оценка:** **35–55 человеко-дней** для одного fullstack-инженера (5–8 недель календарно)

---

## 0. TL;DR

Что в плане:
1. **Foundation** — Tailwind tokens + шрифты + 12 базовых React-компонентов.
2. **Layout** — новый `DashboardLayout` (Sidebar + Topbar) глобально на всех страницах.
3. **Учительские экраны** (12 шт.) — 7 уже есть → редизайн, 2 строим с нуля (`worksheet`, `grading`), 3 расширяем (`analytics`, `tools`, `students`).
4. **Студенческий интерфейс** (6 шт.) — 4 есть → редизайн, 2 новых (`achievements`, `notifications`).
5. **Бэкенд новые модули** — Gamification (XP/Streak/Achievements), расширенная Analytics, ai-grading-assist (есть), social auth (есть).
6. **Полировка** — Cmd+K поиск, тёмная тема, мобильная версия, регрессии.

Главные риски: **сломать платежи / боты / генерации**. Митигация — изолированные фазы с регрессионным smoke-тестом после каждой.

---

## 1. Gap-анализ (факт)

### Что готово (переиспользуется без изменений)
- Backend модули: `calendar/lessons`, `submissions` (включая `POST /:id/ai-feedback`), `students`, `referrals` (с тирами в схеме), `auth` (с Telegram/MAX login), `notifications` (база есть).
- Frontend компоненты: `DashboardHome.tsx`, `CoursesPage.tsx`, `StudentsPage.tsx`, `SettingsPage.tsx`, `student/dashboard`, `student/grades`, `student/assignments/[id]`, `student/ai-teacher` (с localStorage историей).
- DB schema: `ReferralCode`, `ReferralMilestone`, `Notification`, `ChatMessage` (для учителя).

### Что требует только редизайн UI (логика остаётся)
| Страница | Текущее | Изменение |
|---|---|---|
| `dashboard/page.tsx` (главная) | `DashboardHome` | Bento-сетка «что важно сегодня», новые KPI |
| `dashboard/courses/` (материалы) | `CoursesPage` | Фильтры-пилюли, view-toggle, cover-цвета по предметам |
| `dashboard/students/` | `StudentsPage` | At-risk баннер, status-dots, KPI колонки, фильтры |
| `dashboard/calendar/` | week/month view | Time-grid с цветными слотами, легенда |
| `dashboard/classes/[id]/` | `ClassDetailPage` | Hero + tabs (Материалы/Ученики/Задания), at-risk блок |
| `dashboard/referrals/` | `ReferralsPage` | 4 тира, реф-ссылка, social share |
| `dashboard/settings/` | `SettingsPage` | Левая навигация + панели секций |
| `/login` (учитель) | форма | Split-screen + Telegram/MAX кнопки |
| `student/dashboard` | базовый | Greeting + streak chip, группировка по срочности |
| `student/grades` | список | KPI карточки + bars по предметам |
| `student/assignments/[id]` | базовый | Accordion материалов + sticky submit-bar |
| `student/ai-teacher` | localStorage чат | Sidebar с историей + quick prompts |

### Что строится с нуля (фронт + бэк)
| Страница | Файлы фронта | Backend |
|---|---|---|
| `dashboard/workspace/worksheet/` (split-workspace) | new | использует существующий `/generations/worksheet` |
| `dashboard/grading/` (3-колоночный) | new | использует `submissions/:id/ai-feedback` (готов) |
| `dashboard/analytics/` (графики, heatmap) | new (сейчас redirect) | **Новые endpoints** (heatmap по неделям, by-student) |
| `dashboard/tools/` (каталог инструментов) | редизайн `/dashboard/ai` | использует существующий |
| `pricing/` | редизайн (если есть) | использует subscriptions |
| `student/notifications/` | new | использует существующий `notifications` |
| `student/achievements/` | new | **Новый модуль** Gamification |

### Полностью отсутствует на бэке (нужно строить)
1. **Gamification** — XP, streaks, achievements, badges, leaderboard.
2. **Analytics endpoints** — heatmap по неделям, by-student stats.
3. **AI grading suggestions для нескольких ошибок** (текущий `/ai-feedback` даёт общий комментарий, нужно расширить для разметки ошибок по полям).

---

## 2. Архитектурные решения

### 2.1 Дизайн-система — куда положить токены
**Решение:** в `frontend/tailwind.config.ts` + CSS-переменные в `globals.css`.

- Дизайн-токены из `frontend-redesign-v2/assets/tokens.css` → перенести как `:root` в `globals.css` (CSS vars остаются, привычны).
- В Tailwind config — алиасы на эти переменные (`colors.brand[500]: 'var(--brand-500)'`). Это даёт **и Tailwind utility-классы, и CSS-переменные** для inline-стилей.
- Шрифты (Plus Jakarta Sans + Inter) — через `next/font/google` в `app/layout.tsx`. Не CDN — будут CLS на проде.

**Почему так:** старые компоненты, написанные на Tailwind, продолжат работать. Новые могут использовать и var(), и utility — что удобнее.

### 2.2 Компонентная библиотека — где живут общие компоненты
**Решение:** `frontend/src/components/ui/` (по аналогии с shadcn).

Базовые: `Button`, `Card`, `Badge`, `Input`, `Select`, `Tabs`, `Avatar`, `Toggle`, `Tooltip`, `Modal`. Плюс продуктовые: `Sidebar`, `Topbar`, `TokenChip`, `UserChip`, `StatCard`, `FilterPill`, `IconTile`, `ChatBubble`.

**Почему так:** SRP-разделение `ui/` (примитивы) vs `components/` (продуктовые компоненты со state/API). Команда легко находит и переиспользует.

### 2.3 Mock-данные vs real API
**Решение:** во время фазы 2 (ключевые экраны) подключаемся **сразу к real API**. Mocks только для новых эндпоинтов, которые делаются параллельно в фазе 3.

**Почему так:** двойная работа (фронт на моках, потом «подключение») съест 30% времени. Лучше идти end-to-end.

### 2.4 Сохраняем ли старые компоненты?
**Решение:** не удалять до конца миграции. Переименовать `DashboardHome.tsx` → `DashboardHome.legacy.tsx`, рядом положить `DashboardHome.v2.tsx`. Feature flag через env (`NEXT_PUBLIC_REDESIGN_V2=true`).

**Почему так:** возможность мгновенно откатить если что-то сломается. На master зальём с флагом `false`, включим на canary, потом 100%.

### 2.5 Существующие тесты
**Решение:** прогон после каждой фазы. Если падают — починить до следующей фазы. Новые тесты — для критичных путей (грейдинг, achievements, payments).

---

## 3. Фаза 0 — Foundation (3–4 дня)

> **Цель:** инфраструктура без которой ничего не построится. **Не меняем ни одной страницы.**

### Deliverables
- [ ] `globals.css` обновлён: все CSS-переменные из `tokens.css` (brand, ink, success/warning/danger/info, radius, shadow, fonts).
- [ ] `tailwind.config.ts` обновлён: алиасы цветов через `var()`, font-families.
- [ ] `app/layout.tsx`: подключение Plus Jakarta Sans + Inter через `next/font/google`.
- [ ] Установлен `lucide-react` (если ещё нет): `npm i lucide-react`.
- [ ] Папка `src/components/ui/` с 12 примитивами (см. ниже).
- [ ] Storybook (опционально) — чтобы показать компоненты в изоляции.

### Компоненты к написанию
| Файл | Props | Источник вёрстки |
|---|---|---|
| `ui/Button.tsx` | variant (primary/secondary/ghost), size (sm/md/lg), icon | `components.css .btn` |
| `ui/Card.tsx` | interactive?, padding | `.card` |
| `ui/Badge.tsx` | variant (brand/success/warning/danger/info/neutral), icon | `.badge` |
| `ui/Input.tsx` | label, hint, error, icon-left, icon-right | `.input + .input-label` |
| `ui/Select.tsx` | options, label | `worksheet.html .select-wrap` |
| `ui/Tabs.tsx` | items, active, onChange | `.s-tabs` / `.cat-tab` |
| `ui/Avatar.tsx` | initials, src, size, gradient | разные мокапы |
| `ui/Toggle.tsx` | checked, onChange, label | `settings.html .switch` |
| `ui/Tooltip.tsx` | content, side | будет нужен |
| `ui/Modal.tsx` | open, onClose, title | существует, переделать |
| `ui/IconTile.tsx` | color (brand/success/warning/info/danger), size | `.icon-tile` |
| `ui/SearchBar.tsx` | placeholder, kbdHint (⌘K) | `.searchbar` |

### Файлы для изменения
```
frontend/src/app/globals.css                  ← добавить CSS-vars
frontend/tailwind.config.ts                   ← алиасы
frontend/src/app/layout.tsx                   ← next/font
frontend/src/components/ui/*.tsx              ← 12 новых файлов
```

### Estimation
- 1 день: токены + Tailwind + шрифты + проверка регрессии на 3 страницах.
- 2–3 дня: 12 примитивов с тестами интерактивности и темы.

### Definition of Done
- Открыли любую существующую страницу — visual diff с продом минимальный.
- В новом компоненте `Button` правильно работают все размеры/варианты/disabled.
- `npm run build` без warnings.

### Риски
- **Конфликт CSS-переменных** с существующими стилями. Митигация: префикс `--brand`, `--ink` уникальный, не пересекается с типовыми именами Tailwind.
- **Шрифт Plus Jakarta** изменит visual всех страниц. Митигация: проверить ключевые страницы (dashboard, login, pricing) — если что-то поехало, оставить старый шрифт на legacy.

---

## 4. Фаза 1 — Layout (3–4 дня)

> **Цель:** новые `Sidebar` + `Topbar` + `DashboardLayout`. Покрывают все учительские страницы за один шаг.

### Deliverables
- [ ] `components/layout/Sidebar.tsx` — с группировкой пунктов меню по разделам.
- [ ] `components/layout/Topbar.tsx` — поиск + чип баланса + уведомления + аватар.
- [ ] `components/layout/DashboardLayout.tsx` — обёртка с sidebar+topbar+content.
- [ ] `components/layout/MobileNav.tsx` — мобильная адаптация (hamburger + drawer).
- [ ] `components/layout/StudentSidebar.tsx` — упрощённый sidebar для ученика.
- [ ] Sidebar читает текущий путь и подсвечивает активный пункт.
- [ ] Баланс токенов в Topbar — реальный, через `useSubscription` hook.
- [ ] Уведомления — счётчик через `useNotifications` hook (если бэк готов) или mock.

### Файлы для изменения
```
frontend/src/components/layout/Sidebar.tsx           ← НОВЫЙ
frontend/src/components/layout/Topbar.tsx            ← НОВЫЙ
frontend/src/components/layout/DashboardLayout.tsx   ← НОВЫЙ
frontend/src/components/layout/MobileNav.tsx         ← НОВЫЙ
frontend/src/components/layout/StudentSidebar.tsx    ← НОВЫЙ
frontend/src/app/dashboard/layout.tsx                ← заменить старый layout
frontend/src/app/student/layout.tsx                  ← заменить старый
```

### Estimation
- 1 день: Sidebar + Topbar (без интеграции уведомлений).
- 1 день: DashboardLayout + StudentSidebar + интеграция с роутом.
- 1 день: мобильная адаптация (≤1023px скрываем сайдбар, hamburger drawer).
- 0.5 дня: интеграция уведомлений и токенов.
- 0.5 дня: регрессионный smoke-тест по всем страницам.

### Definition of Done
- Все существующие страницы (`/dashboard/*`, `/student/*`) рендерятся с новым layout.
- Активный пункт меню подсвечивается.
- На мобиле работает hamburger.
- Topbar показывает реальный баланс и счётчик уведомлений.

### Риски
- **Legacy DashboardLayout сильно завязан на старый sidebar.** Митигация: feature-flag `NEXT_PUBLIC_REDESIGN_V2=true` → новый layout, иначе старый.
- **Breakpoints sidebar/mobile может ломать существующие модалки**. Митигация: первая регрессия — заранее проверить flows регистрации, оплаты, генерации.

---

## 5. Фаза 2 — Ключевые учительские экраны (8–10 дней)

> **Цель:** Dashboard, Tools, Worksheet workspace. После этой фазы виден прогресс — учитель работает на новом UI.

### 5.1 Dashboard (`/dashboard`)

**Файлы:**
- `app/dashboard/page.tsx` (тонкий wrapper)
- `components/dashboard/DashboardHome.v2.tsx` (содержательная часть)
- Новые компоненты: `BentoKpiCard`, `ScheduleStrip`, `RecentMaterials`, `WeeklyChart`, `TokenBalanceCard`

**API:**
- `GET /analytics/teacher-overview` — есть (`pendingGrading`, `schedule`, `atRisk`, `overdue`, `upcoming`, `nudges`).
- `GET /generations/history?limit=4` — есть.

**Сложность:** средняя. Структуру делаем компонентно, KPI карточки переиспользуем.

**Estimation:** 2.5 дня.

### 5.2 Tools (`/dashboard/tools` или `/workspace`)

**Файлы:**
- `app/dashboard/tools/page.tsx` (новый роут или редизайн `/dashboard/ai`)
- `components/tools/ToolCard.tsx`
- `components/tools/CategoryTabs.tsx`
- `components/tools/FeaturedToolHero.tsx` (для «Вау-урок»)

**API:**
- Список инструментов — статический config из `InputComposer/config.ts`.
- Стоимость токенов — через `subscriptions/me/costs` (есть).

**Сложность:** низкая. Чистый каталог.

**Estimation:** 1.5 дня.

### 5.3 Worksheet workspace (`/dashboard/workspace/[tool]`)

**Файлы:**
- `app/dashboard/workspace/[tool]/page.tsx` (новый роут)
- `components/workspace/SettingsPanel.tsx` (slider, chips, presets)
- `components/workspace/LivePreviewPanel.tsx`
- Hook: `useGenerationStream.ts` (live preview по мере набора)

**API:**
- `POST /generate/:tool` — есть.
- `GET /generations/:id/preview` — нужно ли? Зависит от того, успели генерации или нет.

**Сложность:** высокая. Split-workspace с realtime preview.

**Estimation:** 3 дня.

### 5.4 Регрессионная проверка
- Создать рабочий лист → проверить, что появился в истории.
- Сгенерировать тест → скачать PDF → открыть.
- Залогиниться как ученик → увидеть выданный материал.

**Estimation:** 1 день.

### Итого Фаза 2: **8 дней**

---

## 6. Фаза 3 — Backend foundation (5–7 дней)

> **Цель:** новые модули и эндпоинты, без которых нельзя сделать аналитику, achievements, ai-grading.

### 6.1 Модуль Gamification (новый)

**Зачем:** студенческие streak, XP, achievements, leaderboard.

**Структура:**
```
backend/src/modules/gamification/
├── gamification.module.ts
├── gamification.service.ts
├── gamification.controller.ts
├── achievements.config.ts        ← каталог ачивок
└── dto/
```

**Prisma schema (миграция `20260615_add_gamification`):**
```prisma
model StudentProfile {
  id              String   @id @default(uuid())
  userId          String   @unique
  xp              Int      @default(0)
  level           Int      @default(1)
  streakDays      Int      @default(0)
  lastActivityAt  DateTime?
  user            AppUser  @relation(fields: [userId], references: [id])
  achievements    StudentAchievement[]
  @@map("student_profiles")
}

model AchievementCatalog {
  id          String   @id           // e.g. "streak_7", "100_xp", "first_5"
  title       String
  description String
  icon        String   // lucide name
  category    String   // 'streak'/'volume'/'quality'
  xpReward    Int      @default(0)
  @@map("achievement_catalog")
}

model StudentAchievement {
  id           String   @id @default(uuid())
  profileId    String
  achievementId String
  unlockedAt   DateTime @default(now())
  profile      StudentProfile @relation(fields: [profileId], references: [id])
  catalog      AchievementCatalog @relation(fields: [achievementId], references: [id])
  @@unique([profileId, achievementId])
  @@map("student_achievements")
}
```

**Endpoints:**
- `GET /gamification/me` → `{ xp, level, streakDays, recentAchievements, nextAchievement }`.
- `POST /gamification/event` (internal) — вызывается из submission.service после оценки → начисляет XP, проверяет ачивки.
- `GET /gamification/leaderboard?classId=...&period=week|month|all` → топ-5 по XP.

**Estimation:** 2 дня.

### 6.2 Расширенная Analytics

**Что добавить:**
- `GET /analytics/heatmap?classId=...&weeks=12` → матрица 5×12 для heatmap (используется в `analytics.html`).
- `GET /analytics/students?classId=...` → список учеников с avg-grade, submission-rate, last-active.
- `GET /analytics/topic-difficulty?classId=...&subjectId=...` → темы где класс «провисает» (bars chart в `analytics.html`).
- `GET /analytics/grade-distribution?classId=...&period=month` → donut chart (5/4/3/2 распределение).

**Estimation:** 1.5 дня.

### 6.3 AI Grading Assistant — расширение

Существует `POST /submissions/:id/ai-feedback` который даёт общий комментарий. Для нового UI нужны **per-question** подсказки:

- `POST /submissions/:id/ai-suggest` → `{ perAnswer: [{ correct: bool, hint: string, severity: 'ok'|'warn'|'error' }] }`

**Estimation:** 1 день.

### 6.4 Notifications module + WebSocket/SSE

Базовая модель `Notification` есть. Нужно:
- `GET /notifications/me?cursor=...` → пагинация
- `POST /notifications/me/:id/read`
- `POST /notifications/me/read-all`
- SSE endpoint `/notifications/stream` для push (или короткие polls — проще)

**Estimation:** 1 день.

### 6.5 Calendar events (вынести из lessons)

Сейчас события календаря дёргаются через `/lessons/calendar/events`. Это работает, но если планируется отдельный `EventModule` (с разными типами событий — не только уроки) — выделить отдельно.

**Решение:** не вижу необходимости. Оставить как есть, расширить если понадобится.

**Estimation:** 0 дней.

### Итого Фаза 3: **5–6 дней**

### Definition of Done
- Все 4 эндпоинта аналитики работают на realных данных.
- Gamification модуль выдаёт XP и стрики при оценке submission.
- Регресс-тест: оценка работы → XP начисляется → ачивка «5 работ подряд» открывается.

---

## 7. Фаза 4 — Учительские экраны (полностью) (10–14 дней)

### 7.1 Materials (`/dashboard/courses`)
**Изменения:** view-toggle (cards/list), фильтры-пилюли по предмету/классу, cover-цвета по предмету.
**API:** `GET /courses` — есть, нужно отдать `subject` и `coverColor`.
**Estimation:** 1.5 дня.

### 7.2 Class Detail (`/dashboard/courses/[id]`)
**Изменения:** tabs (Материалы/Ученики/Задания), hero с class-stats, at-risk блок.
**API:** существующий + at-risk через `/analytics/students`.
**Estimation:** 2 дня.

### 7.3 Students (`/dashboard/students`)
**Изменения:** at-risk баннер, status-dots, KPI колонки (avg-grade, % submitted), фильтры.
**API:** `/analytics/students` (новый из Фазы 3).
**Estimation:** 1.5 дня.

### 7.4 Grading (`/dashboard/grading`) — НОВЫЙ
**Изменения:** трёхколоночный workspace (очередь | работа | grading panel с AI).
**API:** `GET /submissions?status=pending`, `POST /submissions/:id/ai-suggest` (новый), `PATCH /submissions/:id/grade`.
**Estimation:** 3 дня.

### 7.5 Analytics (`/dashboard/analytics`) — НОВЫЙ
**Изменения:** период-фильтр, KPI, line chart (SVG), heatmap, donut, table.
**API:** новые из Фазы 3.
**Estimation:** 2.5 дня.

### 7.6 Calendar (`/dashboard/calendar`)
**Изменения:** week/day/month view-switch, time-grid, цветные слоты.
**API:** существующий `/lessons/calendar/events`.
**Estimation:** 2 дня.

### 7.7 Referrals (`/dashboard/referrals`)
**Изменения:** 4 тира, реф-ссылка с copy, social share, KPI.
**API:** существующий.
**Estimation:** 1.5 дня.

### 7.8 Settings (`/dashboard/settings`)
**Изменения:** левая sub-navigation + панели (Profile/Notifications/Subscription/Integrations/API/Danger).
**API:** все есть. Notifications settings нужно проверить.
**Estimation:** 2 дня.

### 7.9 Pricing (`/pricing`)
**Изменения:** billing toggle, 4-колоночный grid, FAQ.
**API:** subscriptions plans (есть).
**Estimation:** 1 день.

### 7.10 Login (`/login`)
**Изменения:** split-screen, social buttons (Telegram/MAX deep-link).
**API:** существующий auth.
**Estimation:** 1 день.

### Итого Фаза 4: **18 дней** (но многое параллелится — реально **10–14 дней**)

---

## 8. Фаза 5 — Студенческий интерфейс (5–7 дней)

### 8.1 Student Dashboard
**Изменения:** greeting hero, streak chip, группировка по срочности (срочно/неделя/проверка/завершено/просрочено).
**API:** `/students/me`, `/submissions/my`, `/gamification/me`.
**Estimation:** 1.5 дня.

### 8.2 Student Assignment View (`/student/assignments/[id]`)
**Изменения:** аккордеоны материалов, прогресс-бар, sticky submit-bar с автосейвом.
**API:** существующий.
**Estimation:** 2 дня.

### 8.3 Student Grades (`/student/grades`)
**Изменения:** KPI cards, bars по предметам, ачивка-баннер.
**API:** существующий + `/gamification/me` + `/analytics/student-subjects`.
**Estimation:** 1.5 дня.

### 8.4 AI Teacher (`/student/ai-teacher`)
**Изменения:** sidebar истории, quick prompts, msg actions (copy/regen/feedback).
**API:** существующий + (опционально) перенос истории из localStorage в БД (новая таблица).
**Estimation:** 1 день.

### 8.5 Notifications (`/student/notifications`) — НОВЫЙ
**Estimation:** 0.5 дня.

### 8.6 Achievements (`/student/achievements`) — НОВЫЙ
**API:** `/gamification/me` + `/gamification/leaderboard`.
**Estimation:** 1 день.

### Итого Фаза 5: **7.5 дня**

---

## 9. Фаза 6 — Полировка (3–5 дней)

### Что добавляем
1. **Cmd+K глобальный поиск** — модал с поиском по материалам, ученикам, классам, темам.
   - API: `GET /search?q=...` (новый).
   - **Estimation:** 1.5 дня (бэк + фронт).
2. **Тёмная тема** — токены уже подготовлены (slate scale + brand).
   - **Estimation:** 1 день.
3. **Мобильная адаптация** — пройтись по всем страницам на 375px и 768px.
   - **Estimation:** 1 день.
4. **Регрессии и баги** — буфер.
   - **Estimation:** 1 день.

---

## 10. Сводная оценка

| Фаза | Срок | Что разблокирует |
|---|---|---|
| 0. Foundation | 3–4 дня | Всё остальное |
| 1. Layout | 3–4 дня | Все экраны получают новый shell |
| 2. Ключевые учительские | 8–10 дней | Учитель видит новый UI на главных экранах |
| 3. Backend foundation | 5–7 дней | Аналитика, achievements, ai-grading |
| 4. Учительские полностью | 10–14 дней | Учитель работает в новом UI на 100% |
| 5. Студенческий | 5–7 дней | Студенты онлайн в новом UI |
| 6. Полировка | 3–5 дней | Кейсы edge, мобилка, темная тема |
| **Итого** | **37–51 день** | |

**Реалистично:** **8–10 недель** одним инженером, **5–6 недель** двумя (бэк + фронт параллельно), **3–4 недели** командой из 3 (бэк + фронт + QA).

---

## 11. Риски и митигации

| Риск | Серьёзность | Митигация |
|---|---|---|
| Ломается продакшен (платежи, боты) во время миграции | **Critical** | Feature flag `NEXT_PUBLIC_REDESIGN_V2`. На master флаг = false, на canary = true. Раскатывать по 10% трафика. |
| Студенты теряют XP/streak при первом подключении gamification | High | Миграция: при создании `StudentProfile` подсчитать историческое XP из всех успешных submissions. Не начинать с нуля. |
| AI grading suggestion ошибается часто — учителя начинают игнорировать | Medium | Не показывать «error/warn» — только «hint» (мягко). Метрика: % правок учителем AI-комментария. |
| Tailwind конфликт со старыми компонентами (legacy + v2) | Medium | Префикс CSS-vars `--brand-*` уникален. Keep both — пока не удалим legacy окончательно. |
| Учителя путаются между legacy и v2 во время gradual rollout | Medium | A/B-тест на 10%, мониторим NPS. Если просадка — rollback. |
| Студенты теряют localStorage AI-chat истории | Low | Сделать миграцию: при первом входе в новый UI забрать из localStorage и сохранить в БД (если решим переносить). |
| Аналитика тормозит на больших классах | Medium | Кэширование heatmap (10 мин TTL в Redis). Materialized view в Postgres. |

---

## 12. Что НЕ входит в этот план

- **Тёмная тема для PDF-экспортов** — отдельная тема.
- **Мобильное приложение** (React Native) — только адаптивный web.
- **Многоязычность** (i18n) — все тексты сейчас на русском, хардкод.
- **Перенос AI-chat истории в БД** — пока остаётся в localStorage. Если решите переносить — это +2 дня.
- **Внутренние тесты A/B на креативах** для рекламы — это marketing, не product.

---

## 13. Чек-листы делегируемости

Если делегируем команде или нескольким контракторам, вот как режется работа на independent streams.

### Stream A: Frontend Foundation (1 инженер)
- Фаза 0 целиком.
- Фаза 1 целиком.
- Mobile responsive по всем экранам в Фазе 6.

### Stream B: Backend (1 инженер)
- Фаза 3 целиком.
- AI grading suggestions для Фазы 4.7 (`grading.html`).
- Cmd+K search endpoint в Фазе 6.

### Stream C: Frontend pages (1 инженер, можно дробить)
- Фаза 2: Dashboard, Tools, Worksheet workspace.
- Фаза 4: 10 учительских страниц (можно делить между двумя людьми).
- Фаза 5: 6 студенческих страниц.

### Stream D: QA (0.5 FTE на протяжении всего проекта)
- Регрессионные тесты после каждой фазы.
- Smoke-test критичных flows (оплата, генерация, отправка задания).

---

## 14. Что после завершения миграции (cleanup, 2 дня)

1. Удалить `*.legacy.tsx` файлы.
2. Удалить feature-флаг `NEXT_PUBLIC_REDESIGN_V2`.
3. Удалить старые CSS-стили из `globals.css` если они уже не используются.
4. Архивировать `frontend-redesign-v2/` (или оставить как docs reference).
5. Обновить `README.md` и `docs/ARCHITECTURE.md`.

---

## 15. Решения, нужные от тебя ДО старта

1. ✅ Куда коммитить — **worktree** (выбрано).
2. ✅ Стратегия — **детальный план** (вот этот документ).
3. ❓ **Кто делает работу?** Я сам в этой сессии (стадиями), или твоя команда параллельно? Если команда — план готов к разрезу по stream A/B/C/D.
4. ❓ **Feature flag или сразу боевая раскатка?** Если боевая — нужен полный регресс QA после каждой фазы.
5. ❓ **Перенос AI-chat истории** в БД (+2 дня) или оставляем localStorage (бесплатно)?
6. ❓ **Достижения** — стартуем с нуля или мигрируем историческое XP из existing submissions? Я бы голосовал за миграцию — иначе все ученики «новички» в день деплоя.
7. ❓ **Cmd+K поиск** — нужен в первом релизе или это позже?

---

> **Документ держим в актуальном виде.** При изменении объёма — пересчитываем оценки. При изменении приоритетов — переформируем фазы.

> **Следующий шаг:** жду решения по пунктам 3–7 выше. Дальше выбираем фазу для старта и я начинаю реализацию (или передаю чек-листы команде).
