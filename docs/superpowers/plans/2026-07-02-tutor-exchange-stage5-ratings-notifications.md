# Tutor Exchange — Stage 5: Ratings + Notifications

**Goal:** Довести MVP-цикл до конца: рейтинг участников после успешной сделки + in-app и Telegram уведомления по 10 ключевым событиям биржи.

**Architecture:** Один `TutorExchangeNotifier` — фасад, который принимает бизнес-событие и рассылает in-app (`NotificationsService`) + telegram (`TelegramService.sendToAppUser`). Debounce для `message.new` — простой in-memory Map с `setTimeout` (без BullMQ — модуль stateful, но одноинстансный, v1 достаточно). Рейтинг — отдельный сервис + endpoint, изменяет `TutorMarketProfile` через upsert. Публичный профиль репетитора — thin page + backend endpoint.

**Tech Stack:** NestJS 10 + Prisma + grammy (уже в TelegramService).

## Global Constraints

- Notifier не бросает исключений внутрь бизнес-транзакций. Ошибки телеграма/notifications логируются, но не ломают action.
- Все notifier-вызовы — после успешного `prisma.$transaction`, никогда внутри.
- `TelegramService.sendToAppUser(appUserId, text)` — тихо no-op, если у пользователя нет `BotUser.telegramId`.
- Дебаунс `message.new` — 30 сек, in-memory Map по ключу `${recipientId}:${dialogId}`. Первое сообщение планирует таймер; следующие обновляют счётчик; при выстреле — сводное `«У вас N новых сообщений в диалоге с X»`.
- Рейтинг: 1–5, уникальный по `@@unique([dialogId, raterId])`. После insert — пересчёт `TutorMarketProfile.ratingAvg = avg(all ratee's ratings)`, `ratingCount = count`.
- Notification.type: расширить TS-union в `NotificationsService.createNotification`, prisma-string остаётся неограниченным.

---

### Task 1: TelegramService.sendToAppUser + Notification type union

**Files:**
- Modify: `backend/src/modules/telegram/telegram.service.ts` (+ метод + spec)
- Modify: `backend/src/modules/telegram/telegram.service.spec.ts`
- Modify: `backend/src/modules/notifications/notifications.service.ts` (расширить TS-union)

**Steps:**

- [ ] Test: `sendToAppUser` возвращает false если у пользователя нет BotUser или нет telegramId
- [ ] Test: `sendToAppUser` вызывает `bot.api.sendMessage(telegramId, text)` и возвращает true
- [ ] Implement: `async sendToAppUser(appUserId, text, opts?): Promise<boolean>` — findFirst BotUser с appUserId, если telegramId есть — sendMessage, иначе false
- [ ] Расширить type union в NotificationsService: `+ 'tutor_exchange.dialog_created' | ...' 10 типов`
- [ ] Commit.

### Task 2: TutorExchangeNotifier + MessageDebouncer

**Files:**
- Create: `backend/src/modules/tutor-exchange/notifications/tutor-exchange-notifier.service.ts`
- Create: `backend/src/modules/tutor-exchange/notifications/message-debouncer.ts`
- Create: `backend/src/modules/tutor-exchange/notifications/tutor-exchange-notifier.service.spec.ts`

**Interfaces:**
- Produces:
  - `notifyDialogCreated(dialog): Promise<void>`
  - `notifyTrialScheduled(dialog): Promise<void>`
  - `notifyTrialResult(dialog, success): Promise<void>`
  - `notifyPaymentReported(dialog): Promise<void>`
  - `notifyPaymentConfirmed(dialog): Promise<void>`
  - `notifyPaymentOverdue(dialog): Promise<void>`
  - `notifyDisputeOpened(dialog, actorId): Promise<void>`
  - `notifyMessageNew(dialog, senderId, recipientId): void` (debounced, не await)
  - `notifyRatingReceived(rating, ratee): Promise<void>`
  - `notifyViolationReported(violation): Promise<void>`

**Steps:**

- [ ] Test: `notifyDialogCreated` создаёт in-app и отправляет tg для creator
- [ ] Test: `notifyMessageNew` первое вызовет debouncer, второе не увеличит количество раз, а обновит счётчик
- [ ] Implement: сервис через `NotificationsService + TelegramService`
- [ ] `MessageDebouncer`: `schedule(key, callback, delayMs)` + `increment(key)` + внутри Map<key, {count, timer}>
- [ ] Commit.

### Task 3: RatingsService

**Files:**
- Create: `backend/src/modules/tutor-exchange/ratings/ratings.service.ts`
- Create: `backend/src/modules/tutor-exchange/ratings/ratings.controller.ts`
- Create: `backend/src/modules/tutor-exchange/ratings/dto/create-rating.dto.ts`
- Create: `backend/src/modules/tutor-exchange/ratings/ratings.service.spec.ts`

**Interfaces:**
- Produces:
  - `createRating(actorId, dialogId, {score, comment?}): Promise<Rating>`
  - `listMyRatings(userId): Promise<Rating[]>` — полученные
  - `listTutorRatings(userId): Promise<Rating[]>` — публично полученные с раскрытием rater

**Steps:**

- [ ] Test: throw NotFound если dialog нет
- [ ] Test: throw Forbidden если actor не участник
- [ ] Test: throw BadRequest если dialog не CONFIRMED
- [ ] Test: throw BadRequest если score вне 1..5
- [ ] Test: unique constraint — второе создание того же rater/dialog → BadRequest
- [ ] Test: создаёт rating и апдейтит TutorMarketProfile.ratingAvg/ratingCount через upsert (транзакция)
- [ ] Implement + подключить notifier `notifyRatingReceived` вне транзакции
- [ ] Commit.

### Task 4: Ratings controller + public profile endpoint

**Files:**
- Modify: `backend/src/modules/tutor-exchange/ratings/ratings.controller.ts`
- Modify: `backend/src/modules/tutor-exchange/leads/leads.service.ts` (extend `getLead` — не трогаем, всё через отдельный endpoint)
- Create: `backend/src/modules/tutor-exchange/tutors/tutors.controller.ts`
- Create: `backend/src/modules/tutor-exchange/tutors/tutors.service.ts`

**Endpoints:**
- `POST /tutor-exchange/dialogs/:id/ratings` — участник ставит оценку
- `GET /tutor-exchange/tutors/:id` — публичный профиль (marketProfile + последние 10 ratings)

**Steps:**

- [ ] TutorsService.getPublicProfile(userId) → { user, marketProfile, recentRatings }
- [ ] Controllers под JwtAuthGuard + ExchangeEnabledGuard
- [ ] Commit.

### Task 5: Подключение notifier из dialogs/actions/messages

**Files:**
- Modify: `backend/src/modules/tutor-exchange/dialogs/dialogs.service.ts` (createDialog → notifyDialogCreated)
- Modify: `backend/src/modules/tutor-exchange/dialogs/dialog-actions.service.ts` (все переходы → соответствующий notifier)
- Modify: `backend/src/modules/tutor-exchange/messages/messages.service.ts` (sendMessage → notifyMessageNew)
- Modify: `backend/src/modules/tutor-exchange/violations/violations.service.ts` (createViolation → notifyViolationReported)
- Modify: `backend/src/modules/tutor-exchange/cron/payment-overdue.job.ts` (markOverdue → notifyPaymentOverdue для каждого)
- Modify: `backend/src/modules/tutor-exchange/tutor-exchange.module.ts` (regs)

**Steps:**

- [ ] Все прежние тесты остаются зелёные (передаём notifier мок в моках)
- [ ] Commit.

### Task 6: Frontend — StarRating + RatingForm

**Files:**
- Create: `frontend/src/components/tutor-exchange/StarRating.tsx`
- Create: `frontend/src/components/tutor-exchange/RatingForm.tsx`
- Modify: `frontend/src/components/tutor-exchange/DialogActionsPanel.tsx` (в CONFIRMED — кнопка «Оценить»)

**Steps:**

- [ ] StarRating: 5 звёзд, controllable, размер маленький/средний/большой
- [ ] RatingForm: модалка со звёздами + textarea + submit POST `/dialogs/:id/ratings`
- [ ] В CONFIRMED-диалоге у обоих участников — кнопка «Оценить (1-5 ⭐)»; после подачи — «Оценка отправлена» disabled
- [ ] Commit.

### Task 7: Frontend — публичный профиль репетитора

**Files:**
- Create: `frontend/src/hooks/tutor-exchange/useTutorProfile.ts`
- Create: `frontend/src/components/tutor-exchange/TutorProfile.tsx`
- Create: `frontend/src/app/dashboard/tutor/[id]/page.tsx`
- Modify: `frontend/src/components/tutor-exchange/LeadCard.tsx` (имя creator → ссылка на профиль)
- Modify: `frontend/src/components/tutor-exchange/DialogRoom.tsx` (имя counterpart → ссылка)

**Steps:**

- [ ] Hook — GET `/tutor-exchange/tutors/:id`
- [ ] Profile-компонент: имя, аватар, средний рейтинг + количество, сделок, последние отзывы
- [ ] Commit.

### Готовность этапа 5

- Backend jest tutor-exchange 90+ тестов зелёные (+ ratings, +notifier)
- CONFIRMED-диалог → оба ставят рейтинг → на `/dashboard/tutor/:id` виден средний + отзывы
- В bell (in-app) видны нотификации по 10 событиям
- В tg (если BotUser привязан) приходит краткое сообщение с ссылкой на диалог
