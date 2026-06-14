import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Стандартные типы событий. Не enum, чтобы можно было трекать произвольные
 * клиентские события без миграций.
 */
export const EVENT_TYPES = {
  // — клиентские —
  PAGE_VIEW:       'page_view',
  CLICK:           'click',
  ONBOARDING_VIEW: 'onboarding_view',
  ONBOARDING_STEP: 'onboarding_step',
  // — лидогенерация —
  USER_REGISTERED:        'user_registered',
  USER_EMAIL_VERIFIED:    'user_email_verified',
  TG_LINKED:              'tg_linked',
  CHANNEL_SUBSCRIBED:     'channel_subscribed',     // подписка на ТГ-канал
  CHANNEL_UNSUBSCRIBED:   'channel_unsubscribed',
  REFERRAL_USED:          'referral_used',
  // — продуктовые —
  GENERATION_CREATED:  'generation_created',
  GENERATION_COMPLETED:'generation_completed',
  ASSIGNMENT_CREATED:  'assignment_created',
  SUBMISSION_CREATED:  'submission_created',
  STUDENT_INVITED:     'student_invited',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES] | string;

export interface TrackContext {
  userId?: string | null;
  anonId?: string | null;
  eventType: EventType;
  eventName?: string | null;
  payload?: Record<string, any> | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  sessionId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  referer?: string | null;
  /// Если задано — используется как точное время события (например при импорте старых данных).
  createdAt?: Date;
}

/**
 * Единый сервис записи событий.
 *
 * Используется из бэка напрямую (после регистрации, после генерации, и т.д.)
 * и из контроллера (для клиентских page_view/click).
 *
 * Никогда не валит вызывающий запрос: ошибки логируются и проглатываются.
 */
@Injectable()
export class AnalyticsEventsService {
  private readonly logger = new Logger(AnalyticsEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Хэшируем IP для подсчёта DAU без хранения PII.
   * Соль захардкодена, потому что нам не важна обратимость — важно одинаковое
   * значение для одного и того же IP в рамках инстанса.
   */
  private hashIp(ip?: string | null): string | null {
    if (!ip) return null;
    return crypto.createHash('sha256').update(`prpd-salt:${ip}`).digest('hex').slice(0, 32);
  }

  /**
   * Если userId известен — подтягиваем сохранённые UTM из AppUser (на случай
   * если в текущем запросе их нет, а они были при регистрации).
   * Это удобно для серверных событий типа generation_created.
   */
  private async enrichUtmFromUser(userId: string | null | undefined, ctx: TrackContext) {
    if (!userId) return ctx;
    if (ctx.utmSource) return ctx; // приоритет — у явно переданных
    try {
      const u = await this.prisma.appUser.findUnique({
        where: { id: userId },
        select: {
          utmSource: true, utmMedium: true, utmCampaign: true,
          utmContent: true, utmTerm: true,
        },
      });
      if (!u) return ctx;
      return {
        ...ctx,
        utmSource:   ctx.utmSource   ?? u.utmSource   ?? null,
        utmMedium:   ctx.utmMedium   ?? u.utmMedium   ?? null,
        utmCampaign: ctx.utmCampaign ?? u.utmCampaign ?? null,
        utmContent:  ctx.utmContent  ?? u.utmContent  ?? null,
        utmTerm:     ctx.utmTerm     ?? u.utmTerm     ?? null,
      };
    } catch (e: any) {
      this.logger.warn(`UTM enrichment failed: ${e?.message}`);
      return ctx;
    }
  }

  /**
   * Записать событие. Никогда не бросает — только логирует.
   */
  async track(ctx: TrackContext): Promise<void> {
    try {
      const enriched = await this.enrichUtmFromUser(ctx.userId, ctx);
      await this.prisma.analyticsEvent.create({
        data: {
          anonId:      enriched.anonId      ?? null,
          userId:      enriched.userId      ?? null,
          eventType:   enriched.eventType,
          eventName:   enriched.eventName   ?? null,
          payload:     (enriched.payload    ?? null) as any,
          utmSource:   enriched.utmSource   ?? null,
          utmMedium:   enriched.utmMedium   ?? null,
          utmCampaign: enriched.utmCampaign ?? null,
          utmContent:  enriched.utmContent  ?? null,
          utmTerm:     enriched.utmTerm     ?? null,
          sessionId:   enriched.sessionId   ?? null,
          userAgent:   enriched.userAgent   ?? null,
          ipHash:      this.hashIp(enriched.ip),
          referer:     enriched.referer     ?? null,
          createdAt:   enriched.createdAt   ?? new Date(),
        },
      });
    } catch (e: any) {
      // НИКОГДА не валим вызывающий запрос. Аналитика — best-effort.
      this.logger.warn(`Failed to track ${ctx.eventType}: ${e?.message}`);
    }
  }

  /**
   * Удобный sugar: достаёт UTM/userAgent/IP из NestJS request.
   * Можно использовать в контроллерах для клиентских событий.
   */
  async trackFromRequest(req: any, ctx: Omit<TrackContext, 'userId' | 'userAgent' | 'ip' | 'referer'>) {
    return this.track({
      ...ctx,
      userId:    req.user?.id ?? null,
      anonId:    ctx.anonId ?? (req.cookies?.anonId ?? null),
      userAgent: req.headers?.['user-agent'] ?? null,
      ip:        (req.headers?.['x-forwarded-for']?.split(',')[0] ?? req.ip ?? null),
      referer:   req.headers?.referer ?? null,
    });
  }

  /**
   * Когда пользователь регистрируется — связываем все anonId-события с его userId.
   * Это даёт сквозную атрибуцию от первого page_view до первой генерации.
   */
  async claimAnonEvents(anonId: string, userId: string): Promise<number> {
    if (!anonId || !userId) return 0;
    try {
      const result = await this.prisma.analyticsEvent.updateMany({
        where: { anonId, userId: null },
        data: { userId },
      });
      this.logger.log(`Claimed ${result.count} anon events for user ${userId}`);
      return result.count;
    } catch (e: any) {
      this.logger.warn(`Failed to claim anon events: ${e?.message}`);
      return 0;
    }
  }
}
