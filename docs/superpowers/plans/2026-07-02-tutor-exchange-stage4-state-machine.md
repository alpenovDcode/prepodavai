# Tutor Exchange — Stage 4: State Machine + Violations + Cron

**Goal:** Провести сделку от отклика до `CONFIRMED`/`CANCELLED`/`DISPUTED`: пробный урок, двухшаговая оплата, дедлайн, cron просрочек. Плюс жалобы участников и админский экран разбора.

**Architecture:** Все state-переходы — в одном `DialogActionsService` с методом `transition(actorId, dialogId, action, payload)` — единственный shortcut к статусу диалога. Проверки прав по актору, транзакция вместе с обновлением lead/деловых счётчиков. Cron `@nestjs/schedule`. Жалобы — отдельный модуль `violations`.

**Tech Stack:** NestJS 10 + Prisma + `@nestjs/schedule` + Tailwind.

## Global Constraints

- Все переходы — только через `DialogActionsService.transition`. Ни один controller/service не пишет `status` напрямую (кроме create/cancel из этапа 3, которые тоже переведём через сервис).
- Роли: `creator` = автор заявки, `responder` = откликнувшийся репетитор.
- Матрица переходов:
  - `OPEN → TRIAL_PENDING` — `schedule_trial` (creator), payload: `trialLessonLink?`
  - `TRIAL_PENDING → PAYMENT_PENDING` — `trial_success` при `lead.type=COMMISSION` (responder). Ставит `paymentDeadline = now + 3d`
  - `TRIAL_PENDING → CONFIRMED` — `trial_success` при `lead.type=FREE` (responder). Инкремент `dealsCompleted`
  - `TRIAL_PENDING → CANCELLED` — `trial_fail` (responder). Возвращает lead в `ACTIVE`
  - `PAYMENT_PENDING → PAYMENT_PENDING` — `payment_sent` (responder). Ставит `paymentSentAt`
  - `PAYMENT_PENDING → CONFIRMED` — `confirm_payment` (creator). Требует `paymentSentAt!=null`. Инкремент `dealsCompleted`, lead→CLOSED
  - `OPEN|TRIAL_PENDING → CANCELLED` — `cancel` (любой участник). Возвращает lead в `ACTIVE`
  - `TRIAL_PENDING|PAYMENT_PENDING → DISPUTED` — `dispute` (любой участник)
- `dealsCompleted` увеличиваем через `TutorMarketProfile` `upsert` (create-if-missing).
- Cron просрочек: `@Cron('0 * * * *')` (раз в час) — ищет `PAYMENT_PENDING` с `paymentDeadline < now && paymentOverdueNotifiedAt IS NULL`, ставит `paymentOverdueNotifiedAt = now`. Уведомления — этап 5 (сейчас только метка).
- `ViolationReport`: `POST /tutor-exchange/dialogs/:id/violations` от участника; `GET /admin/violations` + `PATCH /admin/violations/:id` для админа под `AdminGuard`.
- В контроллере `POST /dialogs/:id/actions` — DTO расширяем: `action: 'schedule_trial'|'trial_success'|'trial_fail'|'payment_sent'|'confirm_payment'|'dispute'|'cancel'`; payload: `{trialLessonLink?: string}`.

---

### Task 1: DialogActionsService.transition

**Files:**
- Create: `backend/src/modules/tutor-exchange/dialogs/dialog-actions.service.ts`
- Create: `backend/src/modules/tutor-exchange/dialogs/dialog-actions.service.spec.ts`
- Modify: `backend/src/modules/tutor-exchange/dialogs/dto/action.dto.ts` (расширить enum + payload)
- Modify: `backend/src/modules/tutor-exchange/dialogs/dialogs.service.ts` (`cancelDialog` → тонкий wrapper над `transition`)

**Interfaces:**
- Produces: `transition(actorId: string, dialogId: string, action: DialogAction, payload?: {trialLessonLink?: string}): Promise<{ok: true, dialog}>`

**Steps:**

- [ ] Тесты для каждого перехода: happy path, wrong actor, wrong current status, wrong lead type
- [ ] Implement: findUnique dialog+lead → switch(action) → prisma.$transaction по каждому кейсу
- [ ] Все текущие тесты `dialogs.service.spec` остаются зелёными
- [ ] Commit.

### Task 2: ViolationsService

**Files:**
- Create: `backend/src/modules/tutor-exchange/violations/violations.service.ts`
- Create: `backend/src/modules/tutor-exchange/violations/violations.service.spec.ts`
- Create: `backend/src/modules/tutor-exchange/violations/dto/create-violation.dto.ts`
- Create: `backend/src/modules/tutor-exchange/violations/dto/update-violation.dto.ts`

**Interfaces:**
- Produces: `createViolation(userId, dialogId, {description})`, `listViolations({status?})`, `updateViolation(adminId, id, {status: 'RESOLVED'|'DISMISSED'})`

**Steps:**

- [ ] Тесты: 403 если не участник; создаёт запись со `status='PENDING'`
- [ ] listViolations возвращает пагинированный список с включением dialog+lead+reporter
- [ ] updateViolation — админ ставит `status`
- [ ] Commit.

### Task 3: Payment overdue cron

**Files:**
- Create: `backend/src/modules/tutor-exchange/cron/payment-overdue.job.ts`
- Create: `backend/src/modules/tutor-exchange/cron/payment-overdue.job.spec.ts`
- Modify: `backend/src/app.module.ts` (import `ScheduleModule.forRoot()` если ещё нет)

**Steps:**

- [ ] Тест: находит просроченные PAYMENT_PENDING и ставит paymentOverdueNotifiedAt (метод для явного вызова из теста)
- [ ] Implement: `@Cron('0 * * * *')` вызывает `markOverdue()`
- [ ] Commit.

### Task 4: Wiring контроллеров

**Files:**
- Modify: `backend/src/modules/tutor-exchange/dialogs/dialogs.controller.ts` (расширить action endpoint через `DialogActionsService`)
- Create: `backend/src/modules/tutor-exchange/violations/violations.controller.ts`
- Create: `backend/src/modules/tutor-exchange/violations/admin-violations.controller.ts`
- Modify: `backend/src/modules/tutor-exchange/tutor-exchange.module.ts`

**Steps:**

- [ ] `DialogsController.action(dto)` вызывает `DialogActionsService.transition(...)` для всех действий
- [ ] `POST /tutor-exchange/dialogs/:id/violations` под JwtAuthGuard+ExchangeEnabledGuard
- [ ] `GET /admin/tutor-exchange/violations` + `PATCH /admin/tutor-exchange/violations/:id` под JwtAuthGuard+AdminGuard
- [ ] Все тесты зелёные, commit.

### Task 5: Frontend DialogSidebar с actions

**Files:**
- Modify: `frontend/src/components/tutor-exchange/DialogRoom.tsx` (заменить блок «Действия»)
- Create: `frontend/src/components/tutor-exchange/DialogActionsPanel.tsx`

**Steps:**

- [ ] По статусу + роли рендерит нужные кнопки:
  - OPEN + creator: «Назначить пробный урок» (модалка с полем `trialLessonLink`)
  - TRIAL_PENDING + responder: «Пробный прошёл успешно», «Пробный не удался»
  - PAYMENT_PENDING + responder: «Я отправил оплату» (если `paymentSentAt=null`)
  - PAYMENT_PENDING + creator: «Подтвердить получение оплаты» (disabled если `paymentSentAt=null`)
  - `TRIAL_PENDING|PAYMENT_PENDING` + участник: «Открыть спор»
  - `OPEN|TRIAL_PENDING` + участник: «Отменить»
- [ ] Каждое действие → POST на `/actions` + reload
- [ ] Commit.

### Task 6: PaymentCountdown + ViolationForm

**Files:**
- Create: `frontend/src/components/tutor-exchange/PaymentCountdown.tsx`
- Create: `frontend/src/components/tutor-exchange/ViolationForm.tsx`
- Modify: `frontend/src/components/tutor-exchange/DialogRoom.tsx` (показывать countdown в PAYMENT_PENDING + link на форму жалобы)

**Steps:**

- [ ] `PaymentCountdown({deadline})` — таймер, обновляется раз в 30с, «Просрочено» если < now
- [ ] `ViolationForm({dialogId, onDone})` — модалка с textarea, POST `/dialogs/:id/violations`
- [ ] В DialogRoom PAYMENT_PENDING sidebar: countdown, кнопка «О нарушении»
- [ ] Commit.

### Task 7: Admin страница /check/prrv/admin/violations

**Files:**
- Create: `frontend/src/hooks/tutor-exchange/useAdminViolations.ts`
- Create: `frontend/src/app/check/prrv/admin/violations/page.tsx`
- Modify: `frontend/src/app/check/prrv/admin/tools/page.tsx` (доп-ссылка на violations, опционально)

**Steps:**

- [ ] Хук `useAdminViolations({status})` — GET `/admin/tutor-exchange/violations?status=`
- [ ] Страница: таблица с колонками (диалог, репортер, дата, описание, статус, кнопки), PATCH resolve/dismiss
- [ ] Commit.

### Готовность этапа 4

- Backend jest tutor-exchange 60+ тестов зелёные (dialog actions + violations + cron)
- Полный e2e-happy-path: A создаёт заявку → B откликается → A «Назначить пробный» → B «Пробный успешно» → COMMISSION → B «Я оплатил» → A «Подтвердить» → CONFIRMED + контакт открывается + счётчик deals инкрементируется
- Негативные: B «Пробный не удался» возвращает lead в ленту; спор из PAYMENT_PENDING; жалоба видна в админке
- Cron нашёл просроченный дедлайн и поставил paymentOverdueNotifiedAt
