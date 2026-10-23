# Tutor Exchange — Stage 3: Dialogs + Chat + Moderation

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans` для инлайн-исполнения.

**Goal:** Позволить репетитору откликнуться на чужую заявку и вести чат-диалог с модерацией и лимитами.

**Architecture:** Единый модуль `TutorExchangeModule` дополняется под-модулями `dialogs`, `messages` и `guards`-uses `SystemService.getToolStatus`. Схема БД (`LeadDialog`, `LeadMessage`, `TutorRating`) уже добавлена в этапе 1 — только используем. State-machine пока минимальна (лишь `cancel`), полная логика — этап 4.

**Tech Stack:** NestJS 10 + Prisma 5 + PostgreSQL. Frontend: Next.js 15 App Router + Tailwind + lucide-react. Polling 3с (без WS).

## Global Constraints

- Все эндпоинты `/api/tutor-exchange/*` под `JwtAuthGuard + ExchangeEnabledGuard`.
- `req.user.id` — единственный источник actor-id. Никогда не из body.
- В сообщениях детектим контактные данные (телефон/tg-username/мессенджеры/сторонние ссылки) — не блокируем, а помечаем `flagged=true` и сразу вслед пишем системное сообщение (`isSystem=true`, `senderId=null`) с предупреждением.
- Лимит 5 активных диалогов на responder. Активные = `OPEN|TRIAL_PENDING|PAYMENT_PENDING`.
- Отклики блокируются, если у responder есть диалог с `PAYMENT_PENDING && paymentDeadline < now`.
- Все транзакции через `prisma.$transaction`.

---

### Task 1: DialogsService.createDialog

**Files:**
- Create: `backend/src/modules/tutor-exchange/dialogs/dialogs.service.ts`
- Create: `backend/src/modules/tutor-exchange/dialogs/dto/create-dialog.dto.ts`
- Create: `backend/src/modules/tutor-exchange/dialogs/dialogs.service.spec.ts`

**Interfaces:**
- Produces: `DialogsService.createDialog(userId: string, dto: {leadId: string}): Promise<{id, leadId, status, ...}>`

**Steps:**

- [ ] Test: rejects если lead не существует → `NotFoundException`
- [ ] Test: rejects если lead.status !== 'ACTIVE' → `BadRequestException('LeadNotAvailable')`
- [ ] Test: rejects если lead.creatorId === userId → `BadRequestException('OwnLead')`
- [ ] Test: rejects если у responder уже 5 активных диалогов → `BadRequestException('LimitReached')`
- [ ] Test: rejects если у responder есть просроченный PAYMENT_PENDING → `BadRequestException('OverduePayment')`
- [ ] Test: успех — в транзакции обновляет lead(LOCKED, lockedById, lockedAt) и создаёт dialog(OPEN)
- [ ] Implement: findUnique lead → проверки → count активных → findFirst PAYMENT_PENDING где paymentDeadline<now → `prisma.$transaction([lead.update, dialog.create])`
- [ ] Run tests, commit.

### Task 2: DialogsService.listMy + getDialog

**Files:**
- Modify: `backend/src/modules/tutor-exchange/dialogs/dialogs.service.ts`
- Modify: `backend/src/modules/tutor-exchange/dialogs/dialogs.service.spec.ts`

**Interfaces:**
- Produces: `listMyDialogs(userId): Promise<Dialog[]>`, `getDialog(userId, id): Promise<Dialog & {messages, lead, creator, responder}>`

**Steps:**

- [ ] Test: listMy возвращает диалоги где responderId=me OR lead.creatorId=me
- [ ] Test: getDialog 403 если пользователь не участник
- [ ] Test: getDialog возвращает messages
- [ ] Implement listMy: `where: { OR: [{ responderId: userId }, { lead: { creatorId: userId } }] }`, includes lead + counterpart
- [ ] Implement getDialog: findUnique + include lead + include messages orderBy asc, проверка участия
- [ ] Run tests, commit.

### Task 3: ModerationService.detectContacts

**Files:**
- Create: `backend/src/modules/tutor-exchange/messages/moderation.service.ts`
- Create: `backend/src/modules/tutor-exchange/messages/moderation.service.spec.ts`

**Interfaces:**
- Produces: `detectContacts(text: string): ContactHit | null`, `moderationWarningText(hit): string`

**Steps:**

- [ ] Test: обнаруживает `+7 999 111-22-33`, `8-999-111-22-33`
- [ ] Test: обнаруживает `@durov` (@username 4+ chars)
- [ ] Test: обнаруживает `whatsapp`, `телеграм`, `t.me/xxx`
- [ ] Test: обнаруживает `http://example.com` но не `https://zoom.us/...`
- [ ] Test: возвращает null для «пришлю задание завтра»
- [ ] Test: `moderationWarningText({phone:true})` содержит «номер телефона»
- [ ] Implement: перенести regexps + `detectContacts` + `moderationWarningText` из tutor-leads/mvp/lib/moderation.ts
- [ ] Run tests, commit.

### Task 4: MessagesService

**Files:**
- Create: `backend/src/modules/tutor-exchange/messages/messages.service.ts`
- Create: `backend/src/modules/tutor-exchange/messages/dto/send-message.dto.ts`
- Create: `backend/src/modules/tutor-exchange/messages/messages.service.spec.ts`

**Interfaces:**
- Produces: `sendMessage(userId, dialogId, {content}): Promise<Message>`, `listMessages(userId, dialogId): Promise<Message[]>`

**Steps:**

- [ ] Test: sendMessage 403 если не участник диалога
- [ ] Test: sendMessage — создаёт сообщение с sender=userId, flagged=false для «пришлю задание»
- [ ] Test: sendMessage — при hit модерации создаёт flagged=true И системное сообщение (`isSystem=true, senderId=null, content=warning`) в транзакции
- [ ] Test: sendMessage — reject если диалог не в OPEN/TRIAL_PENDING/PAYMENT_PENDING (CANCELLED/CLOSED)
- [ ] Test: listMessages 403 если не участник
- [ ] Test: listMessages возвращает orderBy createdAt asc
- [ ] Implement: проверка участия через getDialog helper (private) или прямой findFirst dialog где leadId/responderId/creatorId; транзакция при hit
- [ ] Run tests, commit.

### Task 5: DialogsService.cancel

**Files:**
- Modify: `backend/src/modules/tutor-exchange/dialogs/dialogs.service.ts`
- Modify: `backend/src/modules/tutor-exchange/dialogs/dialogs.service.spec.ts`
- Create: `backend/src/modules/tutor-exchange/dialogs/dto/action.dto.ts` (enum + DTO)

**Interfaces:**
- Produces: `cancelDialog(userId, dialogId): Promise<{ok:true}>`

**Steps:**

- [ ] Test: 403 если не участник
- [ ] Test: reject если dialog уже в CANCELLED/CLOSED/CONFIRMED
- [ ] Test: транзакция — dialog→CANCELLED (closedAt=now), lead→ACTIVE (lockedById=null, lockedAt=null)
- [ ] Implement: проверка + `prisma.$transaction([dialog.update, lead.update])`
- [ ] Run tests, commit.

### Task 6: Controllers + module wiring

**Files:**
- Create: `backend/src/modules/tutor-exchange/dialogs/dialogs.controller.ts`
- Create: `backend/src/modules/tutor-exchange/messages/messages.controller.ts`
- Modify: `backend/src/modules/tutor-exchange/tutor-exchange.module.ts` (add controllers/providers)

**Endpoints:**
- `POST /tutor-exchange/dialogs` → create
- `GET /tutor-exchange/dialogs` → list mine
- `GET /tutor-exchange/dialogs/:id` → get one
- `POST /tutor-exchange/dialogs/:id/actions` → body `{action: 'cancel'}` (в этапе 4 — все action)
- `GET /tutor-exchange/dialogs/:id/messages` → polling list
- `POST /tutor-exchange/dialogs/:id/messages` → send

**Steps:**

- [ ] Написать DialogsController (5 методов) с `@UseGuards(JwtAuthGuard, ExchangeEnabledGuard)`
- [ ] Написать MessagesController (2 метода)
- [ ] Зарегистрировать в TutorExchangeModule (controllers, providers)
- [ ] `npx jest --testPathPattern=tutor-exchange` — все зелёные
- [ ] Запустить бэкенд локально и `curl -i` (без JWT) — ожидаем 401 на каждом эндпоинте
- [ ] Commit.

### Task 7: Frontend — /dashboard/dialogs (список)

**Files:**
- Create: `frontend/src/hooks/tutor-exchange/useMyDialogs.ts`
- Create: `frontend/src/components/tutor-exchange/MyDialogsList.tsx`
- Create: `frontend/src/app/dashboard/dialogs/page.tsx`

**Steps:**

- [ ] Хук `useMyDialogs()` — GET `/tutor-exchange/dialogs`, состояние `{dialogs, isLoading, error}`
- [ ] `MyDialogsList` — карточки: subject/grade + counterpart name + статус + дата последнего сообщения
- [ ] Обработка 503 `tutorExchangeDisabled`
- [ ] Пустое состояние: «У вас пока нет диалогов. Найдите заявку в ленте.»
- [ ] Page — тонкая обёртка
- [ ] Commit.

### Task 8: Frontend — /dashboard/dialogs/[id] (комната)

**Files:**
- Create: `frontend/src/hooks/tutor-exchange/useDialog.ts`
- Create: `frontend/src/components/tutor-exchange/DialogRoom.tsx`
- Create: `frontend/src/components/tutor-exchange/DialogChat.tsx`
- Create: `frontend/src/components/tutor-exchange/SystemMessage.tsx`
- Create: `frontend/src/app/dashboard/dialogs/[id]/page.tsx`

**Steps:**

- [ ] `useDialog(id)` — polling `/dialogs/:id` каждые 3с, cleanup при `visibilitychange`
- [ ] `DialogRoom` — hero (subject/grade/counterpart), тело (DialogChat), sidebar-заглушка «Действия появятся на этапе 4»
- [ ] `DialogChat` — прокручиваемый список + инпут + кнопка отправки; клик отправляет POST + оптимистично добавляет
- [ ] `SystemMessage` — стилизованное системное предупреждение (жёлтый фон)
- [ ] Кнопка «Отменить диалог» → POST /dialogs/:id/actions {action:'cancel'} с confirm
- [ ] Обработка 503
- [ ] Page — обёртка
- [ ] Commit.

### Task 9: Активировать «Откликнуться» в LeadDetails

**Files:**
- Modify: `frontend/src/components/tutor-exchange/LeadDetails.tsx`

**Steps:**

- [ ] Заменить disabled-плейсхолдер на активную кнопку
- [ ] onClick → `apiClient.post('/tutor-exchange/dialogs', {leadId: id})` → redirect в `/dashboard/dialogs/:dialogId`
- [ ] Обработка 400 «LimitReached», «OverduePayment», «LeadNotAvailable» — понятные alerts
- [ ] Commit.

### Task 10: Sidebar — пункт «Диалоги»

**Files:**
- Modify: `frontend/src/components/layout/v2/Sidebar.tsx`

**Steps:**

- [ ] В секции «Биржа» добавить пункт «Диалоги» → `/dashboard/dialogs` c иконкой MessageSquare
- [ ] Появляется только при `tutorExchangeEnabled`
- [ ] Commit.

### Готовность этапа 3

- Два аккаунта: A создаёт заявку → B отклик → диалог создан → оба видят чат → пишут сообщения → сообщение с «+7 999 111-22-33» помечено предупреждением → отмена возвращает заявку в ACTIVE.
- Все юнит-тесты бэкенда зелёные (Leads + Dialogs + Messages + Moderation + Guard).
- В сайдбаре под флагом видны «Заявки» и «Диалоги».
- В LeadDetails «Откликнуться» работает.
