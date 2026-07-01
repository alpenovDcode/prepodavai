# Tutor Exchange — Stage 1 (Фундамент) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заложить инфраструктурный фундамент биржи лидов в prepodavai: миграция БД со всеми 6 таблицами, обобщённый per-tool переключатель через `SystemService`, `ExchangeEnabledGuard`, пустой скелет `TutorExchangeModule` и админ-страница `/check/prrv/admin/tools` с переключателем `tutor_exchange`. Non-admin ничего не видит.

**Architecture:** Обобщаем существующий maintenance-паттерн под универсальные per-tool флаги. `SystemService` получает пару методов `getToolStatus(opKey)` / `setToolStatus(opKey, ...)`, поверх которых работают публичный и админский эндпоинты, гвард биржи и админ-страница. Скелет модуля биржи регистрируется в `AppModule` под гвардом — все будущие эндпоинты этапов 2–6 автоматически лягут под флаг.

**Tech Stack:** NestJS 10 + Prisma 5 + PostgreSQL, Next.js 15+ (frontend), Jest + ts-jest (backend unit-тесты), Tailwind + lucide-react (админ UI), grammy (не трогаем в этом этапе).

## Global Constraints

- Все новые backend-файлы лежат в `backend/src/modules/tutor-exchange/`, все новые frontend-файлы — в `frontend/src/app/check/prrv/admin/tools/` и `frontend/src/hooks/tutor-exchange/`.
- Флаг по умолчанию `enabled=false`, `message='Биржа лидов скоро откроется — мы обкатываем последние детали'`.
- `opKey` для биржи: строка `'tutor_exchange'`.
- Ключи в `SystemSetting`: `tools.tutor_exchange.enabled` и `tools.tutor_exchange.message`. Общий формат для будущих инструментов — `tools.<opKey>.enabled` и `tools.<opKey>.message`.
- Кеш статуса в `SystemService` — TTL 10_000 ms (совпадает с существующим).
- Все backend-коммиты: явные пути в `git add`, никакого `-A/-u/.`. Сообщения короткие, без упоминания Claude.
- Backend миграции — `npx prisma migrate dev --name add_tutor_exchange` из `backend/`. Postgres в docker-compose.dev.yml поднят на localhost:5432.
- Frontend jest не сконфигурирован, поэтому фронт-задача завершается ручным smoke-check'ом (Task 6).
- Регистрация модуля в `backend/src/app.module.ts` — импорт добавляем В КОНЕЦ существующего списка `imports:`.

---

## Files

**Backend** (все под `backend/`):
- Modify `prisma/schema.prisma` — добавить 6 моделей + back-relations в `AppUser`
- Create `prisma/migrations/YYYYMMDDHHMMSS_add_tutor_exchange/migration.sql` (генерируется Prisma)
- Modify `src/modules/system/system.service.ts` — методы `getToolStatus`/`setToolStatus`
- Modify `src/modules/system/system.controller.ts` — новый публичный эндпоинт `GET /system/tool-status`, новый админский `POST /admin/tool-status`
- Create `src/modules/system/system.service.spec.ts` — юнит-тесты новых методов
- Create `src/modules/tutor-exchange/tutor-exchange.module.ts` — скелет
- Create `src/modules/tutor-exchange/guards/exchange-enabled.guard.ts` — гвард
- Create `src/modules/tutor-exchange/guards/exchange-enabled.guard.spec.ts` — юнит-тесты гварда
- Modify `src/app.module.ts` — регистрация `TutorExchangeModule`

**Frontend** (все под `frontend/src/`):
- Create `app/check/prrv/admin/tools/page.tsx` — страница переключателей
- Modify `app/check/prrv/admin/layout.tsx` — новый пункт «Инструменты» в navigation
- Create `hooks/tutor-exchange/useTutorExchangeEnabled.ts` — SWR-хук (пригодится в этапе 2, но полезен для smoke-check)

---

## Task 1: Prisma migration `add_tutor_exchange`

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_tutor_exchange/migration.sql` (сгенерирует Prisma)

**Interfaces:**
- Consumes: existing `AppUser` model
- Produces: 6 новых моделей (`TutorMarketProfile`, `Lead`, `LeadDialog`, `LeadMessage`, `ViolationReport`, `TutorRating`) + back-relations в `AppUser`, доступные через `prisma.tutorMarketProfile`, `prisma.lead`, `prisma.leadDialog`, `prisma.leadMessage`, `prisma.violationReport`, `prisma.tutorRating`

- [ ] **Step 1: Открыть текущий schema.prisma и найти конец блока `model AppUser { ... }`**

Проверяем структуру:
```bash
grep -n "^}" backend/prisma/schema.prisma | head -20
grep -n "^model AppUser" backend/prisma/schema.prisma
```

Результат: должны увидеть номер строки, где заканчивается `AppUser` (близко к 80–90 строке).

- [ ] **Step 2: Добавить back-relations внутрь `model AppUser`**

В файле `backend/prisma/schema.prisma` внутри `model AppUser { ... }`, перед закрывающей `}`, добавить блок (сохраняем стиль форматирования Prisma — выравнивание по столбцам не обязательно, Prisma сама переформатирует):

```prisma
  // Tutor exchange (биржа лидов) — Stage 1 back-relations
  marketProfile      TutorMarketProfile?
  leadsCreated       Lead[]              @relation("leadCreator")
  dialogsAsResponder LeadDialog[]        @relation("dialogResponder")
  leadMessages       LeadMessage[]
  violationReports   ViolationReport[]   @relation("violationReporter")
  ratingsGiven       TutorRating[]       @relation("ratingRater")
  ratingsReceived    TutorRating[]       @relation("ratingRatee")
```

- [ ] **Step 3: Добавить 6 новых моделей в конец `schema.prisma`**

Дописать в самый конец файла:

```prisma
// ========== TUTOR EXCHANGE (биржа лидов) — Stage 1 ==========

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

  @@map("tutor_market_profiles")
}

model Lead {
  id             String   @id @default(uuid())
  creatorId      String
  creator        AppUser  @relation("leadCreator", fields: [creatorId], references: [id])
  subject        String
  subjectLower   String
  grade          String
  format         String
  city           String?
  description    String
  studentContact String
  type           String
  price          Float    @default(0)
  status         String   @default("ACTIVE")
  lockedById     String?
  lockedAt       DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  dialogs LeadDialog[]

  @@index([status, subjectLower])
  @@index([creatorId])
  @@map("leads")
}

model LeadDialog {
  id                       String    @id @default(uuid())
  leadId                   String
  lead                     Lead      @relation(fields: [leadId], references: [id], onDelete: Cascade)
  responderId              String
  responder                AppUser   @relation("dialogResponder", fields: [responderId], references: [id])
  status                   String    @default("OPEN")
  trialLessonLink          String?
  trialScheduledAt         DateTime?
  trialResultAt            DateTime?
  paymentDeadline          DateTime?
  paymentSentAt            DateTime?
  paymentOverdueNotifiedAt DateTime?
  createdAt                DateTime  @default(now())
  closedAt                 DateTime?

  messages LeadMessage[]
  reports  ViolationReport[]
  ratings  TutorRating[]

  @@index([responderId, status])
  @@index([leadId])
  @@map("lead_dialogs")
}

model LeadMessage {
  id        String     @id @default(uuid())
  dialogId  String
  dialog    LeadDialog @relation(fields: [dialogId], references: [id], onDelete: Cascade)
  senderId  String?
  sender    AppUser?   @relation(fields: [senderId], references: [id])
  content   String
  flagged   Boolean    @default(false)
  isSystem  Boolean    @default(false)
  createdAt DateTime   @default(now())

  @@index([dialogId, createdAt])
  @@map("lead_messages")
}

model ViolationReport {
  id          String     @id @default(uuid())
  dialogId    String
  dialog      LeadDialog @relation(fields: [dialogId], references: [id])
  reporterId  String
  reporter    AppUser    @relation("violationReporter", fields: [reporterId], references: [id])
  description String
  status      String     @default("PENDING")
  createdAt   DateTime   @default(now())

  @@map("violation_reports")
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
  @@map("tutor_ratings")
}
```

- [ ] **Step 4: Прогнать `prisma validate` — быстрая проверка синтаксиса до миграции**

Run из `backend/`:
```bash
cd backend && npx prisma validate
```
Expected: `The schema at prisma/schema.prisma is valid 🚀`. Если ошибка — читаем и правим (типично: пропущенная запятая в relation).

- [ ] **Step 5: Убедиться, что локальный dev-Postgres запущен**

Run из корня:
```bash
docker compose -f docker-compose.dev.yml ps
```
Expected: сервис `postgres` в статусе `Up` / `running`. Если нет — `docker compose -f docker-compose.dev.yml up -d postgres`.

- [ ] **Step 6: Создать миграцию**

Run из `backend/`:
```bash
cd backend && npx prisma migrate dev --name add_tutor_exchange
```
Expected output содержит:
- `Applying migration '<timestamp>_add_tutor_exchange'`
- `The following migration(s) have been applied:` с новым каталогом
- `✔ Generated Prisma Client`

Если миграция не проходит из-за пересечения имён / FK — читаем ошибку, правим schema, перезапускаем.

- [ ] **Step 7: Проверить, что таблицы созданы**

Run из `backend/`:
```bash
cd backend && npx prisma db execute --stdin <<'SQL'
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('tutor_market_profiles', 'leads', 'lead_dialogs', 'lead_messages', 'violation_reports', 'tutor_ratings')
ORDER BY tablename;
SQL
```
Expected: 6 строк, все шесть таблиц перечислены.

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(db): add tutor exchange schema (6 tables + back-relations)"
```

---

## Task 2: `SystemService.getToolStatus` / `setToolStatus`

**Files:**
- Modify: `backend/src/modules/system/system.service.ts`
- Create: `backend/src/modules/system/system.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `ConfigService`
- Produces:
  ```ts
  interface ToolStatus { enabled: boolean; message: string; updatedAt: Date | null }
  class SystemService {
    getToolStatus(opKey: string, force?: boolean): Promise<ToolStatus>
    setToolStatus(opKey: string, patch: { enabled: boolean; message?: string }, adminId: string): Promise<ToolStatus>
  }
  ```
  Дефолтное сообщение зависит от `opKey`:
  - `tutor_exchange` → `'Биржа лидов скоро откроется — мы обкатываем последние детали'`
  - остальные → `'Инструмент временно недоступен'`

- [ ] **Step 1: Написать failing spec**

Create `backend/src/modules/system/system.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SystemService } from './system.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('SystemService tool-status', () => {
  let service: SystemService;
  let prisma: {
    systemSetting: {
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      systemSetting: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('') },
        },
      ],
    }).compile();

    service = module.get(SystemService);
  });

  describe('getToolStatus', () => {
    it('returns default disabled state for tutor_exchange when no rows', async () => {
      prisma.systemSetting.findMany.mockResolvedValue([]);
      const status = await service.getToolStatus('tutor_exchange');
      expect(status.enabled).toBe(false);
      expect(status.message).toBe(
        'Биржа лидов скоро откроется — мы обкатываем последние детали',
      );
      expect(prisma.systemSetting.findMany).toHaveBeenCalledWith({
        where: { key: { in: ['tools.tutor_exchange.enabled', 'tools.tutor_exchange.message'] } },
      });
    });

    it('returns enabled=true when SystemSetting row says so', async () => {
      prisma.systemSetting.findMany.mockResolvedValue([
        { key: 'tools.tutor_exchange.enabled', value: 'true', updatedAt: new Date('2026-07-02T10:00:00Z') },
      ]);
      const status = await service.getToolStatus('tutor_exchange');
      expect(status.enabled).toBe(true);
    });

    it('uses fallback message for unknown opKey', async () => {
      prisma.systemSetting.findMany.mockResolvedValue([]);
      const status = await service.getToolStatus('some_other_tool');
      expect(status.message).toBe('Инструмент временно недоступен');
    });

    it('caches result within TTL', async () => {
      prisma.systemSetting.findMany.mockResolvedValue([]);
      await service.getToolStatus('tutor_exchange');
      await service.getToolStatus('tutor_exchange');
      expect(prisma.systemSetting.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('setToolStatus', () => {
    it('upserts enabled flag and refreshes cache', async () => {
      prisma.systemSetting.upsert.mockResolvedValue({});
      prisma.systemSetting.findMany.mockResolvedValue([
        { key: 'tools.tutor_exchange.enabled', value: 'true', updatedAt: new Date() },
      ]);

      const status = await service.setToolStatus('tutor_exchange', { enabled: true }, 'admin-42');

      expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'tools.tutor_exchange.enabled' },
          update: { value: 'true', updatedBy: 'admin-42' },
          create: { key: 'tools.tutor_exchange.enabled', value: 'true', updatedBy: 'admin-42' },
        }),
      );
      expect(status.enabled).toBe(true);
    });

    it('upserts message when provided', async () => {
      prisma.systemSetting.upsert.mockResolvedValue({});
      prisma.systemSetting.findMany.mockResolvedValue([]);

      await service.setToolStatus(
        'tutor_exchange',
        { enabled: false, message: 'Привет' },
        'admin-42',
      );

      const calls = prisma.systemSetting.upsert.mock.calls.map(
        (c: any[]) => c[0].where.key,
      );
      expect(calls).toContain('tools.tutor_exchange.message');
    });
  });
});
```

- [ ] **Step 2: Прогнать тесты, убедиться что они падают**

Run из `backend/`:
```bash
cd backend && npx jest src/modules/system/system.service.spec.ts
```
Expected: FAIL (`getToolStatus is not a function` или похожее).

- [ ] **Step 3: Реализовать методы в `system.service.ts`**

Modify `backend/src/modules/system/system.service.ts`. Добавить над классом `SystemService` (после существующих `KEY_ENABLED`/`KEY_MESSAGE` констант):

```ts
const TOOL_DEFAULT_MESSAGES: Record<string, string> = {
  tutor_exchange: 'Биржа лидов скоро откроется — мы обкатываем последние детали',
};
const TOOL_FALLBACK_MESSAGE = 'Инструмент временно недоступен';

export interface ToolStatus {
  enabled: boolean;
  message: string;
  updatedAt: Date | null;
}

function toolKeys(opKey: string) {
  return {
    enabled: `tools.${opKey}.enabled`,
    message: `tools.${opKey}.message`,
  };
}
```

Внутри класса `SystemService` добавить кеш и методы (кладём после существующего `setMaintenance`):

```ts
  // Per-tool cache: opKey → { status, expiresAt }
  private toolCache = new Map<string, { status: ToolStatus; expiresAt: number }>();

  async getToolStatus(opKey: string, force = false): Promise<ToolStatus> {
    const now = Date.now();
    const cached = this.toolCache.get(opKey);
    if (!force && cached && cached.expiresAt > now) return cached.status;

    const keys = toolKeys(opKey);
    const rows = await (this.prisma as any).systemSetting.findMany({
      where: { key: { in: [keys.enabled, keys.message] } },
    });
    const enabledRow = rows.find((r: any) => r.key === keys.enabled);
    const messageRow = rows.find((r: any) => r.key === keys.message);

    const status: ToolStatus = {
      enabled: enabledRow?.value === 'true',
      message:
        messageRow?.value ||
        TOOL_DEFAULT_MESSAGES[opKey] ||
        TOOL_FALLBACK_MESSAGE,
      updatedAt: enabledRow?.updatedAt ?? messageRow?.updatedAt ?? null,
    };
    this.toolCache.set(opKey, {
      status,
      expiresAt: now + SystemService.CACHE_TTL_MS,
    });
    return status;
  }

  async setToolStatus(
    opKey: string,
    patch: { enabled: boolean; message?: string },
    adminId: string,
  ): Promise<ToolStatus> {
    const keys = toolKeys(opKey);
    const ops: Promise<any>[] = [
      (this.prisma as any).systemSetting.upsert({
        where: { key: keys.enabled },
        update: { value: patch.enabled ? 'true' : 'false', updatedBy: adminId },
        create: {
          key: keys.enabled,
          value: patch.enabled ? 'true' : 'false',
          updatedBy: adminId,
        },
      }),
    ];
    if (patch.message !== undefined) {
      const trimmed = (patch.message ?? '').slice(0, 1000);
      ops.push(
        (this.prisma as any).systemSetting.upsert({
          where: { key: keys.message },
          update: { value: trimmed || null, updatedBy: adminId },
          create: {
            key: keys.message,
            value: trimmed || null,
            updatedBy: adminId,
          },
        }),
      );
    }
    await Promise.all(ops);
    this.toolCache.delete(opKey);
    this.logger.warn(
      `[Tool ${opKey}] toggled by admin=${adminId}: enabled=${patch.enabled}` +
        (patch.message !== undefined ? ` message="${patch.message}"` : ''),
    );
    return this.getToolStatus(opKey, true);
  }
```

- [ ] **Step 4: Прогнать тесты, убедиться что зелёные**

Run из `backend/`:
```bash
cd backend && npx jest src/modules/system/system.service.spec.ts
```
Expected: `Tests: 5 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/system/system.service.ts backend/src/modules/system/system.service.spec.ts
git commit -m "feat(system): per-tool status API in SystemService"
```

---

## Task 3: Публичный + админский эндпоинты tool-status

**Files:**
- Modify: `backend/src/modules/system/system.controller.ts`

**Interfaces:**
- Consumes: `SystemService.getToolStatus`, `SystemService.setToolStatus`, `JwtAuthGuard`, `AdminGuard`
- Produces:
  - `GET /api/system/tool-status?opKey=<key>` → `{ opKey, enabled, message, updatedAt }`, публично
  - `POST /api/admin/tool-status` `{ opKey, enabled, message? }` → полный `ToolStatus`, требует JwtAuthGuard + AdminGuard

- [ ] **Step 1: Дополнить `SetMaintenanceDto`-стайл валидатор для tool-status**

Modify `backend/src/modules/system/system.controller.ts`. Добавить рядом с `SetMaintenanceDto`:

```ts
class SetToolStatusDto {
  @IsString()
  @MaxLength(50)
  opKey: string;

  @IsBoolean()
  enabled: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  message?: string;
}
```

- [ ] **Step 2: Добавить публичный эндпоинт в `SystemController`**

В классе `SystemController` (публичном) добавить метод:

```ts
  @Get('tool-status')
  async getToolStatus(@Query('opKey') opKey: string) {
    if (!opKey) {
      return { error: 'opKey required' };
    }
    const status = await this.systemService.getToolStatus(opKey);
    return {
      opKey,
      enabled: status.enabled,
      message: status.message,
      updatedAt: status.updatedAt,
    };
  }
```

Обязательно импортировать `Query` из `@nestjs/common` в существующем import-блоке контроллера.

- [ ] **Step 3: Добавить админский эндпоинт в `AdminSystemController`**

В классе `AdminSystemController` (внизу файла, уже под `@UseGuards(JwtAuthGuard, AdminGuard)`) добавить два метода:

```ts
  @Get('/tool-status')
  async getTool(@Query('opKey') opKey: string) {
    if (!opKey) return { error: 'opKey required' };
    return this.systemService.getToolStatus(opKey, true);
  }

  @Post('/tool-status')
  @HttpCode(200)
  async setTool(@Request() req: any, @Body() body: SetToolStatusDto) {
    return this.systemService.setToolStatus(
      body.opKey,
      { enabled: body.enabled, message: body.message },
      req.user.id,
    );
  }
```

**ВНИМАНИЕ**: путь контроллера `admin/maintenance` — не подходит для `tool-status`. Нужно вынести админскую логику tool-status в отдельный контроллер под `admin/tool-status` **либо** перевесить `AdminSystemController` на префикс `admin` и раскинуть маршруты явно. Простейший вариант — новый контроллер:

Заменить последний `AdminSystemController` в файле следующей структурой (не удаляем существующий — просто добавляем НОВЫЙ рядом):

```ts
@Controller('admin/tool-status')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminToolStatusController {
  constructor(private readonly systemService: SystemService) {}

  @Get()
  async get(@Query('opKey') opKey: string) {
    if (!opKey) return { error: 'opKey required' };
    return this.systemService.getToolStatus(opKey, true);
  }

  @Post()
  @HttpCode(200)
  async set(@Request() req: any, @Body() body: SetToolStatusDto) {
    return this.systemService.setToolStatus(
      body.opKey,
      { enabled: body.enabled, message: body.message },
      req.user.id,
    );
  }
}
```

- [ ] **Step 4: Зарегистрировать новый контроллер в `SystemModule`**

Modify `backend/src/modules/system/system.module.ts`. В импорте:

```ts
import { SystemController, AdminSystemController, AdminToolStatusController } from './system.controller';
```

В массиве `controllers:` добавить `AdminToolStatusController`:

```ts
controllers: [SystemController, AdminSystemController, AdminToolStatusController],
```

- [ ] **Step 5: Запустить backend локально и проверить эндпоинты**

Run из `backend/`:
```bash
cd backend && npm run start:dev
```
В другом окне (или подождать пока backend поднимется на 4000/8080 — зависит от env):

```bash
# Публичный эндпоинт — без auth
curl -sS 'http://localhost:8080/api/system/tool-status?opKey=tutor_exchange' | jq
```
Expected JSON:
```json
{
  "opKey": "tutor_exchange",
  "enabled": false,
  "message": "Биржа лидов скоро откроется — мы обкатываем последние детали",
  "updatedAt": null
}
```

Если порт другой — узнать через `grep -E "PORT|listen" backend/src/main.ts` и подставить.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/system/system.controller.ts backend/src/modules/system/system.module.ts
git commit -m "feat(system): public + admin tool-status endpoints"
```

---

## Task 4: `ExchangeEnabledGuard`

**Files:**
- Create: `backend/src/modules/tutor-exchange/guards/exchange-enabled.guard.ts`
- Create: `backend/src/modules/tutor-exchange/guards/exchange-enabled.guard.spec.ts`

**Interfaces:**
- Consumes: `SystemService.getToolStatus('tutor_exchange')`, `SystemService.isAdminUserId(userId)`
- Produces:
  ```ts
  @Injectable()
  class ExchangeEnabledGuard implements CanActivate {
    canActivate(ctx: ExecutionContext): Promise<boolean>
  }
  ```
  Пропускает: если `enabled=true` **или** `req.user.id` — админ. Иначе бросает `ServiceUnavailableException({ tutorExchangeDisabled: true, message })`.

- [ ] **Step 1: Написать failing spec**

Create `backend/src/modules/tutor-exchange/guards/exchange-enabled.guard.spec.ts`:

```ts
import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { ExchangeEnabledGuard } from './exchange-enabled.guard';

describe('ExchangeEnabledGuard', () => {
  let systemService: {
    getToolStatus: jest.Mock;
    isAdminUserId: jest.Mock;
  };
  let guard: ExchangeEnabledGuard;

  const makeCtx = (userId: string | null): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => (userId ? { user: { id: userId } } : {}),
      }),
    }) as any;

  beforeEach(() => {
    systemService = {
      getToolStatus: jest.fn(),
      isAdminUserId: jest.fn(),
    };
    guard = new ExchangeEnabledGuard(systemService as any);
  });

  it('allows request when enabled=true', async () => {
    systemService.getToolStatus.mockResolvedValue({
      enabled: true,
      message: '',
      updatedAt: null,
    });
    systemService.isAdminUserId.mockReturnValue(false);

    await expect(guard.canActivate(makeCtx('user-1'))).resolves.toBe(true);
  });

  it('allows admin even when disabled', async () => {
    systemService.getToolStatus.mockResolvedValue({
      enabled: false,
      message: 'offline',
      updatedAt: null,
    });
    systemService.isAdminUserId.mockReturnValue(true);

    await expect(guard.canActivate(makeCtx('admin-1'))).resolves.toBe(true);
  });

  it('throws 503 for non-admin when disabled', async () => {
    systemService.getToolStatus.mockResolvedValue({
      enabled: false,
      message: 'offline reason',
      updatedAt: null,
    });
    systemService.isAdminUserId.mockReturnValue(false);

    await expect(guard.canActivate(makeCtx('user-1'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('includes tutorExchangeDisabled marker in the exception body', async () => {
    systemService.getToolStatus.mockResolvedValue({
      enabled: false,
      message: 'offline reason',
      updatedAt: null,
    });
    systemService.isAdminUserId.mockReturnValue(false);

    try {
      await guard.canActivate(makeCtx('user-1'));
      throw new Error('should not reach here');
    } catch (err: any) {
      expect(err.getResponse()).toEqual({
        tutorExchangeDisabled: true,
        message: 'offline reason',
      });
    }
  });
});
```

- [ ] **Step 2: Запустить тесты, убедиться что падают**

Run из `backend/`:
```bash
cd backend && npx jest src/modules/tutor-exchange
```
Expected: FAIL (`Cannot find module './exchange-enabled.guard'`).

- [ ] **Step 3: Реализовать guard**

Create `backend/src/modules/tutor-exchange/guards/exchange-enabled.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SystemService } from '../../system/system.service';

const OP_KEY = 'tutor_exchange';

@Injectable()
export class ExchangeEnabledGuard implements CanActivate {
  constructor(private readonly systemService: SystemService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const userId: string | undefined = req?.user?.id;

    if (userId && this.systemService.isAdminUserId(userId)) {
      return true;
    }

    const status = await this.systemService.getToolStatus(OP_KEY);
    if (status.enabled) return true;

    throw new ServiceUnavailableException({
      tutorExchangeDisabled: true,
      message: status.message,
    });
  }
}
```

- [ ] **Step 4: Запустить тесты, убедиться что зелёные**

Run из `backend/`:
```bash
cd backend && npx jest src/modules/tutor-exchange
```
Expected: `Tests: 4 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/tutor-exchange/guards/exchange-enabled.guard.ts backend/src/modules/tutor-exchange/guards/exchange-enabled.guard.spec.ts
git commit -m "feat(tutor-exchange): ExchangeEnabledGuard reading SystemService flag"
```

---

## Task 5: Скелет `TutorExchangeModule` и регистрация в `AppModule`

**Files:**
- Create: `backend/src/modules/tutor-exchange/tutor-exchange.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `SystemModule` (для доступа к `SystemService`), `PrismaModule`, `AuthModule` (не обязателен здесь, но пригодится в этапе 2)
- Produces: `TutorExchangeModule` (пустой контейнер + провайдер `ExchangeEnabledGuard`, экспортированный для будущих контроллеров)

- [ ] **Step 1: Создать модуль**

Create `backend/src/modules/tutor-exchange/tutor-exchange.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { SystemModule } from '../system/system.module';
import { ExchangeEnabledGuard } from './guards/exchange-enabled.guard';

/**
 * Биржа лидов между репетиторами. Пока модуль-контейнер: контроллеры
 * этапов 2–6 (leads, dialogs, messages, violations, ratings) регистрируются
 * ниже, все они автоматически попадают под ExchangeEnabledGuard.
 */
@Module({
  imports: [PrismaModule, SystemModule],
  providers: [ExchangeEnabledGuard],
  exports: [ExchangeEnabledGuard],
})
export class TutorExchangeModule {}
```

- [ ] **Step 2: Зарегистрировать модуль в `AppModule`**

Modify `backend/src/app.module.ts`. В блоке `import` добавить:

```ts
import { TutorExchangeModule } from './modules/tutor-exchange/tutor-exchange.module';
```

В массиве `imports:` внутри `@Module({...})` добавить `TutorExchangeModule` в конце списка модулей.

- [ ] **Step 3: Собрать проект — убедиться что модуль резолвится**

Run из `backend/`:
```bash
cd backend && npx tsc --noEmit
```
Expected: пусто (нет ошибок компиляции).

Если есть ошибка на импорт — проверить пути и наличие `SystemModule.exports` включающих `SystemService` (уже там — проверено).

- [ ] **Step 4: Запустить весь jest**

Run из `backend/`:
```bash
cd backend && npx jest --testPathPattern="(system|tutor-exchange)"
```
Expected: все прошлые тесты (9 штук: 5 SystemService + 4 guard) зелёные.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/tutor-exchange/tutor-exchange.module.ts backend/src/app.module.ts
git commit -m "feat(tutor-exchange): register empty module in AppModule"
```

---

## Task 6: Админ-страница `/check/prrv/admin/tools`

**Files:**
- Create: `frontend/src/app/check/prrv/admin/tools/page.tsx`
- Modify: `frontend/src/app/check/prrv/admin/layout.tsx`
- Create: `frontend/src/hooks/tutor-exchange/useTutorExchangeEnabled.ts`

**Interfaces:**
- Consumes: `apiClient` из `@/lib/api/client` (существующий), эндпоинты `GET /admin/tool-status?opKey=tutor_exchange` и `POST /admin/tool-status`, публичный `GET /system/tool-status?opKey=tutor_exchange`
- Produces:
  - Страница по URL `/check/prrv/admin/tools` со списком инструментов (пока один: `tutor_exchange`) + переключателем и полем сообщения
  - Хук `useTutorExchangeEnabled()` возвращает `{ enabled, message, isLoading }` — понадобится в этапе 2 для скрытия пункта сайдбара

- [ ] **Step 1: Добавить пункт «Инструменты» в admin sidebar**

Modify `frontend/src/app/check/prrv/admin/layout.tsx`. В массиве `navigation` (около строки 107) добавить строку **после** пункта «Тех. работы»:

```tsx
        { name: 'Тех. работы', href: '/check/prrv/admin/maintenance', icon: Bell },
        { name: 'Инструменты', href: '/check/prrv/admin/tools', icon: Sparkles },
```

Иконка `Sparkles` уже импортирована в существующем import-блоке — проверить (grep) и, при отсутствии, добавить.

- [ ] **Step 2: Создать страницу**

Create `frontend/src/app/check/prrv/admin/tools/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api/client'
import { Save, AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react'

interface ToolStatus {
    opKey?: string
    enabled: boolean
    message: string
    updatedAt: string | null
}

const OP_KEY = 'tutor_exchange'
const OP_TITLE = 'Биржа лидов'
const OP_DESCRIPTION = 'Раздел передачи учеников между репетиторами. Пока выключен — пункт в сайдбаре пользователей скрыт.'
const DEFAULT_MESSAGE = 'Биржа лидов скоро откроется — мы обкатываем последние детали'

export default function AdminToolsPage() {
    const [status, setStatus] = useState<ToolStatus | null>(null)
    const [draftEnabled, setDraftEnabled] = useState(false)
    const [draftMessage, setDraftMessage] = useState(DEFAULT_MESSAGE)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [savedAt, setSavedAt] = useState<Date | null>(null)

    const load = async () => {
        setLoading(true)
        try {
            const resp = await apiClient.get<ToolStatus>(`/admin/tool-status?opKey=${OP_KEY}`)
            setStatus(resp.data)
            setDraftEnabled(resp.data.enabled)
            setDraftMessage(resp.data.message || DEFAULT_MESSAGE)
        } catch (err) {
            console.error('Failed to load tool status:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const save = async () => {
        if (draftEnabled && status && !status.enabled) {
            if (!confirm(`Включить «${OP_TITLE}» для всех пользователей?`)) return
        }
        setSaving(true)
        try {
            const resp = await apiClient.post<ToolStatus>('/admin/tool-status', {
                opKey: OP_KEY,
                enabled: draftEnabled,
                message: draftMessage,
            })
            setStatus(resp.data)
            setSavedAt(new Date())
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Не удалось сохранить'
            alert(Array.isArray(msg) ? msg.join('; ') : msg)
        } finally {
            setSaving(false)
        }
    }

    const isDirty = !!status && (draftEnabled !== status.enabled || draftMessage !== status.message)

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <div className="mb-6 flex items-start gap-3">
                <Sparkles className="w-7 h-7 text-blue-500 mt-1" />
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Инструменты</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Глобальные переключатели опциональных разделов. Non-admin пользователи не видят
                        соответствующие пункты сайдбара и получают 503 на API выключенного инструмента.
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="bg-white rounded-xl border border-gray-200 p-6 text-gray-500">
                    Загрузка...
                </div>
            ) : (
                <>
                    <div className={`rounded-xl border p-4 mb-5 flex items-start gap-3 ${status?.enabled ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                        {status?.enabled ? (
                            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                        ) : (
                            <AlertTriangle className="w-5 h-5 text-gray-500 mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1">
                            <p className={`font-semibold ${status?.enabled ? 'text-green-900' : 'text-gray-800'}`}>
                                {OP_TITLE}: {status?.enabled ? 'включена' : 'выключена'}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">{OP_DESCRIPTION}</p>
                            {status?.updatedAt && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Последнее изменение: {new Date(status.updatedAt).toLocaleString('ru-RU')}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
                        <label className="flex items-start gap-3 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={draftEnabled}
                                onChange={(e) => setDraftEnabled(e.target.checked)}
                                className="mt-1 w-5 h-5 accent-blue-500"
                            />
                            <span>
                                <span className="block font-semibold text-gray-900">Включить {OP_TITLE.toLowerCase()} для всех</span>
                                <span className="block text-xs text-gray-500 mt-0.5">
                                    Админ пропускается всегда, независимо от переключателя.
                                </span>
                            </span>
                        </label>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Сообщение при выключенном инструменте
                            </label>
                            <textarea
                                value={draftMessage}
                                onChange={(e) => setDraftMessage(e.target.value)}
                                rows={3}
                                maxLength={1000}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 resize-y"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                Показывается на страницах инструмента и в API-ответах 503.
                            </p>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                            <div className="text-xs text-gray-400">
                                {savedAt && `Сохранено: ${savedAt.toLocaleTimeString('ru-RU')}`}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={load}
                                    disabled={saving || loading}
                                    className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
                                >
                                    Сбросить
                                </button>
                                <button
                                    onClick={save}
                                    disabled={saving || !isDirty}
                                    className={`px-5 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-2 disabled:opacity-50 ${draftEnabled ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-500 hover:bg-blue-600'}`}
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {saving ? 'Сохранение...' : 'Применить'}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
```

- [ ] **Step 3: Создать SWR-хук для будущих экранов**

Create `frontend/src/hooks/tutor-exchange/useTutorExchangeEnabled.ts`:

```ts
'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api/client'

interface ToolStatus {
    opKey?: string
    enabled: boolean
    message: string
    updatedAt: string | null
}

const POLL_INTERVAL_MS = 30_000

/**
 * Публично опрашивает /system/tool-status?opKey=tutor_exchange.
 * Возвращает enabled=false пока грузится — код ниже должен ориентироваться
 * на isLoading, а не на enabled==false, если это критично для рендера.
 */
export function useTutorExchangeEnabled() {
    const [state, setState] = useState<{ enabled: boolean; message: string; isLoading: boolean }>({
        enabled: false,
        message: '',
        isLoading: true,
    })

    useEffect(() => {
        let cancelled = false
        const load = async () => {
            try {
                const resp = await apiClient.get<ToolStatus>('/system/tool-status?opKey=tutor_exchange')
                if (cancelled) return
                setState({
                    enabled: resp.data.enabled,
                    message: resp.data.message,
                    isLoading: false,
                })
            } catch {
                if (cancelled) return
                setState((s) => ({ ...s, isLoading: false }))
            }
        }
        load()
        const id = setInterval(load, POLL_INTERVAL_MS)
        return () => { cancelled = true; clearInterval(id) }
    }, [])

    return state
}
```

- [ ] **Step 4: Ручной smoke-check страницы**

Убедиться, что backend всё ещё работает (Task 3 Step 5). Запустить фронт:

```bash
cd frontend && npm run dev
```

1. Открыть `http://localhost:3000/check/prrv/admin/login`, зайти как админ.
2. Открыть `http://localhost:3000/check/prrv/admin/tools`. Должно быть:
   - Заголовок «Инструменты».
   - Карточка «Биржа лидов: выключена».
   - Чекбокс «Включить биржу лидов для всех» — не отмечен.
   - Textarea со стандартным сообщением.
3. Отметить чекбокс, нажать «Применить», подтвердить. Ожидание: карточка становится «включена».
4. Открыть в другой вкладке `curl 'http://localhost:8080/api/system/tool-status?opKey=tutor_exchange' | jq` — должно вернуться `enabled: true`.
5. Снять галочку, применить. Ожидание: `enabled: false`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/check/prrv/admin/tools/page.tsx frontend/src/app/check/prrv/admin/layout.tsx frontend/src/hooks/tutor-exchange/useTutorExchangeEnabled.ts
git commit -m "feat(admin): tools page with tutor_exchange toggle"
```

---

## Definition of Done

- Backend jest suite `(system|tutor-exchange)` — 9 тестов зелёные.
- `npx prisma migrate dev` прошёл без ошибок; в БД появились 6 новых таблиц.
- Приложение поднимается (`npm run start:dev` в backend, `npm run dev` во frontend) без ошибок.
- Публичный `GET /api/system/tool-status?opKey=tutor_exchange` возвращает `enabled: false` по умолчанию.
- Админ на `/check/prrv/admin/tools` видит переключатель, может включать/выключать.
- Non-admin пользователь никаких изменений в UX не замечает (в этом этапе биржи нет в сайдбаре dashboard — она появится в этапе 2 под флагом).
- 5 commits (по одному на задачу) в текущей ветке. Никаких `git add -A`, `--no-verify` не использовалось.

## Self-review notes

- **Спека-coverage**: миграция ✓ (§3 spec), SystemService методы ✓ (§7), эндпоинты статуса ✓ (§7), guard ✓ (§4/§7), скелет модуля ✓ (§4), админ-страница ✓ (§7), дефолтный текст ✓ (§7 «Дефолт»). Non-goal этапа 1 — фронт биржи в дашборде и уведомления — сюда не входят, покрываются этапами 2–5.
- **Placeholder scan**: пусто. Все код-блоки — конечный код.
- **Type consistency**: `ToolStatus` объявлен в Task 2, используется в Task 3, 4, 6. `opKey: 'tutor_exchange'` — единая строка везде.
