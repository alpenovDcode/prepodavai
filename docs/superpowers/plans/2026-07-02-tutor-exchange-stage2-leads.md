# Tutor Exchange — Stage 2 (Заявки) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать первый пользовательский раздел биржи — CRUD заявок с лентой, фильтрами, wizard'ом создания и страницей деталей. Полностью работает под флагом `tutor_exchange` из этапа 1: админ включает — видит; выключает — 503 + пункта нет.

**Architecture:** Один `LeadsModule` внутри существующего `TutorExchangeModule` (backend/src/modules/tutor-exchange/leads/), пять эндпоинтов под `JwtAuthGuard + ExchangeEnabledGuard`. На фронте — новая нав-секция «Биржа» с одним пунктом «Заявки»; три страницы `/dashboard/leads`, `/leads/new`, `/leads/[id]`; компоненты вынесены в `frontend/src/components/tutor-exchange/`. Скрытие `studentContact` — в сервисе (в selector'е списка + удалении из детали для не-создателей на не-CLOSED сделках).

**Tech Stack:** NestJS 10 + Prisma 5 + PostgreSQL, class-validator DTO, Jest + ts-jest (backend unit-тесты); Next.js 15 + React 18 + Tailwind + lucide-react + axios (frontend).

## Global Constraints

- Все backend-файлы этапа — под `backend/src/modules/tutor-exchange/leads/`.
- Все новые frontend-файлы — под `frontend/src/components/tutor-exchange/` и `frontend/src/app/dashboard/leads/`.
- Ветка: `master` (пользователь явно попросил работать прямо в основной).
- `opKey` не меняется: `'tutor_exchange'`. Guard `ExchangeEnabledGuard` уже готов в этапе 1.
- Actor берётся ТОЛЬКО из JWT (`req.user.id`), никогда из body/query — паттерн из classes.controller.ts.
- Скрытие `studentContact`: (а) `listLeads` не селектит поле вообще; (б) `getLead` возвращает `studentContact` только если `req.user.id === creatorId` **или** `status === 'CLOSED'`.
- Фильтр по subject — регистронезависимый через `subjectLower` (нижний регистр строки в SQL query `contains`).
- Создание Lead автоматически заполняет `subjectLower = subject.trim().toLowerCase()`.
- Минимальная комиссия для `type=COMMISSION`: 100 ₽ (совпадает с MVP). Иначе валидация DTO падает.
- Frontend делает fetch через `apiClient` из `@/lib/api/client` (axios с `withCredentials: true`).
- В `getTeacherNavSections` расширяем сигнатуру: добавляем булев `tutorExchangeEnabled`; секция «Биржа» рендерится только при `true`. Флаг тянем в `DashboardLayoutV2Shim` через `useTutorExchangeEnabled()`.
- Все backend-коммиты: явные пути в `git add`, никакого `-A/-u/.`. Сообщения короткие, без упоминания Claude.

---

## Files

**Backend** (все под `backend/`):
- Create `src/modules/tutor-exchange/leads/leads.service.ts` — 5 методов: `createLead`, `listLeads`, `listMyLeads`, `getLead`, `deleteLead`
- Create `src/modules/tutor-exchange/leads/leads.service.spec.ts` — юнит-тесты
- Create `src/modules/tutor-exchange/leads/leads.controller.ts` — 5 endpoints
- Create `src/modules/tutor-exchange/leads/dto/create-lead.dto.ts`
- Create `src/modules/tutor-exchange/leads/dto/list-leads.query.dto.ts`
- Modify `src/modules/tutor-exchange/tutor-exchange.module.ts` — регистрация LeadsController + LeadsService + импорт AuthModule (для JwtAuthGuard)

**Frontend** (все под `frontend/src/`):
- Create `components/tutor-exchange/LeadCard.tsx`
- Create `components/tutor-exchange/LeadsFeed.tsx`
- Create `components/tutor-exchange/NewLeadWizard.tsx`
- Create `components/tutor-exchange/LeadDetails.tsx`
- Create `app/dashboard/leads/page.tsx` — тонкий wrapper для `LeadsFeed`
- Create `app/dashboard/leads/new/page.tsx` — wrapper для `NewLeadWizard`
- Create `app/dashboard/leads/[id]/page.tsx` — wrapper для `LeadDetails`
- Modify `components/layout/v2/Sidebar.tsx` — расширение `getTeacherNavSections` параметром `tutorExchangeEnabled`, добавление секции «Биржа»
- Modify `components/layout/v2/DashboardLayoutV2Shim.tsx` — вызвать `useTutorExchangeEnabled()`, прокинуть в `getTeacherNavSections`

---

## Task 1: `LeadsService` + unit-тесты

**Files:**
- Create: `backend/src/modules/tutor-exchange/leads/leads.service.ts`
- Create: `backend/src/modules/tutor-exchange/leads/leads.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`
- Produces:
  ```ts
  interface LeadFilters {
    subject?: string
    format?: string     // ONLINE | OFFLINE
    type?: string       // FREE | COMMISSION
    city?: string
  }
  interface CreateLeadInput {
    type: 'FREE' | 'COMMISSION'
    subject: string
    grade: string
    format: 'ONLINE' | 'OFFLINE'
    city?: string
    description: string
    studentContact: string
    price?: number
  }
  class LeadsService {
    createLead(userId: string, input: CreateLeadInput): Promise<Lead>
    listLeads(userId: string, filters: LeadFilters): Promise<PublicLead[]>   // studentContact НЕ включён
    listMyLeads(userId: string): Promise<Lead[]>                              // все статусы, полный объект
    getLead(userId: string, leadId: string): Promise<LeadWithContact>         // studentContact только для creator или CLOSED
    deleteLead(userId: string, leadId: string): Promise<{ ok: true }>         // 404 если не creator; 400 если статус != ACTIVE
  }
  ```

- [ ] **Step 1: Написать failing spec**

Create `backend/src/modules/tutor-exchange/leads/leads.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

describe('LeadsService', () => {
  let service: LeadsService;
  let prisma: {
    lead: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      lead: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(LeadsService);
  });

  describe('createLead', () => {
    it('writes subjectLower and forwards to prisma.create', async () => {
      prisma.lead.create.mockResolvedValue({ id: 'lead-1' });
      await service.createLead('user-1', {
        type: 'COMMISSION',
        subject: '  Математика  ',
        grade: '10 класс',
        format: 'ONLINE',
        description: 'Ученик 10 класса, готовится к ЕГЭ',
        studentContact: '+7 (999) 111-22-33',
        price: 1500,
      });
      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subject: 'Математика',
            subjectLower: 'математика',
            creatorId: 'user-1',
            price: 1500,
          }),
        }),
      );
    });

    it('rejects COMMISSION with price < 100', async () => {
      await expect(
        service.createLead('user-1', {
          type: 'COMMISSION',
          subject: 'Математика',
          grade: '10',
          format: 'ONLINE',
          description: 'x'.repeat(30),
          studentContact: '+7',
          price: 50,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sets price=0 for FREE ignoring input', async () => {
      prisma.lead.create.mockResolvedValue({ id: 'lead-1' });
      await service.createLead('user-1', {
        type: 'FREE',
        subject: 'Математика',
        grade: '10',
        format: 'ONLINE',
        description: 'x'.repeat(30),
        studentContact: '+7',
        price: 999,
      });
      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ price: 0 }),
        }),
      );
    });
  });

  describe('listLeads (feed)', () => {
    it('defaults to status=ACTIVE, excludes own leads, no studentContact in selector', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      await service.listLeads('user-1', {});
      const call = prisma.lead.findMany.mock.calls[0][0];
      expect(call.where.status).toBe('ACTIVE');
      expect(call.where.creatorId).toEqual({ not: 'user-1' });
      // studentContact НЕ в select — либо select без него, либо omit
      expect(call.select?.studentContact).toBeUndefined();
    });

    it('case-insensitive subject filter via subjectLower', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      await service.listLeads('user-1', { subject: 'МАТЕМАТИКА' });
      const call = prisma.lead.findMany.mock.calls[0][0];
      expect(call.where.subjectLower).toEqual({ contains: 'математика' });
    });

    it('applies format and type when provided', async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      await service.listLeads('user-1', { format: 'ONLINE', type: 'FREE' });
      const call = prisma.lead.findMany.mock.calls[0][0];
      expect(call.where.format).toBe('ONLINE');
      expect(call.where.type).toBe('FREE');
    });
  });

  describe('getLead', () => {
    const baseLead = {
      id: 'lead-1',
      creatorId: 'author',
      studentContact: '+7 (999) 111-22-33',
      subject: 'Математика',
      status: 'ACTIVE',
      creator: { id: 'author', firstName: 'A', lastName: 'B' },
    } as any;

    it('returns studentContact to creator', async () => {
      prisma.lead.findUnique.mockResolvedValue(baseLead);
      const lead = await service.getLead('author', 'lead-1');
      expect(lead.studentContact).toBe('+7 (999) 111-22-33');
    });

    it('hides studentContact from non-creator on ACTIVE lead', async () => {
      prisma.lead.findUnique.mockResolvedValue(baseLead);
      const lead = await service.getLead('stranger', 'lead-1');
      expect(lead.studentContact).toBeUndefined();
    });

    it('reveals studentContact once lead is CLOSED', async () => {
      prisma.lead.findUnique.mockResolvedValue({ ...baseLead, status: 'CLOSED' });
      const lead = await service.getLead('stranger', 'lead-1');
      expect(lead.studentContact).toBe('+7 (999) 111-22-33');
    });

    it('throws NotFound when lead does not exist', async () => {
      prisma.lead.findUnique.mockResolvedValue(null);
      await expect(service.getLead('u', 'lead-x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteLead', () => {
    it('rejects when caller is not creator', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', creatorId: 'other', status: 'ACTIVE' });
      await expect(service.deleteLead('me', 'lead-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when lead is not ACTIVE', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', creatorId: 'me', status: 'LOCKED' });
      await expect(service.deleteLead('me', 'lead-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deletes when creator and status=ACTIVE', async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', creatorId: 'me', status: 'ACTIVE' });
      prisma.lead.delete.mockResolvedValue({});
      const res = await service.deleteLead('me', 'lead-1');
      expect(res).toEqual({ ok: true });
      expect(prisma.lead.delete).toHaveBeenCalledWith({ where: { id: 'lead-1' } });
    });
  });
});
```

- [ ] **Step 2: Прогнать тесты, убедиться что они падают**

Run из `backend/`:
```bash
cd backend && npx jest src/modules/tutor-exchange/leads/leads.service.spec.ts 2>&1 | tail -10
```
Expected: FAIL с `Cannot find module './leads.service'`.

- [ ] **Step 3: Реализовать `LeadsService`**

Create `backend/src/modules/tutor-exchange/leads/leads.service.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface LeadFilters {
  subject?: string;
  format?: string;
  type?: string;
  city?: string;
}

export interface CreateLeadInput {
  type: 'FREE' | 'COMMISSION';
  subject: string;
  grade: string;
  format: 'ONLINE' | 'OFFLINE';
  city?: string;
  description: string;
  studentContact: string;
  price?: number;
}

const PUBLIC_LEAD_SELECT = {
  id: true,
  creatorId: true,
  subject: true,
  grade: true,
  format: true,
  city: true,
  description: true,
  type: true,
  price: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  creator: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      subject: true,
    },
  },
} as const;

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async createLead(userId: string, input: CreateLeadInput) {
    if (input.type === 'COMMISSION' && (!input.price || Number(input.price) < 100)) {
      throw new BadRequestException('Комиссия должна быть не меньше 100 ₽');
    }
    const subject = (input.subject || '').trim();
    const grade = (input.grade || '').trim();
    const description = (input.description || '').trim();
    const studentContact = (input.studentContact || '').trim();
    if (!subject || !grade || !description || !studentContact) {
      throw new BadRequestException('Заполните обязательные поля');
    }
    if (description.length < 30) {
      throw new BadRequestException('Описание должно быть не короче 30 символов');
    }

    return (this.prisma as any).lead.create({
      data: {
        creatorId: userId,
        type: input.type,
        subject,
        subjectLower: subject.toLowerCase(),
        grade,
        format: input.format,
        city: input.format === 'OFFLINE' ? input.city?.trim() || null : null,
        description,
        studentContact,
        price: input.type === 'COMMISSION' ? Number(input.price) : 0,
      },
      select: { ...PUBLIC_LEAD_SELECT, studentContact: true },
    });
  }

  async listLeads(userId: string, filters: LeadFilters) {
    const where: Record<string, any> = {
      status: 'ACTIVE',
      creatorId: { not: userId },
    };
    if (filters.subject && filters.subject.trim()) {
      where.subjectLower = { contains: filters.subject.trim().toLowerCase() };
    }
    if (filters.format) where.format = filters.format;
    if (filters.type) where.type = filters.type;
    if (filters.city && filters.city.trim()) {
      where.city = { contains: filters.city.trim(), mode: 'insensitive' };
    }

    return (this.prisma as any).lead.findMany({
      where,
      select: PUBLIC_LEAD_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listMyLeads(userId: string) {
    return (this.prisma as any).lead.findMany({
      where: { creatorId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLead(userId: string, leadId: string) {
    const lead = await (this.prisma as any).lead.findUnique({
      where: { id: leadId },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            subject: true,
          },
        },
      },
    });
    if (!lead) throw new NotFoundException('Заявка не найдена');

    const canSeeContact = lead.creatorId === userId || lead.status === 'CLOSED';
    if (!canSeeContact) {
      const { studentContact: _hidden, ...rest } = lead;
      return rest;
    }
    return lead;
  }

  async deleteLead(userId: string, leadId: string) {
    const lead = await (this.prisma as any).lead.findUnique({
      where: { id: leadId },
      select: { id: true, creatorId: true, status: true },
    });
    if (!lead) throw new NotFoundException('Заявка не найдена');
    if (lead.creatorId !== userId) throw new ForbiddenException('Не ваша заявка');
    if (lead.status !== 'ACTIVE') {
      throw new BadRequestException('Снять можно только открытую заявку');
    }
    await (this.prisma as any).lead.delete({ where: { id: leadId } });
    return { ok: true as const };
  }
}
```

- [ ] **Step 4: Прогнать тесты, убедиться что зелёные**

Run из `backend/`:
```bash
cd backend && npx jest src/modules/tutor-exchange/leads/leads.service.spec.ts 2>&1 | tail -15
```
Expected: `Tests: 12 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Users/ruslanalpenov/prepodavai
git add backend/src/modules/tutor-exchange/leads/leads.service.ts backend/src/modules/tutor-exchange/leads/leads.service.spec.ts
git commit -m "feat(tutor-exchange): LeadsService with filter+contact hiding"
```

---

## Task 2: DTO + `LeadsController` + регистрация в модуле

**Files:**
- Create: `backend/src/modules/tutor-exchange/leads/dto/create-lead.dto.ts`
- Create: `backend/src/modules/tutor-exchange/leads/dto/list-leads.query.dto.ts`
- Create: `backend/src/modules/tutor-exchange/leads/leads.controller.ts`
- Modify: `backend/src/modules/tutor-exchange/tutor-exchange.module.ts`

**Interfaces:**
- Consumes: `LeadsService`, `JwtAuthGuard`, `ExchangeEnabledGuard`
- Produces (все под `/api/tutor-exchange`):
  - `GET /leads?subject&format&type&city` → массив публичных заявок
  - `GET /leads/mine` → мои заявки любых статусов
  - `GET /leads/:id` → детали (`studentContact` условно)
  - `POST /leads` `CreateLeadDto` → созданная заявка
  - `DELETE /leads/:id` → `{ ok: true }`

- [ ] **Step 1: Создать `CreateLeadDto`**

Create `backend/src/modules/tutor-exchange/leads/dto/create-lead.dto.ts`:

```ts
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum LeadType {
  FREE = 'FREE',
  COMMISSION = 'COMMISSION',
}

export enum LeadFormat {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
}

export class CreateLeadDto {
  @IsEnum(LeadType)
  type: LeadType;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  subject: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  grade: string;

  @IsEnum(LeadFormat)
  format: LeadFormat;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsString()
  @MinLength(30)
  @MaxLength(4000)
  description: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  studentContact: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50000)
  price?: number;
}
```

- [ ] **Step 2: Создать `ListLeadsQueryDto`**

Create `backend/src/modules/tutor-exchange/leads/dto/list-leads.query.dto.ts`:

```ts
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { LeadFormat, LeadType } from './create-lead.dto';

export class ListLeadsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string;

  @IsOptional()
  @IsEnum(LeadFormat)
  format?: LeadFormat;

  @IsOptional()
  @IsEnum(LeadType)
  type?: LeadType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;
}
```

- [ ] **Step 3: Создать `LeadsController`**

Create `backend/src/modules/tutor-exchange/leads/leads.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ExchangeEnabledGuard } from '../guards/exchange-enabled.guard';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { ListLeadsQueryDto } from './dto/list-leads.query.dto';

@Controller('tutor-exchange/leads')
@UseGuards(JwtAuthGuard, ExchangeEnabledGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  list(@Request() req: any, @Query() query: ListLeadsQueryDto) {
    return this.leadsService.listLeads(req.user.id, query);
  }

  @Get('mine')
  mine(@Request() req: any) {
    return this.leadsService.listMyLeads(req.user.id);
  }

  @Get(':id')
  getOne(@Request() req: any, @Param('id') id: string) {
    return this.leadsService.getLead(req.user.id, id);
  }

  @Post()
  create(@Request() req: any, @Body() body: CreateLeadDto) {
    return this.leadsService.createLead(req.user.id, body);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.leadsService.deleteLead(req.user.id, id);
  }
}
```

- [ ] **Step 4: Зарегистрировать в модуле**

Modify `backend/src/modules/tutor-exchange/tutor-exchange.module.ts`. Заменить весь файл содержимым:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { SystemModule } from '../system/system.module';
import { AuthModule } from '../auth/auth.module';
import { ExchangeEnabledGuard } from './guards/exchange-enabled.guard';
import { LeadsController } from './leads/leads.controller';
import { LeadsService } from './leads/leads.service';

/**
 * Биржа лидов между репетиторами. С этапа 2 добавлен модуль leads
 * (лента + создание + детали). Следующие этапы подключат dialogs,
 * messages, violations, ratings — все под ExchangeEnabledGuard.
 */
@Module({
  imports: [PrismaModule, SystemModule, AuthModule],
  controllers: [LeadsController],
  providers: [ExchangeEnabledGuard, LeadsService],
  exports: [ExchangeEnabledGuard],
})
export class TutorExchangeModule {}
```

- [ ] **Step 5: TS-check и юниты**

Run из `backend/`:
```bash
cd backend && npx tsc -p tsconfig.json --noEmit 2>&1 | head -20 && echo "---TESTS---" && npx jest --testPathPattern="tutor-exchange" 2>&1 | tail -10
```
Expected: пусто в tsc (нет ошибок) и `Tests: 16 passed` (12 из LeadsService + 4 из ExchangeEnabledGuard).

- [ ] **Step 6: Live smoke на локальном backend**

Поднять backend в фоне и curl'нуть под аутентифицированной сессией — админ (у меня нет user-credentials, ниже — минимальная проверка что guard в 503).

Из `backend/`:
```bash
cd backend && npm run start:dev &
SERVER_PID=$!
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/tutor-exchange/leads
kill $SERVER_PID 2>/dev/null
```
Expected: HTTP `401` (нет JWT-куки) — значит `JwtAuthGuard` отработал раньше `ExchangeEnabledGuard`. Это нормально: с валидной JWT-кукой не-админа и `enabled=false` ожидался бы `503`.

- [ ] **Step 7: Commit**

```bash
cd /Users/ruslanalpenov/prepodavai
git add backend/src/modules/tutor-exchange/leads/dto/create-lead.dto.ts backend/src/modules/tutor-exchange/leads/dto/list-leads.query.dto.ts backend/src/modules/tutor-exchange/leads/leads.controller.ts backend/src/modules/tutor-exchange/tutor-exchange.module.ts
git commit -m "feat(tutor-exchange): leads endpoints under exchange guard"
```

---

## Task 3: Frontend — `LeadCard`, `LeadsFeed`, страница `/dashboard/leads`

**Files:**
- Create: `frontend/src/components/tutor-exchange/LeadCard.tsx`
- Create: `frontend/src/components/tutor-exchange/LeadsFeed.tsx`
- Create: `frontend/src/app/dashboard/leads/page.tsx`

**Interfaces:**
- Consumes: `apiClient` из `@/lib/api/client`; типы лида получены из бэка
- Produces:
  - Компонент `LeadCard({ lead })` — карточка в ленте с subject/grade/format/city/price/type-бейдж/имя автора/дата
  - Компонент `LeadsFeed({})` — грид карточек + панель фильтров (subject text, format select, type select, city text), кнопка «+ Разместить заявку» → `/dashboard/leads/new`
  - Страница `/dashboard/leads` — рендерит `<LeadsFeed />`

- [ ] **Step 1: Создать `LeadCard`**

Create `frontend/src/components/tutor-exchange/LeadCard.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { MapPin, Globe, User, Sparkles, Coins } from 'lucide-react'

export interface LeadCardData {
    id: string
    subject: string
    grade: string
    format: 'ONLINE' | 'OFFLINE'
    city?: string | null
    description: string
    type: 'FREE' | 'COMMISSION'
    price: number
    status: string
    createdAt: string
    creator: {
        id: string
        firstName?: string | null
        lastName?: string | null
        subject?: string | null
    }
}

const formatName = (c: LeadCardData['creator']) =>
    [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Репетитор'

export function LeadCard({ lead }: { lead: LeadCardData }) {
    const isFree = lead.type === 'FREE'
    return (
        <Link href={`/dashboard/leads/${lead.id}`} className="block">
            <article className="border border-gray-200 rounded-2xl p-5 bg-white hover:border-blue-300 hover:shadow-sm transition">
                <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                        <h3 className="text-base font-semibold text-gray-900">{lead.subject}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{lead.grade}</p>
                    </div>
                    <span className={`text-[11px] font-semibold px-2 py-1 rounded-md border ${isFree ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                        {isFree ? (
                            <span className="inline-flex items-center gap-1"><Sparkles className="w-3 h-3" /> FREE</span>
                        ) : (
                            <span className="inline-flex items-center gap-1"><Coins className="w-3 h-3" /> {lead.price.toLocaleString('ru-RU')} ₽</span>
                        )}
                    </span>
                </div>

                <p className="text-sm text-gray-600 line-clamp-3 leading-relaxed mb-3">
                    {lead.description}
                </p>

                <div className="flex items-center gap-3 text-xs text-gray-500">
                    {lead.format === 'ONLINE' ? (
                        <span className="inline-flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> Онлайн</span>
                    ) : (
                        <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {lead.city || 'Оффлайн'}</span>
                    )}
                    <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" /> {formatName(lead.creator)}</span>
                    <span className="ml-auto">{new Date(lead.createdAt).toLocaleDateString('ru-RU')}</span>
                </div>
            </article>
        </Link>
    )
}
```

- [ ] **Step 2: Создать `LeadsFeed`**

Create `frontend/src/components/tutor-exchange/LeadsFeed.tsx`:

```tsx
'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api/client'
import { Plus, Search, Loader2, AlertCircle } from 'lucide-react'
import { LeadCard, LeadCardData } from './LeadCard'

interface Filters {
    subject: string
    format: '' | 'ONLINE' | 'OFFLINE'
    type: '' | 'FREE' | 'COMMISSION'
    city: string
}

const EMPTY_FILTERS: Filters = { subject: '', format: '', type: '', city: '' }

export function LeadsFeed() {
    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
    const [leads, setLeads] = useState<LeadCardData[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    const query = useMemo(() => {
        const params = new URLSearchParams()
        if (filters.subject.trim()) params.set('subject', filters.subject.trim())
        if (filters.format) params.set('format', filters.format)
        if (filters.type) params.set('type', filters.type)
        if (filters.city.trim()) params.set('city', filters.city.trim())
        return params.toString()
    }, [filters])

    useEffect(() => {
        let cancelled = false
        setLeads(null)
        setError(null)
        apiClient
            .get<LeadCardData[]>(`/tutor-exchange/leads${query ? `?${query}` : ''}`)
            .then((resp) => { if (!cancelled) setLeads(resp.data) })
            .catch((err) => {
                if (cancelled) return
                if (err?.response?.status === 503 && err.response.data?.tutorExchangeDisabled) {
                    setError(err.response.data.message || 'Биржа временно недоступна')
                } else {
                    setError(err?.response?.data?.message || 'Не удалось загрузить заявки')
                }
            })
        return () => { cancelled = true }
    }, [query])

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <header className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Биржа лидов</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Передайте ученика коллеге или заберите чужого — открытые заявки других репетиторов.
                    </p>
                </div>
                <Link href="/dashboard/leads/new" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
                    <Plus className="w-4 h-4" /> Разместить заявку
                </Link>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
                <div className="md:col-span-2 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        value={filters.subject}
                        onChange={(e) => setFilters((f) => ({ ...f, subject: e.target.value }))}
                        placeholder="Предмет: математика, английский..."
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                    />
                </div>
                <select
                    value={filters.format}
                    onChange={(e) => setFilters((f) => ({ ...f, format: e.target.value as Filters['format'] }))}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                >
                    <option value="">Любой формат</option>
                    <option value="ONLINE">Онлайн</option>
                    <option value="OFFLINE">Оффлайн</option>
                </select>
                <select
                    value={filters.type}
                    onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as Filters['type'] }))}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                >
                    <option value="">Все типы</option>
                    <option value="FREE">Бесплатно</option>
                    <option value="COMMISSION">С комиссией</option>
                </select>
                {filters.format === 'OFFLINE' && (
                    <input
                        value={filters.city}
                        onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
                        placeholder="Город"
                        className="md:col-span-4 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                    />
                )}
            </div>

            {error && (
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-800 flex gap-2 items-start">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {!error && leads === null && (
                <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Загружаем ленту...
                </div>
            )}

            {!error && leads?.length === 0 && (
                <div className="border border-dashed border-gray-200 rounded-xl p-10 text-center text-gray-500 text-sm">
                    Пока нет заявок по вашим фильтрам. Первым разместите свою — <Link href="/dashboard/leads/new" className="text-blue-600 underline">заполнить форму</Link>.
                </div>
            )}

            {!error && leads && leads.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {leads.map((lead) => (<LeadCard key={lead.id} lead={lead} />))}
                </div>
            )}
        </div>
    )
}
```

- [ ] **Step 3: Создать страницу**

Create `frontend/src/app/dashboard/leads/page.tsx`:

```tsx
import { LeadsFeed } from '@/components/tutor-exchange/LeadsFeed'

export default function Page() {
    return <LeadsFeed />
}
```

- [ ] **Step 4: Быстрый TS-check фронта**

Run из корня:
```bash
cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "tutor-exchange|dashboard/leads" | head -20
```
Expected: пусто (нет ошибок в новых файлах).

- [ ] **Step 5: Commit**

```bash
cd /Users/ruslanalpenov/prepodavai
git add frontend/src/components/tutor-exchange/LeadCard.tsx frontend/src/components/tutor-exchange/LeadsFeed.tsx frontend/src/app/dashboard/leads/page.tsx
git commit -m "feat(tutor-exchange): leads feed page and card"
```

---

## Task 4: Frontend — `NewLeadWizard` + страница `/dashboard/leads/new`

**Files:**
- Create: `frontend/src/components/tutor-exchange/NewLeadWizard.tsx`
- Create: `frontend/src/app/dashboard/leads/new/page.tsx`

**Interfaces:**
- Consumes: `apiClient`
- Produces:
  - `<NewLeadWizard />` — три шага: (1) выбор типа FREE/COMMISSION, (2) форма (subject/grade/format/city/description/studentContact/price), (3) preview + кнопка «Опубликовать» → POST `/tutor-exchange/leads` → редирект `/dashboard/leads/[id]`

- [ ] **Step 1: Создать `NewLeadWizard`**

Create `frontend/src/components/tutor-exchange/NewLeadWizard.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api/client'
import { ArrowLeft, Sparkles, Coins, Loader2 } from 'lucide-react'

type Step = 'type' | 'form' | 'preview'

interface Form {
    type: 'FREE' | 'COMMISSION'
    subject: string
    grade: string
    format: 'ONLINE' | 'OFFLINE'
    city: string
    description: string
    studentContact: string
    price: string
}

const EMPTY: Form = {
    type: 'COMMISSION',
    subject: '', grade: '', format: 'ONLINE', city: '',
    description: '', studentContact: '', price: '',
}

export function NewLeadWizard() {
    const router = useRouter()
    const [step, setStep] = useState<Step>('type')
    const [form, setForm] = useState<Form>(EMPTY)
    const [accepted, setAccepted] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }))

    const isFree = form.type === 'FREE'
    const priceNum = Number(form.price) || 0
    const canPreview =
        form.subject.trim() &&
        form.grade.trim() &&
        form.description.trim().length >= 30 &&
        form.studentContact.trim() &&
        (isFree || priceNum >= 100)

    const submit = async () => {
        setSaving(true)
        setError(null)
        try {
            const resp = await apiClient.post<{ id: string }>('/tutor-exchange/leads', {
                type: form.type,
                subject: form.subject.trim(),
                grade: form.grade.trim(),
                format: form.format,
                city: form.format === 'OFFLINE' ? form.city.trim() : undefined,
                description: form.description.trim(),
                studentContact: form.studentContact.trim(),
                price: isFree ? 0 : priceNum,
            })
            router.push(`/dashboard/leads/${resp.data.id}`)
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Не удалось опубликовать заявку'
            setError(Array.isArray(msg) ? msg.join('; ') : msg)
            setSaving(false)
        }
    }

    if (step === 'type') {
        return (
            <div className="p-6 max-w-3xl mx-auto">
                <Link href="/dashboard/leads" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
                    <ArrowLeft className="w-4 h-4" /> К ленте
                </Link>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Новая заявка</h1>
                <p className="text-sm text-gray-500 mb-6">Выберите тип — как хотите передать ученика.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => { setForm((f) => ({ ...f, type: 'FREE' })); setStep('form') }}
                        className="text-left p-6 border-2 border-gray-200 rounded-2xl hover:border-emerald-400 bg-white transition"
                    >
                        <Sparkles className="w-8 h-8 text-emerald-500 mb-3" />
                        <div className="font-semibold text-gray-900">Бесплатная передача</div>
                        <p className="text-sm text-gray-500 mt-1">Отдаёте ученика коллеге без комиссии — просто помогаете.</p>
                    </button>
                    <button
                        onClick={() => { setForm((f) => ({ ...f, type: 'COMMISSION' })); setStep('form') }}
                        className="text-left p-6 border-2 border-gray-200 rounded-2xl hover:border-amber-400 bg-white transition"
                    >
                        <Coins className="w-8 h-8 text-amber-500 mb-3" />
                        <div className="font-semibold text-gray-900">С комиссией</div>
                        <p className="text-sm text-gray-500 mt-1">Коллега платит вам разово от 100 ₽ после успешного пробного.</p>
                    </button>
                </div>
            </div>
        )
    }

    if (step === 'form') {
        return (
            <div className="p-6 max-w-2xl mx-auto">
                <button onClick={() => setStep('type')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
                    <ArrowLeft className="w-4 h-4" /> Тип
                </button>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Заполните заявку</h1>
                <p className="text-sm text-gray-500 mb-6">
                    {isFree ? 'Бесплатная передача' : 'С комиссией'} · Все поля обязательные.
                </p>
                <div className="space-y-4 bg-white border border-gray-200 rounded-2xl p-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Предмет</label>
                            <input value={form.subject} onChange={(e) => set('subject', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                                placeholder="Математика" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Уровень / класс</label>
                            <input value={form.grade} onChange={(e) => set('grade', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                                placeholder="10 класс, ЕГЭ" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Формат</label>
                            <select value={form.format} onChange={(e) => set('format', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400">
                                <option value="ONLINE">Онлайн</option>
                                <option value="OFFLINE">Оффлайн</option>
                            </select>
                        </div>
                        {form.format === 'OFFLINE' && (
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Город</label>
                                <input value={form.city} onChange={(e) => set('city', e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                                    placeholder="Москва" />
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Описание ученика (мин. 30 символов)</label>
                        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={4}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 resize-y"
                            placeholder="Цели, уровень, особенности, ожидания..." />
                        <p className={`text-xs mt-1 ${form.description.trim().length < 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {form.description.trim().length} / 30
                        </p>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Контакт ученика (скрыт до закрытия сделки)</label>
                        <input value={form.studentContact} onChange={(e) => set('studentContact', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                            placeholder="+7 (999) 123-45-67 или @username" />
                        <p className="text-xs text-gray-400 mt-1">Другие репетиторы увидят его только после подтверждения сделки.</p>
                    </div>
                    {!isFree && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Комиссия, ₽ (от 100)</label>
                            <input value={form.price} onChange={(e) => set('price', e.target.value)} type="number" min={100} max={50000}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                                placeholder="1000" />
                        </div>
                    )}
                    <button
                        onClick={() => setStep('preview')}
                        disabled={!canPreview}
                        className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                    >
                        Проверить и опубликовать →
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <button onClick={() => setStep('form')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
                <ArrowLeft className="w-4 h-4" /> Исправить
            </button>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Проверьте заявку</h1>
            <p className="text-sm text-gray-500 mb-6">После публикации она сразу появится в общей ленте.</p>
            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-md border ${isFree ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                        {isFree ? 'FREE' : `${priceNum.toLocaleString('ru-RU')} ₽`}
                    </span>
                    <h2 className="text-lg font-semibold text-gray-900">{form.subject}</h2>
                </div>
                <div className="text-sm text-gray-500">
                    {form.grade} · {form.format === 'ONLINE' ? 'Онлайн' : `Оффлайн${form.city ? `, ${form.city}` : ''}`}
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{form.description}</p>
                <div className="text-xs text-gray-500">
                    Контакт ученика:&nbsp;
                    <span className="text-gray-400">скрыт до закрытия сделки</span>
                </div>
                <label className="flex items-start gap-2 text-xs text-gray-600 pt-2 border-t border-gray-100">
                    <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5" />
                    <span>Подтверждаю: информация об ученике достоверна, я готов передать его другому репетитору.</span>
                </label>
                {error && (
                    <div className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2">
                        {error}
                    </div>
                )}
                <button
                    onClick={submit}
                    disabled={!accepted || saving}
                    className="w-full py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {saving ? 'Публикуем...' : 'Опубликовать'}
                </button>
            </div>
        </div>
    )
}
```

- [ ] **Step 2: Создать страницу**

Create `frontend/src/app/dashboard/leads/new/page.tsx`:

```tsx
import { NewLeadWizard } from '@/components/tutor-exchange/NewLeadWizard'

export default function Page() {
    return <NewLeadWizard />
}
```

- [ ] **Step 3: TS-check фронта**

Run из корня:
```bash
cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "NewLeadWizard|leads/new" | head -10
```
Expected: пусто.

- [ ] **Step 4: Commit**

```bash
cd /Users/ruslanalpenov/prepodavai
git add frontend/src/components/tutor-exchange/NewLeadWizard.tsx frontend/src/app/dashboard/leads/new/page.tsx
git commit -m "feat(tutor-exchange): 3-step wizard to create lead"
```

---

## Task 5: Frontend — `LeadDetails` + страница `/dashboard/leads/[id]`

**Files:**
- Create: `frontend/src/components/tutor-exchange/LeadDetails.tsx`
- Create: `frontend/src/app/dashboard/leads/[id]/page.tsx`

**Interfaces:**
- Consumes: `apiClient`
- Produces:
  - `<LeadDetails leadId={id} />` — fetch GET `/tutor-exchange/leads/:id`, показывает полные данные, `studentContact` под lock-состоянием (или открытый, если сервер вернул), заглушка «Откликнуться» (disabled в этапе 2, active с этапа 3), для creator — «Снять с публикации».

- [ ] **Step 1: Создать `LeadDetails`**

Create `frontend/src/components/tutor-exchange/LeadDetails.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import { ArrowLeft, Globe, MapPin, User, Lock, CheckCircle2, Trash2, Loader2, AlertCircle } from 'lucide-react'
import type { LeadCardData } from './LeadCard'

interface LeadDetailsData extends LeadCardData {
    studentContact?: string   // приходит только для creator или для CLOSED
    updatedAt: string
}

const formatName = (c: LeadDetailsData['creator']) =>
    [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Репетитор'

export function LeadDetails({ leadId }: { leadId: string }) {
    const router = useRouter()
    const [lead, setLead] = useState<LeadDetailsData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [meId, setMeId] = useState<string | null>(null)
    const [deleting, setDeleting] = useState(false)

    useEffect(() => {
        // отдельно тянем /auth/me чтобы понимать creator vs viewer
        apiClient.get<{ id: string }>('/auth/me').then((r) => setMeId(r.data?.id ?? null)).catch(() => setMeId(null))
    }, [])

    useEffect(() => {
        let cancelled = false
        apiClient
            .get<LeadDetailsData>(`/tutor-exchange/leads/${leadId}`)
            .then((r) => { if (!cancelled) setLead(r.data) })
            .catch((err) => {
                if (cancelled) return
                if (err?.response?.status === 404) setError('Заявка не найдена или была снята')
                else if (err?.response?.status === 503 && err.response.data?.tutorExchangeDisabled) setError(err.response.data.message || 'Биржа временно недоступна')
                else setError(err?.response?.data?.message || 'Не удалось загрузить заявку')
            })
        return () => { cancelled = true }
    }, [leadId])

    const remove = async () => {
        if (!confirm('Снять заявку с публикации? Это действие необратимо.')) return
        setDeleting(true)
        try {
            await apiClient.delete(`/tutor-exchange/leads/${leadId}`)
            router.push('/dashboard/leads')
        } catch (err: any) {
            alert(err?.response?.data?.message || 'Не удалось снять заявку')
            setDeleting(false)
        }
    }

    if (error) {
        return (
            <div className="p-6 max-w-2xl mx-auto">
                <Link href="/dashboard/leads" className="inline-flex items-center gap-1 text-sm text-gray-500 mb-4">
                    <ArrowLeft className="w-4 h-4" /> К ленте
                </Link>
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-800 flex gap-2 items-start">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                </div>
            </div>
        )
    }
    if (!lead) {
        return (
            <div className="p-6 max-w-2xl mx-auto text-sm text-gray-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Загружаем заявку...
            </div>
        )
    }

    const isFree = lead.type === 'FREE'
    const isCreator = meId === lead.creatorId
    const canRespond = !isCreator && lead.status === 'ACTIVE'
    const contactVisible = typeof lead.studentContact === 'string' && lead.studentContact.length > 0

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <Link href="/dashboard/leads" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
                <ArrowLeft className="w-4 h-4" /> К ленте
            </Link>

            <div className="bg-white border border-gray-200 rounded-2xl p-6">
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{lead.subject}</h1>
                        <p className="text-sm text-gray-500 mt-0.5">{lead.grade}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-md border ${isFree ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                        {isFree ? 'FREE' : `${lead.price.toLocaleString('ru-RU')} ₽`}
                    </span>
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-500 mb-5">
                    {lead.format === 'ONLINE' ? (
                        <span className="inline-flex items-center gap-1"><Globe className="w-4 h-4" /> Онлайн</span>
                    ) : (
                        <span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4" /> {lead.city || 'Оффлайн'}</span>
                    )}
                    <span className="inline-flex items-center gap-1"><User className="w-4 h-4" /> {formatName(lead.creator)}</span>
                </div>

                <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap mb-6">
                    {lead.description}
                </div>

                <div className={`rounded-xl border p-4 mb-6 ${contactVisible ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">
                        {contactVisible ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Lock className="w-4 h-4 text-gray-500" />}
                        Контакт ученика
                    </div>
                    {contactVisible ? (
                        <div className="text-sm font-semibold text-emerald-900">{lead.studentContact}</div>
                    ) : (
                        <div className="text-sm text-gray-500">
                            Скрыт — станет виден откликнувшемуся после закрытия сделки.
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    {canRespond && (
                        <button
                            disabled
                            title="Откликаться можно с этапа 3 (диалоги)"
                            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-50 cursor-not-allowed"
                        >
                            Откликнуться (скоро)
                        </button>
                    )}
                    {isCreator && lead.status === 'ACTIVE' && (
                        <button
                            onClick={remove}
                            disabled={deleting}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-red-700 border border-red-200 bg-red-50 hover:bg-red-100 rounded-lg disabled:opacity-50"
                        >
                            <Trash2 className="w-4 h-4" /> {deleting ? 'Снимаем...' : 'Снять с публикации'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
```

- [ ] **Step 2: Создать страницу**

Create `frontend/src/app/dashboard/leads/[id]/page.tsx`:

```tsx
import { LeadDetails } from '@/components/tutor-exchange/LeadDetails'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return <LeadDetails leadId={id} />
}
```

- [ ] **Step 3: TS-check фронта**

Run из корня:
```bash
cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "LeadDetails|leads/\[id\]" | head -10
```
Expected: пусто.

- [ ] **Step 4: Commit**

```bash
cd /Users/ruslanalpenov/prepodavai
git add frontend/src/components/tutor-exchange/LeadDetails.tsx frontend/src/app/dashboard/leads/[id]/page.tsx
git commit -m "feat(tutor-exchange): lead details page with contact gating"
```

---

## Task 6: Пункт «Биржа» в Sidebar V2 под гейтом флага

**Files:**
- Modify: `frontend/src/components/layout/v2/Sidebar.tsx`
- Modify: `frontend/src/components/layout/v2/DashboardLayoutV2Shim.tsx`

**Interfaces:**
- Consumes: `useTutorExchangeEnabled()` (создан на этапе 1) и существующая `getTeacherNavSections`
- Produces: расширенная сигнатура `getTeacherNavSections(badges, options)` с флагом `tutorExchangeEnabled`; при `true` добавляется секция «Биржа» с одним пунктом «Заявки» → `/dashboard/leads`.

- [ ] **Step 1: Расширить сигнатуру `getTeacherNavSections`**

Modify `frontend/src/components/layout/v2/Sidebar.tsx`. Заменить блок функции целиком:

```tsx
export function getTeacherNavSections(
    badges: { studentsAtRisk?: number; pendingGrading?: number } = {},
    options: { tutorExchangeEnabled?: boolean } = {},
): NavSection[] {
    const i = (Icon: typeof LayoutDashboard) => <Icon className="w-[18px] h-[18px]" />
    const sections: NavSection[] = [
        {
            label: 'Рабочий стол',
            items: [
                { label: 'Главная',       href: '/dashboard',              icon: i(LayoutDashboard), tourId: 'nav-home' },
                { label: 'ИИ Генератор',  href: '/workspace',              icon: i(Wand2),           tourId: 'nav-ai' },
                { label: 'Календарь',     href: '/dashboard/calendar',     icon: i(Calendar),        tourId: 'nav-calendar' },
                { label: 'Материалы',     href: '/dashboard/courses',      icon: i(BookOpen),        tourId: 'nav-materials' },
            ],
        },
        {
            label: 'Класс',
            items: [
                { label: 'Ученики',       href: '/dashboard/students',     icon: i(Users),           badge: badges.studentsAtRisk, tourId: 'nav-students' },
                { label: 'Проверка ДЗ',   href: '/dashboard/grading',      icon: i(ClipboardCheck),  badge: badges.pendingGrading, tourId: 'nav-grading' },
                { label: 'Аналитика',     href: '/dashboard/analytics',    icon: i(BarChart3),       tourId: 'nav-analytics' },
            ],
        },
    ]

    if (options.tutorExchangeEnabled) {
        sections.push({
            label: 'Биржа',
            items: [
                { label: 'Заявки', href: '/dashboard/leads', icon: i(MessageCircle), tourId: 'nav-tutor-exchange' },
            ],
        })
    }

    sections.push({
        label: 'Прочее',
        items: [
            { label: 'Блог',          href: '/blog',                   icon: i(Newspaper),       tourId: 'nav-blog' },
            { label: 'Сообщество',    href: 'https://t.me/prepodavaII', icon: i(Send),           tourId: 'nav-community', external: true },
            { label: 'Пригласить',    href: '/dashboard/referrals',    icon: i(Gift),            tourId: 'nav-invite' },
            { label: 'Поддержка',     href: 'https://t.me/prepodavai_help_bot', icon: i(MessageCircle), tourId: 'nav-support', external: true },
            { label: 'Настройки',     href: '/dashboard/settings',     icon: i(Settings),        tourId: 'nav-settings' },
        ],
    })

    return sections
}
```

- [ ] **Step 2: Прокинуть флаг из shim'а**

Modify `frontend/src/components/layout/v2/DashboardLayoutV2Shim.tsx`. Заменить `DashboardLayoutV2Inner` целиком:

```tsx
function DashboardLayoutV2Inner({ children }: { children: ReactNode }) {
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])
    const { fullName, initials, user } = useUser()
    const { enabled: tutorExchangeEnabled } = useTutorExchangeEnabled()
    const sections = getTeacherNavSections({}, { tutorExchangeEnabled })
    const userProps = mounted
        ? { name: fullName, initials, plan: user?.email }
        : { name: 'Загрузка…', initials: '…', plan: undefined }
    return (
        <DashboardLayoutV2 sections={sections} user={userProps}>
            {children}
        </DashboardLayoutV2>
    )
}
```

И добавить импорт в верхнюю часть файла, после `import { getTeacherNavSections } from './Sidebar'`:

```tsx
import { useTutorExchangeEnabled } from '@/hooks/tutor-exchange/useTutorExchangeEnabled'
```

- [ ] **Step 3: TS-check фронта**

Run из корня:
```bash
cd frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "Sidebar|DashboardLayoutV2Shim|tutor-exchange" | head -20
```
Expected: пусто.

- [ ] **Step 4: Commit**

```bash
cd /Users/ruslanalpenov/prepodavai
git add frontend/src/components/layout/v2/Sidebar.tsx frontend/src/components/layout/v2/DashboardLayoutV2Shim.tsx
git commit -m "feat(tutor-exchange): show 'Биржа' section in sidebar when flag is on"
```

---

## Definition of Done

- Backend jest `tutor-exchange` — 16 тестов зелёные (12 из LeadsService + 4 из ExchangeEnabledGuard).
- `npx tsc --noEmit` (backend и frontend) — без ошибок в новых файлах.
- Пять эндпоинтов доступны (401 без JWT, 503 non-admin при выключенном флаге, работают при включённом).
- Админ включает флаг в `/check/prrv/admin/tools`, в сайдбаре появляется секция «Биржа» → «Заявки». Создаёт заявку через wizard — попадает на `/dashboard/leads/[id]`, видит `studentContact` (он creator).
- Другой аккаунт (не creator) видит ту же заявку в ленте, но `studentContact` в details скрыт.
- Регистронезависимый поиск: `subject=МАТЕМАТИКА` находит заявку `subject='Математика'`.
- 6 commits — по одному на задачу. Никаких `git add -A`, никаких `--no-verify`.

## Self-review notes

- **Спека-coverage**: §4/§5 (backend leads + frontend leads + wizard) ✓; §7 (пункт в сайдбаре под opKey) ✓; §3 (модель Lead уже созданa на этапе 1) — используется; §8 «Готовность этапа 2» — покрыто.
- **Placeholder scan**: пусто. Кнопка «Откликнуться» на детальной — плейсхолдер только по функциональности (`disabled`, с подсказкой «скоро»), это **осознанное** решение на границе этапов 2 и 3. Кнопка появится живой в этапе 3.
- **Type consistency**: `LeadCardData` определён в Task 3, повторно используется в `LeadDetails` через `extends` (Task 5). `Filters` только в `LeadsFeed` (Task 3). `Form` только в `NewLeadWizard` (Task 4). `getTeacherNavSections` сигнатура изменяется в Task 6 с обратно-совместимым optional-параметром — существующие вызовы (`sections = getTeacherNavSections()`) продолжают работать; в shim'е переходим на новую сигнатуру одновременно с расширением функции.
