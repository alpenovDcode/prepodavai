import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards, BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { FunnelsService, FunnelComputeOptions, FunnelStepDef } from './funnels.service';

/**
 * Управление воронками + расчёт метрик. ВСЁ только под админ-гардом.
 * Обычные учителя/ученики этих endpoint'ов не видят.
 */
@Controller('admin/funnels')
@UseGuards(JwtAuthGuard, AdminGuard)
export class FunnelsController {
  constructor(private readonly service: FunnelsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  async create(
    @Request() req: any,
    @Body() body: { name: string; description?: string; steps: FunnelStepDef[]; globalFilters?: any },
  ) {
    return this.service.create({ ...body, ownerId: req.user?.id });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; isActive?: boolean; steps?: FunnelStepDef[]; globalFilters?: any },
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  /**
   * Метрики воронки. Параметры:
   *   from, to — ISO даты (опционально)
   *   groupBy — 'utmSource' | 'utmCampaign' | 'utmMedium' | 'eventName' | 'none'
   *   maxWindowSeconds — лимит времени между шагами (для «1 → 10 за 30 дней»)
   */
  @Get(':id/metrics')
  metrics(@Param('id') id: string, @Query() q: any) {
    const opts: FunnelComputeOptions = {
      from: q.from ? new Date(q.from) : undefined,
      to:   q.to   ? new Date(q.to)   : undefined,
      groupBy: q.groupBy,
      maxWindowSeconds: q.maxWindowSeconds ? Number(q.maxWindowSeconds) : undefined,
    };
    if (opts.from && isNaN(opts.from.getTime())) throw new BadRequestException('Invalid from');
    if (opts.to && isNaN(opts.to.getTime())) throw new BadRequestException('Invalid to');
    return this.service.compute(id, opts);
  }

  /**
   * Когортный анализ. ?daysWindow=30 (default).
   */
  @Get(':id/cohorts')
  cohorts(@Param('id') id: string, @Query() q: any) {
    return this.service.cohortMatrix(id, {
      from: q.from ? new Date(q.from) : undefined,
      to:   q.to   ? new Date(q.to)   : undefined,
      daysWindow: q.daysWindow ? Number(q.daysWindow) : undefined,
    });
  }

  /**
   * Топ источников трафика (по UTM source).
   */
  @Get(':id/sources')
  sources(@Param('id') id: string, @Query() q: any) {
    return this.service.sourceBreakdown(id, {
      from: q.from ? new Date(q.from) : undefined,
      to:   q.to   ? new Date(q.to)   : undefined,
    });
  }
}
