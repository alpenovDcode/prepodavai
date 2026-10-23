/**
 * Выбирает ключ трекинга для rate-limit'а.
 *
 * Почему не по IP:
 *   Дефолтный @nestjs/throttler трекает по req.ip. За CGNAT/корпоративным NAT
 *   или Cloudflare + офисной сетью десятки юзеров сидят с одного публичного IP
 *   и делят общий бюджет. Один юзер, открывший вкладку с активным polling'ом
 *   (диалог биржи каждые 3 сек + maintenance каждые 30 сек + другой tab),
 *   мгновенно упирает соседей в 429.
 *
 * Решение — трекать по user id из JWT. Юзер получает свой изолированный
 * бюджет. Для публичных/не залогиненных запросов остаётся fallback на IP.
 *
 * Про подпись JWT: НЕ проверяем. Подделать чужой sub можно, но это даёт
 * только чужой rate-limit-бюджет — реального доступа не даёт, JwtAuthGuard
 * дальше по пайплайну всё равно отсечёт 401 при неверной подписи. Поэтому
 * трекинг без верификации безопасен и позволяет не тащить JwtService в guard.
 */
export function resolveThrottleTracker(req: {
    cookies?: Record<string, string>;
    headers?: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string };
}): string {
    const userId = extractUserIdFromJwt(req);
    if (userId) return `user-${userId}`;

    const forwarded = req.headers?.['x-forwarded-for'];
    const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const firstForwarded = typeof forwardedStr === 'string' ? forwardedStr.split(',')[0].trim() : '';

    const ip = firstForwarded || req.socket?.remoteAddress || 'unknown';
    return `ip-${ip}`;
}

function extractUserIdFromJwt(req: {
    cookies?: Record<string, string>;
    headers?: Record<string, string | string[] | undefined>;
}): string | null {
    // Порядок совпадает с JwtStrategy: сначала cookie, потом Authorization Bearer.
    const cookieToken = req.cookies?.prepodavai_token;
    if (cookieToken) {
        const id = decodeJwtSub(cookieToken);
        if (id) return id;
    }

    const authHeader = req.headers?.authorization;
    const authStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (typeof authStr === 'string' && authStr.startsWith('Bearer ')) {
        const id = decodeJwtSub(authStr.slice('Bearer '.length));
        if (id) return id;
    }

    return null;
}

function decodeJwtSub(token: string): string | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
        if (payload && (typeof payload.sub === 'string' || typeof payload.sub === 'number')) {
            return String(payload.sub);
        }
        return null;
    } catch {
        return null;
    }
}
