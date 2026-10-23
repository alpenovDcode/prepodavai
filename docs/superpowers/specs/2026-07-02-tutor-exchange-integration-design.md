# Биржа лидов — интеграция в prepodavai (design spec)

**Дата**: 2026-07-02
**Автор**: brainstorming-сессия с ruslanalpenov
**Статус**: утверждён к реализации

## 1. Контекст и цель

MVP биржи лидов между репетиторами построен в `tutor-leads/mvp` (standalone Next.js 16 + SQLite). Модель проверена: заявка → отклик → пробный урок → двухшаговая оплата → закрытие с передачей контакта; плюс жалобы, лимит 5 диалогов, блок за просрочки, взаимный рейтинг, модерация чата.

Цель — перенести всё это в **prepodavai** как первоклассный модуль. Причины: единый auth (JWT), единые уведомления (in-app + Telegram), единая БД, единый деплой, отсутствие psychological switch «ушёл на другой сервис».

## 2. Утверждённые решения

| Развилка | Решение |
|---|---|
| Аудитория | Любой `AppUser` видит биржу (без роли/opt-in) |
| Скоуп v1 | Все 12 фич MVP; оплата — «на слово» (без реального эскроу) |
| Точка входа UX | Пункт в сайдбаре dashboard V2 → `/dashboard/leads` |
| Уведомления | In-app (`NotificationsService`) + Telegram (`TelegramService` → `BotUser.telegramId`) |
| Rollout | Глобальный переключатель в админ-панели по образцу maintenance-mode (per-tool через `opKey`) |
| Архитектура | Нативная интеграция как модуль prepodavai (не standalone/поддомен) |

## 3. Модель данных

Новые таблицы в общий `backend/prisma/schema.prisma`. Репутационные поля выделены в `TutorMarketProfile` (1:1 к `AppUser`) — не пухнет главная таблица, легко отключить.

```prisma
model TutorMarketProfile {
  id             String   @id @default(uuid())
  userId         String   @unique
  user           AppUser  @relation(fields: [userId], references: [id], onDelete: Cascade)
  avgPrice       Float    @default(0)
  experience     Int      @default(0)
  ratingAvg      Float    @default(5.0)
  ratingCount    Int      @default(0)
  dealsCompleted Int      @default(0)
  disabledAt     DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model Lead {
  id             String   @id @default(uuid())
  creatorId      String
  creator        AppUser  @relation("leadCreator", fields: [creatorId], references: [id])
  subject        String
  subjectLower   String
  grade          String
  format         String   // ONLINE | OFFLINE
  city           String?
  description    String
  studentContact String   // скрыт до CLOSED
  type           String   // FREE | COMMISSION
  price          Float    @default(0)
  status         String   @default("ACTIVE") // ACTIVE | LOCKED | CLOSED | CANCELLED
  lockedById     String?
  lockedAt       DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  dialogs LeadDialog[]

  @@index([status, subjectLower])
  @@index([creatorId])
}

model LeadDialog {
  id                        String   @id @default(uuid())
  leadId                    String
  lead                      Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  responderId               String
  responder                 AppUser  @relation("dialogResponder", fields: [responderId], references: [id])
  status                    String   @default("OPEN") // OPEN|TRIAL_PENDING|PAYMENT_PENDING|CONFIRMED|CANCELLED|DISPUTED
  trialLessonLink           String?
  trialScheduledAt          DateTime?
  trialResultAt             DateTime?
  paymentDeadline           DateTime?
  paymentSentAt             DateTime?
  paymentOverdueNotifiedAt  DateTime?
  createdAt                 DateTime @default(now())
  closedAt                  DateTime?

  messages LeadMessage[]
  reports  ViolationReport[]
  ratings  TutorRating[]

  @@index([responderId, status])
  @@index([leadId])
}

model LeadMessage {
  id        String     @id @default(uuid())
  dialogId  String
  dialog    LeadDialog @relation(fields: [dialogId], references: [id], onDelete: Cascade)
  senderId  String?                              // null = системное сообщение
  sender    AppUser?   @relation(fields: [senderId], references: [id])
  content   String
  flagged   Boolean    @default(false)
  isSystem  Boolean    @default(false)
  createdAt DateTime   @default(now())

  @@index([dialogId, createdAt])
}

model ViolationReport {
  id          String     @id @default(uuid())
  dialogId    String
  dialog      LeadDialog @relation(fields: [dialogId], references: [id])
  reporterId  String
  reporter    AppUser    @relation("violationReporter", fields: [reporterId], references: [id])
  description String
  status      String     @default("PENDING") // PENDING|RESOLVED|DISMISSED
  createdAt   DateTime   @default(now())
}

model TutorRating {
  id        String     @id @default(uuid())
  dialogId  String
  dialog    LeadDialog @relation(fields: [dialogId], references: [id])
  raterId   String
  rater     AppUser    @relation("ratingRater", fields: [raterId], references: [id])
  rateeId   String
  ratee     AppUser    @relation("ratingRatee", fields: [rateeId], references: [id])
  score     Int
  comment   String?
  createdAt DateTime   @default(now())

  @@unique([dialogId, raterId])
  @@index([rateeId])
}
```

Правки в `AppUser` — только back-relations:

```prisma
marketProfile      TutorMarketProfile?
leadsCreated       Lead[]              @relation("leadCreator")
dialogsAsResponder LeadDialog[]        @relation("dialogResponder")
leadMessages       LeadMessage[]
violationReports   ViolationReport[]   @relation("violationReporter")
ratingsGiven       TutorRating[]       @relation("ratingRater")
ratingsReceived    TutorRating[]       @relation("ratingRatee")
```

Отличия от MVP-схемы (осознанные):
- `AppUser` вместо `Tutor` (единая сущность).
- `senderId` у `LeadMessage` nullable — системные сообщения не через юзера-заглушку «Поддержка», а через `isSystem=true`.
- Индексы `status+subjectLower` (лента), `responderId+status` (лимит 5), `rateeId` (агрегат рейтинга).
- Нет `expiresAt` у `Lead` (в MVP оставили как nullable для совместимости — здесь чистый старт).
- Нет `LeadWaitlist` — в MVP заводили «на потом», реально не использовали.
- `paymentOverdueNotifiedAt` — для cron просрочек, чтобы не спамить.

## 4. Backend

Один модуль `TutorExchangeModule` в `backend/src/modules/tutor-exchange/`:

```
tutor-exchange/
├── tutor-exchange.module.ts
├── leads/
│   ├── leads.controller.ts, leads.service.ts, dto/*
├── dialogs/
│   ├── dialogs.controller.ts, dialogs.service.ts
│   ├── dialog-actions.service.ts   ← state machine изолированно
│   └── dto/*
├── messages/
│   ├── messages.controller.ts, messages.service.ts
│   └── moderation.service.ts       ← детектор контактов из MVP
├── violations/
│   ├── violations.controller.ts, violations.service.ts
├── ratings/
│   ├── ratings.controller.ts, ratings.service.ts
├── cron/
│   └── payment-overdue.job.ts
├── notifications/
│   └── tutor-exchange-notifier.service.ts
└── guards/
    └── exchange-enabled.guard.ts
```

**Эндпоинты** (префикс `/api/tutor-exchange/*`, все под `JwtAuthGuard` + `ExchangeEnabledGuard`):

| Метод | Путь | Что |
|---|---|---|
| GET | `/leads` | Лента; фильтры subject/format/type/city; по умолчанию `status=ACTIVE`, свои заявки скрыты |
| GET | `/leads/mine` | Мои созданные, все статусы |
| GET | `/leads/:id` | Детали; `studentContact` только creator или если сделка `CONFIRMED` |
| POST | `/leads` | Создать (пишет `subjectLower`) |
| DELETE | `/leads/:id` | Снять с публикации (только creator, только ACTIVE) |
| GET | `/dialogs` | Мои диалоги (creator OR responder) |
| GET | `/dialogs/:id` | Детали + сообщения + рейтинги; 403 если не участник |
| POST | `/dialogs` | Отклик: транзакция lock lead + create dialog + проверки лимита ≤5 и отсутствия просрочек |
| POST | `/dialogs/:id/actions` | State machine action |
| GET | `/dialogs/:id/messages` | Polling |
| POST | `/dialogs/:id/messages` | Отправить (moderation → flagged + системное сообщение при контактах) |
| POST | `/dialogs/:id/violations` | Жалоба |
| POST | `/dialogs/:id/ratings` | Оценка; пересчёт `TutorMarketProfile.ratingAvg` |
| GET | `/admin/violations` | Админский список |
| PATCH | `/admin/violations/:id` | `{status: RESOLVED\|DISMISSED}` |

**Ключевые решения**:
- `DialogActionsService.transition(dialog, action, actorId)` — единственная точка изменения статуса. Проверяет права (creator/responder) и валидность перехода, бросает `BadRequestException` иначе. Обёрнута в `prisma.$transaction` вместе с изменением `lead.status`.
- `ExchangeEnabledGuard` читает `SystemService.getToolStatus('tutor_exchange')` с in-memory кешем 10 сек. `enabled=false` + non-admin → `ServiceUnavailableException({tutorExchangeDisabled: true, message})`.
- Actor ID — только из JWT через `@CurrentUser()`. Никогда не из body/query.
- Валидация — DTO + `class-validator`.
- Транзакции только там, где нужна атомарность (lock + dialog create; state transition + lead status; rating insert + agg recalc).

## 5. Frontend

**Роуты** (`frontend/src/app/dashboard/`):

```
leads/page.tsx, leads/new/page.tsx, leads/[id]/page.tsx
dialogs/page.tsx, dialogs/[id]/page.tsx
tutor/[id]/page.tsx  ← публичный профиль с рейтингами
```

**Компоненты** (`frontend/src/components/tutor-exchange/`):
`LeadsFeed, LeadCard, LeadDetails, NewLeadWizard, MyDialogsList, DialogRoom, DialogChat, DialogSidebar, PaymentCountdown, StarRating, ViolationForm, SystemMessage`.

Стили — Tailwind по токенам `frontend-redesign-v2` (в MVP были инлайновые — переносим на классы). Данные — существующий `apiClient` (axios).

**Встройка в сайдбар V2**: пункт «Биржа лидов» с `opKey: 'tutor_exchange'`. Рендерится только если `enabled === true` или пользователь админ. Никакого disabled-состояния — просто нет пункта.

**Realtime**: polling `/dialogs/:id` каждые 3 сек, cleanup при `document.visibilityState === 'hidden'`. SSE/WebSocket — вне scope v1.

**Хуки** (`frontend/src/hooks/tutor-exchange/`):
`useTutorExchangeEnabled()` (SWR, 30 сек), `useDialog(id)`, `useLeads(filters)`, `useMyDialogs()`.

**Mobile**: `DialogRoom` на узком экране становится вертикальным — сайдбар превращается в свёрнутую шапку, клик разворачивает.

## 6. Уведомления

Новый сервис `TutorExchangeNotifier` в модуле. Сервисы биржи зовут его напрямую (без EventEmitter — оверскил).

**Транспорт**:
- In-app: существующий `NotificationsService.createNotification({userId, userType:'teacher', ...})`. Enum `Notification.type` расширяется.
- Telegram: новый метод `TelegramService.sendToAppUser(appUserId, text, opts?)` — ищет `BotUser.telegramId`, шлёт через grammy.

**События**:

| Событие | Кому | In-app | Telegram |
|---|---|---|---|
| `dialog.created` | creator | ✓ | мгновенно |
| `trial.scheduled` | responder | ✓ | — |
| `trial.result` | creator | ✓ | мгновенно |
| `payment.reported` | creator | ✓ | мгновенно |
| `payment.confirmed` | responder | ✓ | мгновенно |
| `payment.overdue` | creator | ✓ | мгновенно |
| `dispute.opened` | обе стороны | ✓ | мгновенно |
| `message.new` | противоположная сторона | ✓ | дебаунс 30 сек |
| `rating.received` | ratee | ✓ | — |
| `violation.reported` | админы | ✓ | ✓ |

**Дебаунс `message.new`**: BullMQ delayed job на 30 сек, следующее сообщение обновляет `messageCount`, при срабатывании — одно сводное сообщение в tg («У вас 3 новых сообщения в диалоге с N»).

**Cron просрочек** (`@nestjs/schedule` или BullMQ repeatable, раз в час): ищет `LeadDialog{status:PAYMENT_PENDING, paymentDeadline<now, paymentOverdueNotifiedAt:null}`, эмитит `payment.overdue`, ставит `paymentOverdueNotifiedAt`.

**Тексты** — короткие, русские, с deep-link на `/dashboard/dialogs/:id`.

**Настройки отписок в v1 нет** — уведомления обо всех событиях сделки включены всегда. Мелкий toggle на «выключить tg» — отдельная итерация.

## 7. Feature flag и админка

**Backend**:
- `SystemService`: константы `KEY_MARKET_ENABLED = 'tools.tutor_exchange.enabled'`, `KEY_MARKET_MESSAGE = 'tools.tutor_exchange.message'`. Методы `getToolStatus(opKey)`, `setToolStatus(opKey, {enabled, message})`.
- Эндпоинты: публичный `GET /api/system/tool-status?opKey=` (для фронта), админский `POST /api/admin/tool-status`.
- `ExchangeEnabledGuard` — как в разделе 4.

**Frontend**:
- Хук `useTutorExchangeEnabled()`.
- В `Sidebar.tsx` — пункт биржи под `opKey`.
- Страницы биржи проверяют флаг и показывают placeholder «Раздел временно недоступен» + текст `message`, если `!enabled && !isAdmin`.

**Админ-панель** — новая страница `/check/prrv/admin/tools`:
- Список per-tool переключателей. В v1 — одна строка `tutor_exchange`.
- Toggle + textarea для сообщения, кнопка Save.
- Пункт «Инструменты» в сайдбаре админки.

**Дефолт**: при первом деплое ключей нет → `enabled=false`, `message='Биржа лидов скоро откроется — мы обкатываем последние детали'`.

## 8. План внедрения (6 этапов)

Каждый этап — самостоятельная PR, деплоится безопасно (флаг `false` до последнего шага).

**Этап 1. Фундамент**
Prisma-миграция `add_tutor_exchange` (все 6 таблиц + back-relations + индексы). `TutorExchangeModule` — скелет, `ExchangeEnabledGuard`. `SystemService` — методы `getToolStatus`/`setToolStatus`. Эндпоинты статуса. Админ-страница `/check/prrv/admin/tools`. **Готовность**: миграция в prod, админ видит переключатель, всё выключено.

**Этап 2. Заявки**
`LeadsService` + `LeadsController` (все GET/POST/DELETE). Фронт: `/dashboard/leads` (лента + фильтры), `/dashboard/leads/new` (wizard), `/dashboard/leads/[id]` (детали). Пункт в сайдбаре. Unit-тесты фильтра/скрытия контакта/регистронезависимости. **Готовность**: админ включает флаг локально, создаёт заявку, видит её.

**Этап 3. Диалоги + чат + модерация**
`DialogsService.createDialog` (транзакция + лимит 5 + проверка просрочек), `MessagesService` + `ModerationService`, action `cancel`. Фронт: `/dashboard/dialogs`, `/dashboard/dialogs/[id]`. **Готовность**: два аккаунта: создал → откликнулся → написали → отменили.

**Этап 4. Сделка (state machine)**
`DialogActionsService.transition` со всеми переходами MVP. `ViolationReport` и админский `/check/prrv/admin/violations`. Cron просрочек. Фронт: `DialogSidebar`, `PaymentCountdown`, `ViolationForm`. Unit-тесты state-machine. **Готовность**: полный e2e-happy-path + негативные (спор, жалоба).

**Этап 5. Рейтинги + уведомления**
`RatingsService` с пересчётом агрегата. `TutorExchangeNotifier` (все 10 event-типов), `TelegramService.sendToAppUser`, дебаунс `message.new` через BullMQ. Расширение `Notification.type`. Фронт: `StarRating`, публичный профиль. **Готовность**: сделка → рейтинг видно на профиле; уведомления и в bell, и в tg.

**Этап 6. Полировка и релиз**
Mobile-раскладка `DialogRoom`. E2E-тесты (Playwright если есть, иначе чек-лист). Мониторинг критичных action'ов через `LogsModule`. Наполнение `SystemSetting` внятным `message`. **Rollout**: включаете флаг, 3–5 бета-репетиторов неделю, потом всем.

**Судьба `tutor-leads/mvp`**: остаётся как reference, не удаляем. В README отметить, что prod-версия в `backend/src/modules/tutor-exchange` + `frontend/src/app/dashboard/leads`.

## 9. Non-goals для v1

- Реальный эскроу (СБП/ЮKassa с холдом) — оставляем «на слово», как в MVP.
- Email-уведомления и настройки отписок.
- WebSocket/SSE для realtime — polling 3 сек.
- Push-нотификации браузера.
- Waitlist на занятые заявки.
- A/B-тесты, плавный rollout по % юзеров.
- Per-user флаг `hasMarketAccess` — глобальный переключатель заменяет.

## 10. Открытые вопросы (не блокирующие v1)

- Дизайн-система V2: если в prepodavai есть UI-kit (кнопки, инпуты, badges), использовать его вместо переноса стилей из MVP. Уточним при старте этапа 2.
- Playwright vs просто ручной чек-лист для e2e — зависит от того, что уже стоит в проекте.
- Ретенция сообщений `LeadMessage` — сейчас держим бессрочно; когда БД разрастётся — политика удаления через N месяцев после `closedAt`.
