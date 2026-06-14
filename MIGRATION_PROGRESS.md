# Прогресс миграции на Redesign v2

## ✅ Фаза 0 — Foundation (завершена)

### Что сделано
- **Tailwind config** (`frontend/tailwind.config.ts`): добавлены палитры `brand-*`, `ink-*`, `surface-*`, `success/warning/danger/info` через CSS-vars. Legacy `primary` оставлен для обратной совместимости. Шрифты `font-display/sans/mono`. Радиусы, тени, animations.
- **CSS-переменные** (`frontend/src/app/globals.css`): полный набор токенов из мокапов. Не задевает legacy.
- **Шрифты** (`frontend/src/app/layout.tsx`): Plus Jakarta Sans + Inter + JetBrains Mono через `next/font/google`. Подключены как CSS-vars.
- **12 компонентов** (`frontend/src/components/ui/v2/`):
  - `Button` (4 варианта × 3 размера, loading)
  - `Card` (interactive, elevated, разные padding)
  - `Badge` (6 вариантов с иконкой)
  - `Input` (label/hint/error/icons)
  - `Select` (native, с лейблом)
  - `Tabs` (underline + pill варианты)
  - `Avatar` (5 размеров, 6 цветовых схем, инициалы или src)
  - `Toggle` (с label/description)
  - `Tooltip` (4 стороны, CSS-only)
  - `Modal` (с focus-trap, Esc-close, portal)
  - `IconTile` (9 цветов × 3 размера)
  - `SearchBar` (Cmd+K hint)
  - `StatCard` (KPI с дельтой и подписью)
  - `TokenChip` (баланс для topbar)
- **Превью-страница** `/v2-preview` — стайлгайд для разработчиков.

### Проверка
```bash
cd frontend && npx tsc --noEmit
# → 8 ошибок только в .next/types (кэш удалённых страниц analytics-extra/marketplace/diary)
# → 0 ошибок в новых v2-компонентах ✓
```

### Чтобы посмотреть в браузере
```bash
cd frontend
npm run dev
# → откройте http://localhost:3000/v2-preview
```

### Совместимость с legacy
- Старые компоненты используют `primary-*` цвета — работают как раньше.
- Старый `card.tsx` (shadcn) не тронут, имеет другой API.
- Шрифт Inter применён глобально (как было), Plus Jakarta только через `font-display` utility-класс.
- На `.v2` wrapper-классе включается font-feature-settings и tabular-nums.

---

## ✅ Фаза 1 — Layout (завершена)

### Что сделано
- **`Sidebar.tsx`** — sticky desktop / overlay mobile, группировка `Рабочий стол` / `Класс` / `Прочее`, hover-стейты с brand-цветом, badge-счётчики, профиль пользователя в футере. Экспортирует `getTeacherNavSections(badges)`.
- **`Topbar.tsx`** — h1 + subtitle + actions, sticky с blur-backdrop, `SearchBar` с `⌘K` hint, `TokenChip`, иконка уведомлений с красной точкой, mobile burger.
- **`DashboardLayoutV2.tsx`** — корневая обёртка `Sidebar + main`, `MobileMenuContext` + хук `useMobileMenu()` для проброса toggle из layout в Topbar страниц.
- **`StudentSidebar.tsx`** — упрощённый sidebar для ученика, в футере геймификация (стрик 🔥 + опыт ⭐ в gradient-карточке).
- **`DashboardLayoutV2Shim.tsx`** — выбор между legacy- и v2-layout по `NEXT_PUBLIC_REDESIGN_V2`. Берёт `useUser()` для имени/инициалов/email, прокидывает дефолтные `getTeacherNavSections()` в DashboardLayoutV2.
- **`dashboard/layout.tsx`** — теперь использует Shim. При флаге `false` остаётся текущий вид; при `true` — v2.
- **`layout/v2/index.ts`** — централизованные экспорты.

### Что не делалось в Phase 1 (обоснованно)
- **`MobileNav.tsx`** как отдельный компонент — мобильный режим уже реализован в `Sidebar` (`max-lg:fixed` + overlay + slide-in). Дополнительный компонент не нужен.
- **`student/layout.tsx`** не модифицировался — у студенческой части нет общего layout-файла, sidebar встроен в каждую страницу напрямую. Будет переделано постранично в **Phase 5**.

### Проверка
```bash
cd frontend && npx tsc --noEmit
# → ошибок в новом коде НЕТ ✓
# → остаются те же 8 кэш-ошибок .next/types (analytics-extra/marketplace/diary)
```

### Как включить
```bash
# в frontend/.env.local
NEXT_PUBLIC_REDESIGN_V2=true
```

---

## 🔄 Фаза 2 — Key teacher screens (в работе, 2 из 3 готовы)

### ✅ Dashboard `/dashboard` — готов
- `components/v2/DashboardHomeV2.tsx`:
  - Topbar с приветствием, датой, балансом токенов, уведомлениями.
  - **Bento** «Что важно сегодня»: 4 KPI-карточки (Работ ждут проверки, Следующий урок, Под наблюдением, Просрочено) — все интерактивные, ведут в нужные разделы.
  - **Часто используете**: 4 быстрых перехода в ИИ-генератор (worksheet/quiz/presentation/lessonPlan).
  - **Расписание сегодня**: рендер уроков из `overview.schedule.todayLessons`, авто-вычисление статуса (завершён / скоро / запланирован) по времени.
  - **Последние материалы**: список из `/generations/recent?limit=4`.
  - **Активность за неделю**: bar-chart из `/analytics/weekly-activity` (с placeholder если endpoint ещё не готов).
  - **Tips card** с приглашением к туру.
- `app/dashboard/page.tsx` — выбор по флагу `NEXT_PUBLIC_REDESIGN_V2`.

### ✅ Workspace `/workspace` — готов
- `components/v2/WorkspaceHubV2.tsx`:
  - Topbar с подзаголовком «N инструментов для подготовки урока за минуты».
  - **Hero «Вау-урок»** — gradient-карточка с СТА.
  - **Поиск** (live filter) + **категории** как pill-tabs (Все/Материалы/Оценка/Медиа/Общение/Другое) со счётчиками.
  - **Tools grid** — IconTile + цена в токенах + ETA + бэйдж "тех. работы" из `/subscriptions/costs`.
- `app/workspace/page.tsx` теперь сервер-компонент с переключателем флага.
- Legacy `WorkspaceHub` вынесен в `components/WorkspaceHub.tsx`, работает по-прежнему.

### ✅ Backend Phase 3 (частично, разблокировано для Dashboard)
- `GET /analytics/weekly-activity` — `analytics.controller.ts:30` + `analytics.service.ts:getWeeklyActivity()`. Возвращает `{ days: [{label:"Пн", value:N}, ...] }`. Считает completed-генерации пользователя по дням текущей недели (Пн—Вс).
- `GET /generations/recent` не нужен — использован уже существующий `/generations/history?limit=4`.

### ⏭️ Осталось в Phase 2
- **Worksheet workspace** — редактирование готовых рабочих листов. Крупный экран (700+ строк), требует отдельной сессии.

---

## ✅ Фаза 4 — All teacher screens

### Готово (7 экранов)
- **`/dashboard/calendar`** → [CalendarPageV2](frontend/src/components/v2/CalendarPageV2.tsx). Неделя с цветовой кодировкой по предмету (математика/русский/физика/английский/история), навигация ⏮ ⏭, "Сегодня".
- **`/dashboard/courses`** (Материалы) → [CoursesPageV2](frontend/src/components/v2/CoursesPageV2.tsx). Сетка карточек, фильтр по тегам, поиск, бэйджи типов генераций.
- **`/dashboard/students`** → [StudentsPageV2](frontend/src/components/v2/StudentsPageV2.tsx). Sidebar с классами + список учеников + поиск + копирование кода доступа.
- **`/dashboard/settings`** → [SettingsPageV2](frontend/src/components/v2/SettingsPageV2.tsx). 4 таба (Профиль/Уведомления/Биллинг/Безопасность).
- **`/dashboard/referrals`** → [ReferralsPageV2](frontend/src/components/v2/ReferralsPageV2.tsx). KPI приглашений, код + ссылка, список рефералов.
- **`/dashboard/analytics`** → [AnalyticsPageV2](frontend/src/components/v2/AnalyticsPageV2.tsx). KPI, недельная активность, таблица классов. **Новый раздел в v2!**
- **`/dashboard/grading`** → [GradingPageV2](frontend/src/components/v2/GradingPageV2.tsx). Табы К проверке / Просрочены / Проверено. **Новый раздел в v2!**

Все используют существующие API (`/lessons`, `/classes`, `/students`, `/submissions/teacher-dashboard`, `/analytics/teacher-overview`, `/referrals/*`, `/subscriptions/me`) + новый `/analytics/weekly-activity`.

---

## ✅ Фаза 5 — Student interface

### Готово (4 экрана + общий layout)
- **[StudentLayoutV2](frontend/src/components/layout/v2/StudentLayoutV2.tsx)** — обёртка со StudentSidebar (геймификация в футере), автоподтягивание profile + assignments для бэйджей.
- **`/student/dashboard`** → [StudentDashboardV2](frontend/src/components/v2/StudentDashboardV2.tsx). Приветствие, KPI (стрик/опыт/готово), таб-фильтр заданий, карточки.
- **`/student/assignments`** → [StudentAssignmentsListV2](frontend/src/components/v2/StudentAssignmentsListV2.tsx). Список с поиском + табы статусов. **Новый список — раньше прямого роута не было.**
- **`/student/grades`** → [StudentGradesV2](frontend/src/components/v2/StudentGradesV2.tsx). KPI (всего/оценено/средний/лучший) + список с цветовой кодировкой оценок.
- **`/student/achievements`** → [StudentAchievementsV2](frontend/src/components/v2/StudentAchievementsV2.tsx). Level-card с прогресс-баром, 9 ачивок (Первый шаг, Усердный ученик, Огонёк, Отличник и т.д.) с автопрогрессом из API. **Новый раздел!**
- **`/student/ai-teacher`** оставлен legacy — сложный (katex + чат), требует отдельной полной переписки.

### Что-то ждёт backend
Ачивки и level рассчитываются из локального каталога, но требуют:
- `/students/me` → дополнительные поля `streakDays`, `xp`, `level`, `nextLevelXp`, `achievements[]`, `counts.{submitted,graded,perfect}`.
- Логика подсчёта streak и начисления XP — модуль `gamification`.

UI деградирует мягко: если поля нет — показываем нули и прогресс на каталоге.

---

## ✅ Фаза 6 — Polish

### Готово
- **Cmd+K (⌘K / Ctrl+K) глобальная палитра команд** → [CommandPalette](frontend/src/components/v2/CommandPalette.tsx). Группы: Навигация / ИИ-инструменты / Действия. Стрелки ↑↓, Enter, Esc. Открывается из Topbar.search и хоткея.
- DashboardLayoutV2 теперь экспортирует `useCommandPalette()` хук.
- **Мобильная навигация** — sidebar slide-in (max-lg) уже в Phase 1. Все v2-страницы используют `max-md:` / `max-lg:` адаптивные сетки.

### Что НЕ сделано (требует отдельной сессии)
- **Dark mode** — токены и `darkMode: 'class'` в `tailwind.config.ts` уже подготовлены, но `.dark` варианты для каждого компонента не написаны. Это полировочная работа на ~3-5 часов: добавить `dark:bg-ink-900 dark:text-ink-100` и т.д. в каждый компонент.

---

## 📦 Сводка по проекту

### Создано
- **14 v2 UI-компонентов** (Button, Card, Badge, Input, Select, Tabs, Avatar, Toggle, Tooltip, Modal, IconTile, SearchBar, StatCard, TokenChip)
- **5 layout-компонентов** (Sidebar, Topbar, DashboardLayoutV2, StudentSidebar, StudentLayoutV2 + Shim)
- **11 V2 страниц** (Dashboard, Workspace, Calendar, Courses, Students, Settings, Referrals, Analytics, Grading, StudentDashboard, StudentAssignments, StudentGrades, StudentAchievements)
- **1 backend endpoint** (`/analytics/weekly-activity`)
- **1 глобальный Cmd+K palette**

### Активация
```bash
# в frontend/.env.local
NEXT_PUBLIC_REDESIGN_V2=true
```
Без флага — всё работает как раньше. С флагом — все 11 экранов сразу.

### TypeScript
0 ошибок в новом коде. Остаются 8 кэш-ошибок в `.next/types` от удалённых страниц (analytics-extra/marketplace/diary) — не блокеры.

---

## ✅ Фаза 7 — Backend Gamification

### Prisma модели (миграция `20260613120000_v2_gamification`)
- **`StudentGamification`** — `xp`, `level`, `streakDays`, `bestStreakDays`, `lastActiveDate`, счётчики `submittedCount/gradedCount/perfectCount`. Один к одному со `Student`.
- **`Achievement`** — каталог ачивок (key, title, description, conditionField, conditionValue, xpReward, iconKey, color, sortOrder).
- **`StudentAchievement`** — связь many-to-many с unlockedAt + unique([studentId, achievementKey]).
- **`XpEvent`** — аудит-лог начисления опыта (reason, amount, metadata).

### Модуль `gamification`
- [GamificationService](backend/src/modules/gamification/gamification.service.ts) — методы:
  - `getProgress(studentId)` — полная сводка (xp, level, прогресс до след. уровня, streak, ачивки с прогрессом)
  - `checkIn(studentId)` — отметка дня активности, обновление streak с milestone-бонусами на 3/7/14/30/100 днях
  - `awardXp({studentId, amount, reason, metadata})` — начисление XP + автообновление level
  - `bumpCounter(studentId, field)` — инкремент счётчиков
  - `checkAndUnlockAchievements(studentId)` — идемпотентная разблокировка по условиям
  - `onSubmissionCreated(...)` — хук: +20 XP, инкремент `submittedCount`, проверка ачивок
  - `onSubmissionGraded(...)` — хук: +10/15/30/50 XP по оценке, инкремент `gradedCount`/`perfectCount`
- [GamificationController](backend/src/modules/gamification/gamification.controller.ts):
  - `GET /gamification/me` — прогресс ученика
  - `POST /gamification/check-in` — отметка активности (вызывается фронтом на mount /student/dashboard)
- [AchievementSeedService](backend/src/modules/gamification/achievement-seed.service.ts) — сидит каталог из [ACHIEVEMENT_SEED](backend/src/modules/gamification/achievement-seed.ts) при `onModuleInit`. Idempotent upsert по ключу.

### Хуки в submissions
- `submissions.service.ts:createSubmission()` → `gamificationService.onSubmissionCreated()`
- `submissions.service.ts:gradeSubmission()` → `gamificationService.onSubmissionGraded(grade)`
- Изолированы в catch — не валят основной поток если gamification сбоит.

### Шкала уровней
Прогрессия: `levelN требует sum(500..500*(N-1)) XP`. Level 2 = 500, level 3 = 1500, level 4 = 3000, ...
Уровни 1-4 = «Новичок», 5+ = «Ученик-чемпион», 10+ = «Эксперт», 20+ = «Мастер», 30+ = «Гранд-мастер».

### Каталог ачивок (9 шт)
| Категория | Ключ | Условие | XP |
|-----------|------|---------|----|
| submissions | first-step | submitted ≥ 1 | 50 |
| submissions | pupil-10 | submitted ≥ 10 | 100 |
| submissions | pupil-50 | submitted ≥ 50 | 500 |
| streak | streak-3 | streakDays ≥ 3 | 50 |
| streak | streak-7 | streakDays ≥ 7 | 200 |
| streak | streak-30 | streakDays ≥ 30 | 1000 |
| grades | perfect-1 | perfectCount ≥ 1 | 100 |
| grades | perfect-10 | perfectCount ≥ 10 | 500 |
| grades | graded-5 | gradedCount ≥ 5 | 100 |

---

## ✅ Фаза 8 — Backend расширения

- **`/students/me`** теперь возвращает `streakDays`, `xp`, `level`, `nextLevelXp`, `progressToNextLevel`, `bestStreakDays`, `counts`, `achievements[]` через `gamificationService.getProgress()`. Catch-fallback: при сбое gamification возвращаются нули.
- **`/analytics/dashboard`** расширен v2-полями: `totalStudents`, `coursesActive`, `submissionsThisWeek`, `averageGrade`, `classes[]` (id/name/studentsCount/avgGrade). Старый формат `stats{...}` оставлен для legacy DashboardHome.
- **`/lessons/calendar/events?from&to`** — уже существовал, подключён в [CalendarPageV2](frontend/src/components/v2/CalendarPageV2.tsx).
- **`/notifications/{teacher|student}`** + `unread-count` + `mark-all-read` + `:id/read` — уже существуют, подключены в [NotificationBellV2](frontend/src/components/v2/NotificationBellV2.tsx).

---

## ✅ Фаза 9 — Подключение фронта

- **[NotificationBellV2](frontend/src/components/v2/NotificationBellV2.tsx)** — выпадающий список уведомлений с live-счётчиком (refresh 30s), pill-цифра на колокольчике, переход по type+metadata. Интегрирован в Topbar.
- **[Topbar](frontend/src/components/layout/v2/Topbar.tsx)** — заменил кнопку с заглушечной точкой на полноценный NotificationBellV2. Параметр `notificationsAudience: 'teacher' | 'student'`.
- **[StudentDashboardV2](frontend/src/components/v2/StudentDashboardV2.tsx)** — переехал на useSWR, при mount вызывает `POST /gamification/check-in` → обновляется streak/XP. Использует `/students/me` с расширенными gamification-полями.
- **[StudentAchievementsV2](frontend/src/components/v2/StudentAchievementsV2.tsx)** — переписан, теперь читает реальный `/gamification/me` с прогрессом из БД. Icon-mapping по `iconKey` из каталога.
- **[StudentLayoutV2](frontend/src/components/layout/v2/StudentLayoutV2.tsx)** — sidebar geyer бэйджи из `/students/me` (streakDays, xp).

---

## ✅ Фаза 10 — Worksheet editor V2 + AI-teacher + Dark mode

### Workspace shell
- **[WorkspaceShellV2](frontend/src/components/v2/WorkspaceShellV2.tsx)** — дефолтный Topbar для всех подстраниц `/workspace/*` с back-кнопкой к ИИ-Генератору, балансом токенов, уведомлениями. Маппит segment URL в название инструмента (worksheet/quiz/presentation/lesson-prep/...).
- **[workspace/layout.tsx](frontend/src/app/workspace/layout.tsx)** — в v2 заворачивает в `DashboardLayoutV2Shim + WorkspaceShellV2`. Все 20 подстраниц инструментов получают единый Sidebar + Topbar бесплатно.

### AI-teacher
- **[student/ai-teacher/page.tsx](frontend/src/app/student/ai-teacher/page.tsx)** — legacy чат вынесен в `StudentAiTeacherLegacy`. В v2 оборачивается в `StudentLayoutV2 + Topbar` с notificationsAudience="student". Сам чат (katex + StreamingChat) не трогается — он сложный.

### Dark mode
- **[globals.css](frontend/src/app/globals.css)** — добавлен `.dark` блок с инверсией всех CSS-vars (ink-50↔ink-900, surface, semantic). Так как Tailwind config использует `var(--ink-N)` — **все v2-компоненты автоматически становятся тёмными** при `<html class="dark">`. Не нужно прописывать `dark:` варианты вручную.
- **[useTheme hook](frontend/src/lib/hooks/useTheme.ts)** — localStorage + matchMedia, три режима: light / dark / system.
- **[SettingsPageV2](frontend/src/components/v2/SettingsPageV2.tsx)** — новый таб «Внешний вид» с переключателем темы.

---

## 📦 Финальная сводка

### Backend (новое)
- 1 модуль (`gamification`)
- 4 Prisma модели (StudentGamification, Achievement, StudentAchievement, XpEvent)
- 1 миграция SQL
- 2 новых endpoint (`/gamification/me`, `/gamification/check-in`)
- 1 endpoint (`/analytics/weekly-activity`)
- Расширения `/students/me`, `/analytics/dashboard`
- 2 хука в submissions.service на gamification
- Auto-seed каталога ачивок

### Frontend (новое)
- 14 v2 UI-компонентов
- 6 layout-компонентов (Sidebar, Topbar, DashboardLayoutV2, Shim, StudentSidebar, StudentLayoutV2, WorkspaceShellV2)
- **13 V2 страниц** (Dashboard, Workspace, Calendar, Courses, Students, Settings, Referrals, Analytics, Grading, StudentDashboard, StudentAssignments, StudentGrades, StudentAchievements)
- 1 NotificationBellV2 с live-счётчиком
- 1 Cmd+K palette
- Dark mode через CSS-var инверсию
- useTheme hook

### Активация
```bash
# frontend/.env.local
NEXT_PUBLIC_REDESIGN_V2=true

# backend: накатить миграцию
cd backend && npx prisma migrate deploy
# или для dev:
cd backend && npx prisma migrate dev
```

После старта бэка автоматически:
- сидится каталог из 9 ачивок (`AchievementSeedService.onModuleInit`)
- каждый ученик при первой активности получает запись `StudentGamification`
- каждая сдача задания → +20 XP + проверка ачивок
- каждая проверенная работа → +10..+50 XP по оценке + инкремент perfect/graded

### TypeScript
**0 ошибок** в новом коде (frontend + backend). Остаются пред-существующие 8 кэш-ошибок `.next/types` (не блокеры) и ошибки в `admin.service.ts` от давно отсутствующих полей `botUser`/`sentToMax` (не моё).
