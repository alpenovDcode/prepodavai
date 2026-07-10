import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { resolveThrottleTracker } from './throttler-tracker';

/**
 * Глобальный throttler-guard. Отличается от дефолтного тем, что трекает
 * по user id (если есть валидный JWT), а не по IP. Иначе десятки юзеров
 * за одним CGNAT/корп. прокси делят общий лимит и глушат друг друга —
 * симптом: массовые 429 на страницах с polling'ом (диалоги, maintenance).
 *
 * Логика лимита (per-second/per-minute) остаётся дефолтная, задаётся в
 * ThrottlerModule.forRoot.
 */
@Injectable()
export class GlobalThrottlerGuard extends ThrottlerGuard {
    protected async getTracker(req: Record<string, any>): Promise<string> {
        return resolveThrottleTracker(req);
    }
}
