# Dispute Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать админу разрешать спор (`DISPUTED`) над диалогом биржи с явным исходом, аудитом и опциональной заморозкой репетитора.

**Architecture:** Новый `DisputeService` (админская логика, отдельно от участникового `DialogActionsService`) делает переход в одной транзакции. `TutorMarketAccessService.assertNotFrozen` внедряется в `createDialog`/`createLead` — делает `disabledAt` рабочим. Админский `AdminDisputeController` под `AdminGuard`. Фронт — блок резолюции на странице жалоб.

**Tech Stack:** NestJS, Prisma (PostgreSQL), class-validator, Jest, Next.js (App Router), axios.

## Global Constraints

- Все клиентские эндпоинты биржи — под `JwtAuthGuard + ExchangeEnabledGuard`; админские — под `JwtAuthGuard + AdminGuard`.
- Статусы хранятся строками (не enum в БД), как в существующей схеме.
- Prisma-модели в коде дергаются как `(this.prisma as any).<model>` — следовать этому паттерну (клиент типизируется после `prisma generate`).
- Транзакции с зависимыми проверками — interactive `$transaction(async (tx) => ...)`.
- Уведомления best-effort: ошибки проглатываются, основной поток не падает.
- Тесты — Jest, мок Prisma объектом с `jest.fn()`; `$transaction` мок поддерживает и callback-форму, и массив.
- Коммиты — простые короткие сообщения на русском, без упоминания Claude.

---

### Task 1: Миграция — поля аудита и заморозки

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_dispute_resolution/migration.sql` (генерит prisma)

**Interfaces:**
- Produces: поля `LeadDialog.disputeResolution/resolvedByAdminId/resolvedAt/resolutionNote`, `TutorMarketProfile.disabledReason/disabledByAdminId`.

- [ ] **Step 1: Добавить поля в `LeadDialog`** (после `closedAt`)

```prisma
  closedAt                 DateTime?
  disputeResolution        String?
  resolvedByAdminId        String?
  resolvedAt               DateTime?
  resolutionNote           String?
```

- [ ] **Step 2: Добавить поля в `TutorMarketProfile`** (после `disabledAt`)

```prisma
  disabledAt        DateTime?
  disabledReason    String?
  disabledByAdminId String?
```

- [ ] **Step 3: Создать и применить миграцию**

Run: `cd backend && npx prisma migrate dev --name dispute_resolution`
Expected: миграция создана, применена, клиент перегенерён.
Fallback (если БД недоступна): создать `migration.sql` вручную с `ALTER TABLE "lead_dialogs" ADD COLUMN ...` и `ALTER TABLE "tutor_market_profiles" ADD COLUMN ...`, затем `npx prisma generate`.

- [ ] **Step 4: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(биржа): поля аудита резолюции и заморозки в схеме"
```

---

### Task 2: `TutorMarketAccessService` — гейт заморозки

**Files:**
- Create: `backend/src/modules/tutor-exchange/tutors/tutor-market-access.service.ts`
- Test: `backend/src/modules/tutor-exchange/tutors/tutor-market-access.service.spec.ts`

**Interfaces:**
- Produces: `assertNotFrozen(userId: string): Promise<void>` — бросает `ForbiddenException({ code: 'AccountFrozen', message })` если `disabledAt != null`.

- [ ] **Step 1: Написать падающий тест**

```ts
import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { TutorMarketAccessService } from './tutor-market-access.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

describe('TutorMarketAccessService', () => {
  let service: TutorMarketAccessService;
  let prisma: { tutorMarketProfile: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { tutorMarketProfile: { findUnique: jest.fn() } };
    const mod = await Test.createTestingModule({
      providers: [TutorMarketAccessService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(TutorMarketAccessService);
  });

  it('пропускает если профиля нет', async () => {
    prisma.tutorMarketProfile.findUnique.mockResolvedValue(null);
    await expect(service.assertNotFrozen('u1')).resolves.toBeUndefined();
  });

  it('пропускает если disabledAt=null', async () => {
    prisma.tutorMarketProfile.findUnique.mockResolvedValue({ disabledAt: null });
    await expect(service.assertNotFrozen('u1')).resolves.toBeUndefined();
  });

  it('бросает Forbidden если заморожен', async () => {
    prisma.tutorMarketProfile.findUnique.mockResolvedValue({ disabledAt: new Date() });
    await expect(service.assertNotFrozen('u1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `cd backend && npx jest tutor-market-access.service.spec.ts`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализовать сервис**

```ts
import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class TutorMarketAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Гейт заморозки: замороженный репетитор не может создавать новые
   * действия на бирже (откликаться, размещать заявки). Без этой проверки
   * disabledAt был бы декоративным полем.
   */
  async assertNotFrozen(userId: string): Promise<void> {
    const profile = await (this.prisma as any).tutorMarketProfile.findUnique({
      where: { userId },
      select: { disabledAt: true },
    });
    if (profile?.disabledAt) {
      throw new ForbiddenException({
        code: 'AccountFrozen',
        message: 'Ваш аккаунт на бирже заморожен модератором. Обратитесь в поддержку.',
      });
    }
  }
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `cd backend && npx jest tutor-market-access.service.spec.ts`
Expected: PASS (3 теста).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/tutor-exchange/tutors/tutor-market-access.service.ts backend/src/modules/tutor-exchange/tutors/tutor-market-access.service.spec.ts
git commit -m "feat(биржа): TutorMarketAccessService — гейт заморозки"
```

---

### Task 3: Enforcement заморозки в createDialog и createLead

**Files:**
- Modify: `backend/src/modules/tutor-exchange/dialogs/dialogs.service.ts`
- Modify: `backend/src/modules/tutor-exchange/leads/leads.service.ts`
- Modify: `backend/src/modules/tutor-exchange/dialogs/dialogs.service.spec.ts`
- Modify: `backend/src/modules/tutor-exchange/leads/leads.service.spec.ts`
- Modify: `backend/src/modules/tutor-exchange/tutor-exchange.module.ts`

**Interfaces:**
- Consumes: `TutorMarketAccessService.assertNotFrozen` (Task 2).

- [ ] **Step 1: Тест — createDialog отклоняет замороженного**

В `dialogs.service.spec.ts` добавить в мок провайдер `TutorMarketAccessService` и тест:

```ts
// В providers TestingModule:
{ provide: TutorMarketAccessService, useValue: { assertNotFrozen: jest.fn().mockResolvedValue(undefined) } },
// импорт сверху:
import { TutorMarketAccessService } from '../tutors/tutor-market-access.service';

// доступ к моку:
let access: { assertNotFrozen: jest.Mock };
// в beforeEach после compile: access = mod.get(TutorMarketAccessService);

it('отклоняет отклик замороженного репетитора', async () => {
  access.assertNotFrozen.mockRejectedValueOnce(new ForbiddenException({ code: 'AccountFrozen' }));
  await expect(service.createDialog('frozen', { leadId: 'lead-1' }))
    .rejects.toBeInstanceOf(ForbiddenException);
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `cd backend && npx jest dialogs.service.spec.ts`
Expected: FAIL (assertNotFrozen не вызывается / провайдер не найден).

- [ ] **Step 3: Внедрить в `DialogsService`**

Конструктор — добавить зависимость:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly notifier: TutorExchangeNotifier,
  private readonly access: TutorMarketAccessService,
) {}
```

Импорт сверху: `import { TutorMarketAccessService } from '../tutors/tutor-market-access.service';`

В `createDialog`, первой строкой тела метода (до загрузки lead):

```ts
async createDialog(userId: string, input: { leadId: string }) {
  await this.access.assertNotFrozen(userId);
  const lead = await (this.prisma as any).lead.findUnique({
```

- [ ] **Step 4: Аналогично в `LeadsService.createLead`**

Импорт + конструктор:

```ts
import { TutorMarketAccessService } from '../tutors/tutor-market-access.service';
// ...
constructor(
  private readonly prisma: PrismaService,
  private readonly access: TutorMarketAccessService,
) {}
```

Первой строкой `createLead`:

```ts
async createLead(userId: string, input: CreateLeadInput) {
  await this.access.assertNotFrozen(userId);
  if (input.type === 'COMMISSION' && ...) {
```

- [ ] **Step 5: Тест в `leads.service.spec.ts`**

Добавить провайдер-мок и тест (по образцу шага 1); в существующих тестах `createLead` мок `assertNotFrozen` резолвится (не мешает).

```ts
it('отклоняет размещение заявки замороженным', async () => {
  access.assertNotFrozen.mockRejectedValueOnce(new ForbiddenException({ code: 'AccountFrozen' }));
  await expect(service.createLead('frozen', {
    type: 'FREE', subject: 'x', grade: '1', format: 'ONLINE',
    description: 'x'.repeat(30), studentContact: '+7',
  })).rejects.toBeInstanceOf(ForbiddenException);
});
```

- [ ] **Step 6: Зарегистрировать провайдер в модуле**

В `tutor-exchange.module.ts` добавить `TutorMarketAccessService` в `providers` (импорт сверху).

- [ ] **Step 7: Запустить тесты**

Run: `cd backend && npx jest src/modules/tutor-exchange/dialogs/dialogs.service.spec.ts src/modules/tutor-exchange/leads/leads.service.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/tutor-exchange/dialogs/dialogs.service.ts backend/src/modules/tutor-exchange/leads/leads.service.ts backend/src/modules/tutor-exchange/dialogs/dialogs.service.spec.ts backend/src/modules/tutor-exchange/leads/leads.service.spec.ts backend/src/modules/tutor-exchange/tutor-exchange.module.ts
git commit -m "feat(биржа): гейт заморозки в createDialog и createLead"
```

---

### Task 4: `notifyDisputeResolved` в нотификаторе

**Files:**
- Modify: `backend/src/modules/tutor-exchange/notifications/tutor-exchange-notifier.service.ts`

**Interfaces:**
- Produces: `notifyDisputeResolved(dialog: DialogLite, resolution: string): Promise<void>`.

- [ ] **Step 1: Добавить метод** (рядом с `notifyDisputeOpened`)

```ts
async notifyDisputeResolved(dialog: DialogLite, resolution: string): Promise<void> {
  const human =
    resolution === 'DEAL_CONFIRMED' ? 'сделка засчитана'
    : resolution === 'RETURNED_TO_FEED' ? 'заявка возвращена в ленту'
    : 'диалог закрыт';
  const recipients = [dialog.lead.creatorId, dialog.responderId];
  for (const userId of recipients) {
    await this.deliver(userId, {
      type: 'tutor_exchange.dispute_resolved',
      title: 'Спор разрешён модератором',
      message: `Спор по «${dialog.lead.subject}»: ${human}.`,
      metadata: { dialogId: dialog.id, resolution },
      tgText: `⚖️ Спор по «${dialog.lead.subject}» разрешён: ${human}. ${linkTo(dialog.id)}`,
    });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/tutor-exchange/notifications/tutor-exchange-notifier.service.ts
git commit -m "feat(биржа): уведомление о разрешении спора"
```

---

### Task 5: `DisputeService.resolveDispute` — все исходы

**Files:**
- Create: `backend/src/modules/tutor-exchange/dialogs/dispute.service.ts`
- Test: `backend/src/modules/tutor-exchange/dialogs/dispute.service.spec.ts`

**Interfaces:**
- Consumes: `TutorExchangeNotifier.notifyDisputeResolved` (Task 4).
- Produces: `resolveDispute(adminId, dialogId, { resolution, note, freezeResponder? }): Promise<{ ok: true; dialog: any }>`; `unfreezeTutor(userId): Promise<{ ok: true }>`.

- [ ] **Step 1: Написать падающие тесты**

```ts
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DisputeService } from './dispute.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TutorExchangeNotifier } from '../notifications/tutor-exchange-notifier.service';

describe('DisputeService', () => {
  let service: DisputeService;
  let prisma: any;

  const disputed = {
    id: 'd-1', leadId: 'lead-1', responderId: 'resp', status: 'DISPUTED',
    lead: { id: 'lead-1', subject: 'X', creatorId: 'creator' },
  };

  beforeEach(async () => {
    prisma = {
      leadDialog: { findUnique: jest.fn(), update: jest.fn() },
      lead: { update: jest.fn() },
      violationReport: { updateMany: jest.fn() },
      tutorMarketProfile: { upsert: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg)),
    };
    const mod = await Test.createTestingModule({
      providers: [
        DisputeService,
        { provide: PrismaService, useValue: prisma },
        { provide: TutorExchangeNotifier, useValue: { notifyDisputeResolved: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();
    service = mod.get(DisputeService);
  });

  it('404 если диалога нет', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue(null);
    await expect(service.resolveDispute('a', 'x', { resolution: 'CANCELLED', note: 'note1' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('400 если диалог не в DISPUTED', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue({ ...disputed, status: 'OPEN' });
    await expect(service.resolveDispute('a', 'd-1', { resolution: 'CANCELLED', note: 'note1' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('DEAL_CONFIRMED: диалог CONFIRMED, заявка CLOSED, dealsCompleted++ обоим, жалобы RESOLVED', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue(disputed);
    prisma.leadDialog.update.mockResolvedValue({ id: 'd-1', status: 'CONFIRMED' });
    await service.resolveDispute('admin', 'd-1', { resolution: 'DEAL_CONFIRMED', note: 'заплатил' });
    expect(prisma.leadDialog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'CONFIRMED', disputeResolution: 'DEAL_CONFIRMED', resolvedByAdminId: 'admin' }),
    }));
    expect(prisma.lead.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'CLOSED' }),
    }));
    expect(prisma.tutorMarketProfile.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.violationReport.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { dialogId: 'd-1', status: 'PENDING' }, data: { status: 'RESOLVED' },
    }));
  });

  it('RETURNED_TO_FEED: диалог CANCELLED, заявка ACTIVE + разблокирована', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue(disputed);
    prisma.leadDialog.update.mockResolvedValue({ id: 'd-1', status: 'CANCELLED' });
    await service.resolveDispute('admin', 'd-1', { resolution: 'RETURNED_TO_FEED', note: 'пропал' });
    expect(prisma.lead.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ACTIVE', lockedById: null, lockedAt: null }),
    }));
    expect(prisma.tutorMarketProfile.upsert).not.toHaveBeenCalled();
  });

  it('CANCELLED: диалог CANCELLED, заявка CANCELLED', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue(disputed);
    prisma.leadDialog.update.mockResolvedValue({ id: 'd-1', status: 'CANCELLED' });
    await service.resolveDispute('admin', 'd-1', { resolution: 'CANCELLED', note: 'неактуально' });
    expect(prisma.lead.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'CANCELLED' }),
    }));
  });

  it('freezeResponder=true: замораживает репетитора', async () => {
    prisma.leadDialog.findUnique.mockResolvedValue(disputed);
    prisma.leadDialog.update.mockResolvedValue({ id: 'd-1', status: 'CANCELLED' });
    await service.resolveDispute('admin', 'd-1', { resolution: 'RETURNED_TO_FEED', note: 'обман', freezeResponder: true });
    expect(prisma.tutorMarketProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'resp' },
      update: expect.objectContaining({ disabledByAdminId: 'admin' }),
    }));
  });

  it('unfreezeTutor снимает заморозку', async () => {
    prisma.tutorMarketProfile.update.mockResolvedValue({});
    const r = await service.unfreezeTutor('resp');
    expect(prisma.tutorMarketProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'resp' },
      data: { disabledAt: null, disabledReason: null, disabledByAdminId: null },
    }));
    expect(r).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `cd backend && npx jest dispute.service.spec.ts`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализовать `DisputeService`**

```ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TutorExchangeNotifier } from '../notifications/tutor-exchange-notifier.service';

export type DisputeResolution = 'DEAL_CONFIRMED' | 'RETURNED_TO_FEED' | 'CANCELLED';

interface ResolvePayload {
  resolution: DisputeResolution;
  note: string;
  freezeResponder?: boolean;
}

@Injectable()
export class DisputeService {
  private readonly logger = new Logger(DisputeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: TutorExchangeNotifier,
  ) {}

  async resolveDispute(adminId: string, dialogId: string, payload: ResolvePayload) {
    const dialog = await (this.prisma as any).leadDialog.findUnique({
      where: { id: dialogId },
      include: { lead: { select: { id: true, subject: true, creatorId: true } } },
    });
    if (!dialog) throw new NotFoundException('Диалог не найден');
    if (dialog.status !== 'DISPUTED') {
      throw new BadRequestException('Разрешить можно только диалог в статусе спора');
    }

    const now = new Date();
    const audit = {
      disputeResolution: payload.resolution,
      resolvedByAdminId: adminId,
      resolvedAt: now,
      resolutionNote: payload.note.trim(),
    };

    const updated = await this.prisma.$transaction(async (tx: any) => {
      const ops: Promise<any>[] = [];

      // Жалобы по диалогу — закрываем.
      ops.push(tx.violationReport.updateMany({
        where: { dialogId, status: 'PENDING' },
        data: { status: 'RESOLVED' },
      }));

      let dialogResult: any;
      if (payload.resolution === 'DEAL_CONFIRMED') {
        dialogResult = await tx.leadDialog.update({
          where: { id: dialogId },
          data: { ...audit, status: 'CONFIRMED', closedAt: now },
        });
        ops.push(tx.lead.update({ where: { id: dialog.leadId }, data: { status: 'CLOSED' } }));
        ops.push(this.incrementDeals(tx, dialog.lead.creatorId));
        ops.push(this.incrementDeals(tx, dialog.responderId));
      } else if (payload.resolution === 'RETURNED_TO_FEED') {
        dialogResult = await tx.leadDialog.update({
          where: { id: dialogId },
          data: { ...audit, status: 'CANCELLED', closedAt: now },
        });
        ops.push(tx.lead.update({
          where: { id: dialog.leadId },
          data: { status: 'ACTIVE', lockedById: null, lockedAt: null },
        }));
      } else {
        dialogResult = await tx.leadDialog.update({
          where: { id: dialogId },
          data: { ...audit, status: 'CANCELLED', closedAt: now },
        });
        ops.push(tx.lead.update({ where: { id: dialog.leadId }, data: { status: 'CANCELLED' } }));
      }

      if (payload.freezeResponder) {
        ops.push(tx.tutorMarketProfile.upsert({
          where: { userId: dialog.responderId },
          update: { disabledAt: now, disabledReason: payload.note.trim(), disabledByAdminId: adminId },
          create: { userId: dialog.responderId, disabledAt: now, disabledReason: payload.note.trim(), disabledByAdminId: adminId },
        }));
      }

      await Promise.all(ops);
      return dialogResult;
    });

    this.logger.log(`dispute resolved dialog=${dialogId} by=${adminId} resolution=${payload.resolution} freeze=${!!payload.freezeResponder}`);

    void this.notifier.notifyDisputeResolved(
      { id: dialog.id, responderId: dialog.responderId, lead: { id: dialog.lead.id, subject: dialog.lead.subject, creatorId: dialog.lead.creatorId } },
      payload.resolution,
    );

    return { ok: true as const, dialog: updated };
  }

  async unfreezeTutor(userId: string) {
    await (this.prisma as any).tutorMarketProfile.update({
      where: { userId },
      data: { disabledAt: null, disabledReason: null, disabledByAdminId: null },
    });
    return { ok: true as const };
  }

  private incrementDeals(tx: any, userId: string) {
    return tx.tutorMarketProfile.upsert({
      where: { userId },
      update: { dealsCompleted: { increment: 1 } },
      create: { userId, dealsCompleted: 1 },
    });
  }
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `cd backend && npx jest dispute.service.spec.ts`
Expected: PASS (7 тестов).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/tutor-exchange/dialogs/dispute.service.ts backend/src/modules/tutor-exchange/dialogs/dispute.service.spec.ts
git commit -m "feat(биржа): DisputeService — резолюция спора и разморозка"
```

---

### Task 6: DTO + `AdminDisputeController` + регистрация в модуле

**Files:**
- Create: `backend/src/modules/tutor-exchange/dialogs/dto/resolve-dispute.dto.ts`
- Create: `backend/src/modules/tutor-exchange/dialogs/admin-dispute.controller.ts`
- Modify: `backend/src/modules/tutor-exchange/tutor-exchange.module.ts`

**Interfaces:**
- Consumes: `DisputeService` (Task 5).

- [ ] **Step 1: DTO**

```ts
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export enum DisputeResolutionDto {
  DEAL_CONFIRMED = 'DEAL_CONFIRMED',
  RETURNED_TO_FEED = 'RETURNED_TO_FEED',
  CANCELLED = 'CANCELLED',
}

export class ResolveDisputeDto {
  @IsEnum(DisputeResolutionDto)
  resolution!: DisputeResolutionDto;

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  note!: string;

  @IsOptional()
  @IsBoolean()
  freezeResponder?: boolean;
}
```

- [ ] **Step 2: Контроллер**

```ts
import { Body, Controller, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../admin/guards/admin.guard';
import { DisputeService } from './dispute.service';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';

@Controller('admin/tutor-exchange')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminDisputeController {
  constructor(private readonly disputes: DisputeService) {}

  @Post('dialogs/:dialogId/resolve')
  resolve(@Request() req: any, @Param('dialogId') dialogId: string, @Body() body: ResolveDisputeDto) {
    return this.disputes.resolveDispute(req.user.id, dialogId, body);
  }

  @Post('tutors/:userId/unfreeze')
  unfreeze(@Param('userId') userId: string) {
    return this.disputes.unfreezeTutor(userId);
  }
}
```

- [ ] **Step 3: Регистрация в `tutor-exchange.module.ts`**

Импорты + добавить `AdminDisputeController` в `controllers`, `DisputeService` в `providers`.

- [ ] **Step 4: Typecheck + прогон модуля**

Run: `cd backend && npx tsc --noEmit && npx jest src/modules/tutor-exchange`
Expected: без ошибок, все тесты PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/tutor-exchange/dialogs/dto/resolve-dispute.dto.ts backend/src/modules/tutor-exchange/dialogs/admin-dispute.controller.ts backend/src/modules/tutor-exchange/tutor-exchange.module.ts
git commit -m "feat(биржа): админский endpoint разрешения спора и разморозки"
```

---

### Task 7: Фронтенд — блок резолюции на странице жалоб

**Files:**
- Modify: `frontend/src/hooks/tutor-exchange/useAdminViolations.ts`
- Modify: `frontend/src/app/check/prrv/admin/violations/page.tsx`

**Interfaces:**
- Consumes: `POST /admin/tutor-exchange/dialogs/:id/resolve`, `POST /admin/tutor-exchange/tutors/:id/unfreeze`.

- [ ] **Step 1: Расширить `AdminViolation`** — убедиться, что в типе есть `dialog.status`, `dialog.responder.id`, `dialog.lead.creator.id` и статус заморозки репетитора. Прочитать текущий `useAdminViolations.ts`; при отсутствии `responder.marketProfile.disabledAt` в бэкенд-include (`violations.service.ts` `ADMIN_LIST_INCLUDE`) — добавить его туда:

```ts
responder: { select: { id: true, firstName: true, lastName: true, marketProfile: { select: { disabledAt: true } } } },
```

(и симметрично в типе хука.)

- [ ] **Step 2: UI резолюции** — в `page.tsx`, для жалобы где `v.dialog.status === 'DISPUTED'`, показать блок: три кнопки исхода, `textarea` note (обязателен, ≥5), чекбокс «Заморозить репетитора». Обработчик:

```ts
const resolve = async (dialogId: string, resolution: string, note: string, freezeResponder: boolean) => {
  await apiClient.post(`/admin/tutor-exchange/dialogs/${dialogId}/resolve`, { resolution, note, freezeResponder });
  reload();
};
```

Кнопка «Разморозить» если `v.dialog.responder.marketProfile?.disabledAt`:

```ts
const unfreeze = async (userId: string) => {
  await apiClient.post(`/admin/tutor-exchange/tutors/${userId}/unfreeze`, {});
  reload();
};
```

- [ ] **Step 3: Typecheck фронта**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/tutor-exchange/useAdminViolations.ts frontend/src/app/check/prrv/admin/violations/page.tsx backend/src/modules/tutor-exchange/violations/violations.service.ts
git commit -m "feat(биржа): UI разрешения спора в админке жалоб"
```

---

### Task 8: Финальная проверка и push

- [ ] **Step 1: Полный прогон**

Run: `cd backend && npx tsc --noEmit && npx jest src/modules/tutor-exchange && cd ../frontend && npx tsc --noEmit`
Expected: всё зелёное.

- [ ] **Step 2: Pull + push**

```bash
git -C /Users/ruslanalpenov/prepodavai pull --rebase origin master
git -C /Users/ruslanalpenov/prepodavai push origin master
```
