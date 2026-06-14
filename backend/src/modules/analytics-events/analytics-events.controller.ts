import { Body, Controller, Post, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AnalyticsEventsService, EventType } from './analytics-events.service';

interface TrackBody {
  eventType: EventType;
  eventName?: string;
  payload?: Record<string, any>;
  anonId?: string;
  sessionId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
}

interface BatchBody {
  events: TrackBody[];
}

/**
 * Клиентский endpoint для записи событий.
 *
 * НЕ требует авторизации — события до регистрации (page_view, click) тоже нужны.
 * Если в request есть JWT-cookie, userId автоматически проставится в track().
 *
 * Можно отправлять одиночные события или батчи (батч важен, чтобы навбигейшен
 * `sendBeacon` не дробил по N запросов).
 */
@Controller('analytics')
@SkipThrottle()
export class AnalyticsEventsController {
  constructor(private readonly service: AnalyticsEventsService) {}

  @Post('track')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 60, ttl: 60_000 } }) // защита от спама с одного IP
  async track(@Req() req: any, @Body() body: TrackBody): Promise<void> {
    if (!body?.eventType) return;
    await this.service.trackFromRequest(req, body);
  }

  /**
   * Батч-режим: фронт отправляет накопленные события (например при unload через sendBeacon).
   */
  @Post('track/batch')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async batch(@Req() req: any, @Body() body: BatchBody): Promise<void> {
    const events = Array.isArray(body?.events) ? body.events.slice(0, 50) : [];
    // Не Promise.all — нам важнее не положить БД, чем быть быстрыми тут.
    for (const ev of events) {
      if (!ev?.eventType) continue;
      await this.service.trackFromRequest(req, ev);
    }
  }
}
