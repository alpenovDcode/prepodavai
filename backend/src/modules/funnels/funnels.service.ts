import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface FunnelStepDef {
  order: number;
  label: string;
  eventType: string;
  /// JSON-фильтр: {"utmSource": "instagram", "payload.generationType": "worksheet"}
  eventFilters?: Record<string, any> | null;
  isCohortAnchor?: boolean;
}

export interface FunnelComputeOptions {
  /// Период анализа (от .. до).
  from?: Date;
  to?: Date;
  /// Срез — разбить результат на сегменты. Допустимо:
  ///   'utmSource' | 'utmCampaign' | 'eventName' (= тип генерации) | 'none'
  groupBy?: 'utmSource' | 'utmCampaign' | 'utmMedium' | 'eventName' | 'none';
  /// Максимальное время между шагами в секундах. 0 = без лимита.
  /// Полезно для «успели до 10й генерации за 30 дней».
  maxWindowSeconds?: number;
}

export interface FunnelStepResult {
  order: number;
  label: string;
  eventType: string;
  /// Уникальных пользователей, дошедших до этого шага в рамках воронки.
  users: number;
  /// Конверсия от первого шага, %.
  conversionFromFirst: number;
  /// Конверсия от предыдущего шага, %.
  conversionFromPrev: number;
  /// Средняя задержка от предыдущего шага, секунды (медиана была бы лучше, но для MVP — avg).
  avgSecondsFromPrev: number | null;
}

export interface FunnelMetrics {
  funnelId: string;
  funnelName: string;
  from: string | null;
  to: string | null;
  totalUsers: number;
  steps: FunnelStepResult[];
  /// Если groupBy != 'none', тут лежат разбиения по сегментам.
  segments?: Array<{
    key: string;
    label: string;
    totalUsers: number;
    steps: FunnelStepResult[];
  }>;
}

/**
 * Сервис расчёта воронок.
 *
 * Логика:
 *   1. Для каждого шага собираем (userId, ts) — момент первого совершения события,
 *      удовлетворяющего eventType + eventFilters в пределах from..to.
 *   2. Пользователь зачисляется в шаг N только если у него есть события всех шагов
 *      0..N И они идут в правильном порядке по времени.
 *   3. Конверсии: prev = users[N]/users[N-1], first = users[N]/users[0].
 *
 * Это classic funnel (как Mixpanel «Strict order»).
 * Для repeat-events (1-я → 3-я → 10-я генерация) используется псевдо-eventType
 * формата 'generation_created:nth=N' — нагрузка берётся из payload.nth.
 */
@Injectable()
export class FunnelsService {
  private readonly logger = new Logger(FunnelsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────── CRUD ───────

  async list() {
    return this.prisma.funnel.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { steps: true } } },
    });
  }

  async getOne(id: string) {
    const funnel = await this.prisma.funnel.findUnique({
      where: { id },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    if (!funnel) throw new NotFoundException('Воронка не найдена');
    return funnel;
  }

  async create(data: {
    name: string;
    description?: string;
    ownerId?: string;
    steps: FunnelStepDef[];
    globalFilters?: Record<string, any> | null;
  }) {
    if (!data.name?.trim()) throw new BadRequestException('Имя воронки обязательно');
    if (!data.steps?.length) throw new BadRequestException('Воронка должна содержать хотя бы один шаг');

    return this.prisma.funnel.create({
      data: {
        name: data.name.trim(),
        description: data.description ?? null,
        ownerId: data.ownerId ?? null,
        globalFilters: (data.globalFilters ?? null) as any,
        steps: {
          create: data.steps.map((s, i) => ({
            order: s.order ?? i,
            label: s.label,
            eventType: s.eventType,
            eventFilters: (s.eventFilters ?? null) as any,
            isCohortAnchor: !!s.isCohortAnchor,
          })),
        },
      },
      include: { steps: true },
    });
  }

  async update(id: string, data: {
    name?: string;
    description?: string;
    isActive?: boolean;
    steps?: FunnelStepDef[];
    globalFilters?: Record<string, any> | null;
    welcomeText?: string | null;
    welcomeButtonLabel?: string | null;
    welcomeButtonAction?: string | null;
    welcomeButtonUrl?: string | null;
    subscriptionChannelId?: string | null;
    subscriptionChannelName?: string | null;
    subscriptionPromptText?: string | null;
    subscriptionSuccessText?: string | null;
  }) {
    await this.getOne(id); // 404 if not exists

    return this.prisma.$transaction(async (tx) => {
      const trim = (v: string | null | undefined) =>
        v === undefined ? undefined : (v ? v.trim() || null : null);
      const updated = await tx.funnel.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          isActive: data.isActive,
          globalFilters: data.globalFilters === undefined ? undefined : (data.globalFilters as any),
          welcomeText: trim(data.welcomeText) as any,
          welcomeButtonLabel: trim(data.welcomeButtonLabel) as any,
          welcomeButtonAction: trim(data.welcomeButtonAction) as any,
          welcomeButtonUrl: trim(data.welcomeButtonUrl) as any,
          subscriptionChannelId: trim(data.subscriptionChannelId) as any,
          subscriptionChannelName: trim(data.subscriptionChannelName) as any,
          subscriptionPromptText: trim(data.subscriptionPromptText) as any,
          subscriptionSuccessText: trim(data.subscriptionSuccessText) as any,
        },
      });
      if (data.steps) {
        // Перезаписываем шаги полностью — UI редактирует целиком.
        await tx.funnelStep.deleteMany({ where: { funnelId: id } });
        await tx.funnelStep.createMany({
          data: data.steps.map((s, i) => ({
            funnelId: id,
            order: s.order ?? i,
            label: s.label,
            eventType: s.eventType,
            eventFilters: (s.eventFilters ?? null) as any,
            isCohortAnchor: !!s.isCohortAnchor,
          })),
        });
      }
      return tx.funnel.findUnique({
        where: { id: updated.id },
        include: { steps: { orderBy: { order: 'asc' } } },
      });
    });
  }

  async remove(id: string) {
    await this.getOne(id);
    await this.prisma.funnel.delete({ where: { id } });
    return { ok: true };
  }

  // ─────── COMPUTE ───────

  /**
   * Применить JSON-фильтр к Prisma where. Поддерживает:
   *   { utmSource: 'instagram' }                  → AnalyticsEvent.utmSource = 'instagram'
   *   { 'payload.generationType': 'worksheet' }   → JSONB path = value
   *   { 'payload.nth': 3 }                        → JSONB number equality
   */
  private filtersToWhere(filters: Record<string, any> | null | undefined): any {
    if (!filters || typeof filters !== 'object') return {};
    const where: any = {};
    for (const [key, value] of Object.entries(filters)) {
      if (key.startsWith('payload.')) {
        const path = key.replace(/^payload\./, '').split('.');
        where.AND = where.AND ?? [];
        where.AND.push({ payload: { path, equals: value } });
      } else {
        where[key] = value;
      }
    }
    return where;
  }

  /**
   * Расчёт воронки. Возвращает FunnelMetrics с шагами и опционально сегментами.
   */
  async compute(funnelId: string, opts: FunnelComputeOptions = {}): Promise<FunnelMetrics> {
    const funnel = await this.getOne(funnelId);
    const steps = funnel.steps;
    if (!steps.length) {
      return {
        funnelId,
        funnelName: funnel.name,
        from: opts.from?.toISOString() ?? null,
        to: opts.to?.toISOString() ?? null,
        totalUsers: 0,
        steps: [],
      };
    }

    const globalFilters = (funnel.globalFilters ?? {}) as Record<string, any>;
    const globalWhere = this.filtersToWhere(globalFilters);
    const dateWhere = {
      ...(opts.from ? { createdAt: { gte: opts.from } } : {}),
      ...(opts.to ? { createdAt: { ...(opts.from ? { gte: opts.from } : {}), lte: opts.to } } : {}),
    };

    // Получаем участников каждого шага: userId + min(createdAt).
    // Используем groupBy через raw в три приёма (Prisma groupBy не умеет с jsonb-фильтрами на нативном уровне).
    const stepBuckets: Array<Map<string, { ts: Date; segmentValue: string | null }>> = [];
    for (const step of steps) {
      const stepFilters = (step.eventFilters ?? {}) as Record<string, any>;
      const eventType = step.eventType.split(':')[0]; // 'generation_created:nth=3' → 'generation_created'
      let mergedFilters: Record<string, any> = { ...globalFilters, ...stepFilters };

      // Если eventType содержит ":nth=N" — добавляем фильтр на payload.nth.
      const nthMatch = step.eventType.match(/:nth=(\d+)/);
      if (nthMatch) {
        mergedFilters['payload.nth'] = Number(nthMatch[1]);
      }

      const where = {
        eventType,
        userId: { not: null as any },
        ...this.filtersToWhere(mergedFilters),
        ...dateWhere,
      };

      const rows = await this.prisma.analyticsEvent.findMany({
        where: where as any,
        select: {
          userId: true,
          createdAt: true,
          utmSource: true,
          utmCampaign: true,
          utmMedium: true,
          eventName: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      const bucket = new Map<string, { ts: Date; segmentValue: string | null }>();
      for (const row of rows) {
        if (!row.userId) continue;
        if (bucket.has(row.userId)) continue; // первое событие, дальше игнорируем
        const segVal =
          opts.groupBy === 'utmSource'   ? row.utmSource   ?? '(none)'
        : opts.groupBy === 'utmCampaign' ? row.utmCampaign ?? '(none)'
        : opts.groupBy === 'utmMedium'   ? row.utmMedium   ?? '(none)'
        : opts.groupBy === 'eventName'   ? row.eventName   ?? '(none)'
        : null;
        bucket.set(row.userId, { ts: row.createdAt, segmentValue: segVal });
      }
      stepBuckets.push(bucket);
    }

    // Walk: пользователь учитывается в шаге N только если он был во всех 0..N с правильным порядком времени.
    const maxWindowMs = (opts.maxWindowSeconds ?? 0) * 1000;
    const usersPerStep: number[] = new Array(steps.length).fill(0);
    const totalDelays: number[] = new Array(steps.length).fill(0);
    const delaysCount: number[] = new Array(steps.length).fill(0);
    /// segment → users per step
    const segmentStats = new Map<string, { users: number[]; delays: number[]; counts: number[] }>();

    const firstBucket = stepBuckets[0];
    for (const [userId, firstHit] of firstBucket.entries()) {
      const segKey = firstHit.segmentValue;
      let chainOk = true;
      let prevTs = firstHit.ts;
      usersPerStep[0] += 1;

      if (opts.groupBy && opts.groupBy !== 'none' && segKey != null) {
        if (!segmentStats.has(segKey)) {
          segmentStats.set(segKey, {
            users: new Array(steps.length).fill(0),
            delays: new Array(steps.length).fill(0),
            counts: new Array(steps.length).fill(0),
          });
        }
        segmentStats.get(segKey)!.users[0] += 1;
      }

      for (let i = 1; i < steps.length; i++) {
        const hit = stepBuckets[i].get(userId);
        if (!hit) { chainOk = false; break; }
        if (hit.ts.getTime() < prevTs.getTime()) { chainOk = false; break; }
        if (maxWindowMs > 0 && hit.ts.getTime() - prevTs.getTime() > maxWindowMs) {
          chainOk = false; break;
        }
        const deltaSec = (hit.ts.getTime() - prevTs.getTime()) / 1000;
        usersPerStep[i] += 1;
        totalDelays[i] += deltaSec;
        delaysCount[i] += 1;
        if (segKey != null && segmentStats.has(segKey)) {
          const seg = segmentStats.get(segKey)!;
          seg.users[i] += 1;
          seg.delays[i] += deltaSec;
          seg.counts[i] += 1;
        }
        prevTs = hit.ts;
        if (!chainOk) break;
      }
    }

    const buildSteps = (
      users: number[],
      delaysSum: number[],
      delayCounts: number[],
    ): FunnelStepResult[] => {
      return steps.map((s, i) => {
        const u = users[i];
        const first = users[0] || 0;
        const prev = i === 0 ? u : users[i - 1];
        return {
          order: s.order,
          label: s.label,
          eventType: s.eventType,
          users: u,
          conversionFromFirst: first > 0 ? Math.round((u / first) * 1000) / 10 : 0,
          conversionFromPrev: prev > 0 ? Math.round((u / prev) * 1000) / 10 : 0,
          avgSecondsFromPrev: i === 0 || delayCounts[i] === 0 ? null : Math.round(delaysSum[i] / delayCounts[i]),
        };
      });
    };

    const result: FunnelMetrics = {
      funnelId,
      funnelName: funnel.name,
      from: opts.from?.toISOString() ?? null,
      to: opts.to?.toISOString() ?? null,
      totalUsers: usersPerStep[0],
      steps: buildSteps(usersPerStep, totalDelays, delaysCount),
    };

    if (opts.groupBy && opts.groupBy !== 'none') {
      const segments = Array.from(segmentStats.entries())
        .sort((a, b) => b[1].users[0] - a[1].users[0])
        .map(([key, st]) => ({
          key,
          label: key,
          totalUsers: st.users[0],
          steps: buildSteps(st.users, st.delays, st.counts),
        }));
      result.segments = segments;
    }

    return result;
  }

  /**
   * Когортный анализ: пользователи, попавшие в anchor-шаг в день X,
   * сколько процентов дошли до финального шага за N дней.
   *
   * Возвращает матрицу: { cohortDate, cohortSize, dayN: percent }.
   */
  async cohortMatrix(funnelId: string, opts: { from?: Date; to?: Date; daysWindow?: number } = {}) {
    const funnel = await this.getOne(funnelId);
    const steps = funnel.steps;
    if (steps.length < 2) {
      throw new BadRequestException('Для когортного анализа нужно минимум 2 шага');
    }

    const anchor = steps.find(s => s.isCohortAnchor) || steps[0];
    const target = steps[steps.length - 1];
    const daysWindow = opts.daysWindow ?? 30;

    const dateWhere = {
      ...(opts.from ? { createdAt: { gte: opts.from } } : {}),
      ...(opts.to ? { createdAt: { ...(opts.from ? { gte: opts.from } : {}), lte: opts.to } } : {}),
    };

    const anchorRows = await this.prisma.analyticsEvent.findMany({
      where: {
        eventType: anchor.eventType.split(':')[0],
        userId: { not: null as any },
        ...this.filtersToWhere((anchor.eventFilters ?? null) as any),
        ...dateWhere,
      } as any,
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // userId → день первого anchor
    const anchorByUser = new Map<string, Date>();
    for (const r of anchorRows) {
      if (!r.userId) continue;
      if (anchorByUser.has(r.userId)) continue;
      anchorByUser.set(r.userId, r.createdAt);
    }

    const targetRows = await this.prisma.analyticsEvent.findMany({
      where: {
        eventType: target.eventType.split(':')[0],
        userId: { in: Array.from(anchorByUser.keys()) },
        ...this.filtersToWhere((target.eventFilters ?? null) as any),
      } as any,
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const targetByUser = new Map<string, Date>();
    for (const r of targetRows) {
      if (!r.userId) continue;
      if (targetByUser.has(r.userId)) continue;
      targetByUser.set(r.userId, r.createdAt);
    }

    // Группируем по дню anchor.
    type Cohort = { date: string; size: number; converted: number[] /* index = days after anchor */ };
    const cohorts = new Map<string, Cohort>();

    for (const [userId, anchorTs] of anchorByUser.entries()) {
      const day = anchorTs.toISOString().slice(0, 10);
      if (!cohorts.has(day)) {
        cohorts.set(day, {
          date: day,
          size: 0,
          converted: new Array(daysWindow + 1).fill(0),
        });
      }
      const cohort = cohorts.get(day)!;
      cohort.size += 1;

      const targetTs = targetByUser.get(userId);
      if (targetTs && targetTs.getTime() >= anchorTs.getTime()) {
        const deltaDays = Math.floor(
          (targetTs.getTime() - anchorTs.getTime()) / (24 * 60 * 60 * 1000),
        );
        for (let d = deltaDays; d <= daysWindow; d++) {
          cohort.converted[d] += 1;
        }
      }
    }

    return {
      funnelId,
      funnelName: funnel.name,
      anchorLabel: anchor.label,
      targetLabel: target.label,
      daysWindow,
      cohorts: Array.from(cohorts.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(c => ({
          date: c.date,
          size: c.size,
          conversions: c.converted.map((cnt, day) => ({
            day,
            users: cnt,
            percent: c.size > 0 ? Math.round((cnt / c.size) * 1000) / 10 : 0,
          })),
        })),
    };
  }

  /**
   * Топ-источники: для каждого UTM source — сколько привели на финальный шаг.
   * Используется в разделе «Источники» админки.
   */
  async sourceBreakdown(funnelId: string, opts: { from?: Date; to?: Date } = {}) {
    const m = await this.compute(funnelId, { ...opts, groupBy: 'utmSource' });
    const lastIdx = m.steps.length - 1;
    return {
      funnelId,
      funnelName: m.funnelName,
      totalUsers: m.totalUsers,
      finalConverted: m.steps[lastIdx]?.users ?? 0,
      sources: (m.segments ?? []).map(s => ({
        source: s.key,
        entered:        s.totalUsers,
        finalConverted: s.steps[lastIdx]?.users ?? 0,
        conversion:     s.steps[lastIdx]?.conversionFromFirst ?? 0,
      })).sort((a, b) => b.entered - a.entered),
    };
  }
}
