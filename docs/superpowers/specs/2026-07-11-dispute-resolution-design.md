# Разрешение спора в админке биржи лидов

Дата: 2026-07-11
Модуль: `backend/src/modules/tutor-exchange`, `frontend/src/app/check/prrv/admin/violations`

## Проблема

Когда диалог биржи переходит в статус `DISPUTED`, он становится тупиком:

- заявка (`Lead`) навсегда остаётся `LOCKED` (`lockedById` не сбрасывается);
- ни создатель заявки, ни откликнувшийся не могут выполнить никакое
  действие (в `DialogActionsService` нет перехода из `DISPUTED`);
- у админа в `AdminViolationsController` есть только смена статуса жалобы
  (`RESOLVED`/`DISMISSED`) — это меняет запись `ViolationReport`, но НЕ
  трогает сам диалог и заявку.

Итог: спор нельзя закрыть, заявка выпадает из оборота, ученик подвешен.

## Цель

Дать админу инструмент разрешения спора над диалогом с явным исходом,
аудитом решения и опциональной заморозкой недобросовестного репетитора.

## Продуктовые решения (согласованы)

- **Исходы разрешения:** три варианта + заморозка репетитора.
- **Заморозка** запрещает замороженному репетитору: (1) откликаться на
  заявки, (2) размещать свои заявки. Существующие диалоги он доводит.

## Модель данных (миграция Prisma)

### `LeadDialog` — аудит резолюции

```
disputeResolution String?   // DEAL_CONFIRMED | RETURNED_TO_FEED | CANCELLED
resolvedByAdminId String?
resolvedAt        DateTime?
resolutionNote    String?
```

### `TutorMarketProfile` — причина заморозки

`disabledAt DateTime?` уже есть в схеме. Добавляем:

```
disabledReason    String?
disabledByAdminId String?
```

### `ViolationReport`

Полей достаточно. При резолюции спора все `PENDING`-жалобы по этому
диалогу переводятся в `RESOLVED`.

## Backend

### `DisputeService` (новый, `dialogs/dispute.service.ts`)

Отдельный сервис, НЕ метод в `DialogActionsService`: там переходы делают
участники диалога, здесь — админ. Разные права, разная точка входа,
раздельная тестируемость.

Метод:

```
resolveDispute(adminId, dialogId, {
  resolution: 'DEAL_CONFIRMED' | 'RETURNED_TO_FEED' | 'CANCELLED',
  note: string,              // обязателен, min 5 символов
  freezeResponder?: boolean,
})
```

Логика:

1. Загрузить диалог с `lead`. Нет — `NotFound`.
2. Гейт: `dialog.status === 'DISPUTED'`, иначе `BadRequest`
   («Разрешить можно только диалог в статусе спора»).
3. В одной транзакции (`$transaction`) по исходу:

   | resolution        | dialog     | lead                                   | прочее |
   |-------------------|------------|----------------------------------------|--------|
   | `DEAL_CONFIRMED`  | `CONFIRMED`| `CLOSED`                               | `dealsCompleted++` обоим; контакт откроется сам (getDialog отдаёт на CONFIRMED) |
   | `RETURNED_TO_FEED`| `CANCELLED`| `ACTIVE`, `lockedById=null`, `lockedAt=null` | — |
   | `CANCELLED`       | `CANCELLED`| `CANCELLED`                            | — |

   Плюс во всех исходах:
   - записать `disputeResolution`, `resolvedByAdminId`, `resolvedAt`,
     `resolutionNote`, `closedAt` (где диалог закрывается);
   - все `PENDING`-жалобы диалога → `RESOLVED`;
   - если `freezeResponder`: `TutorMarketProfile` репетитора upsert
     `disabledAt=now`, `disabledReason`, `disabledByAdminId`.
4. Вне транзакции — уведомить обе стороны о резолюции (best-effort,
   через `TutorExchangeNotifier`, ошибки проглатываются как в остальных
   уведомлениях модуля).

### Enforcement заморозки

`disabledAt` сейчас нигде не читается — без этого шага заморозка
декоративна. Новый `TutorMarketAccessService`
(`tutors/tutor-market-access.service.ts`):

```
assertNotFrozen(userId): бросает ForbiddenException({ code: 'AccountFrozen', message })
                         если TutorMarketProfile.disabledAt != null
```

Вызывается в начале:
- `DialogsService.createDialog` — нельзя откликаться;
- `LeadsService.createLead` — нельзя размещать заявки.

### Разморозка

`unfreezeTutor(userId)` — метод в `DisputeService`:
`disabledAt=null`, `disabledReason=null`, `disabledByAdminId=null`.
Обязательна — иначе заморозка = вечный бан без обратного хода.

## API (под `JwtAuthGuard + AdminGuard`)

Новый `AdminDisputeController`
(`dialogs/admin-dispute.controller.ts`, префикс `admin/tutor-exchange`):

- `POST /admin/tutor-exchange/dialogs/:dialogId/resolve`
  body `{ resolution, note, freezeResponder? }` (DTO с `@IsEnum`,
  `@IsString @MinLength(5)`, `@IsOptional @IsBoolean`).
- `POST /admin/tutor-exchange/tutors/:userId/unfreeze`

## Frontend

Страница `/check/prrv/admin/violations` (единственная точка админки биржи;
каждая жалоба уже ведёт в комнату диалога).

- Для жалобы, чей диалог в `DISPUTED`, — блок «Разрешить спор»:
  3 кнопки исхода, `textarea` комментария (обязателен), чекбокс
  «Заморозить репетитора».
- Показ статуса заморозки репетитора + кнопка «Разморозить», если
  заморожен.
- Хук `useAdminViolations` дополнить полем статуса заморозки репетитора
  (или отдельный вызов профиля).

## Тесты (TDD)

- `DisputeService`: каждый из трёх исходов (проверка статусов диалога и
  заявки, инкремент сделок для `DEAL_CONFIRMED`), гейт на не-`DISPUTED`,
  пометка `PENDING`-жалоб как `RESOLVED`, флаг `freezeResponder`.
- `createDialog` / `createLead`: отказ `Forbidden` замороженному.
- `unfreezeTutor`: снятие заморозки.

## Вне скоупа

- Реальный алерт админам о **новой** жалобе (сейчас
  `notifyViolationReported` только пишет в лог) — отдельная задача.
- История/лог всех действий админа как отдельная сущность — пока
  достаточно полей аудита на диалоге.
