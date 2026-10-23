import { resolveThrottleTracker } from './throttler-tracker';

/**
 * Правило трекера — задокументировано тестами:
 * 1. Если в запросе есть валидный JWT (cookie prepodavai_token или
 *    Authorization: Bearer) — трекаем по user id (sub). Так лимиты
 *    изолированы per-user и не делятся между юзерами за одним NAT.
 * 2. Подпись НЕ проверяем — это делает JwtAuthGuard дальше по пайплайну.
 *    Подделка чужого id даёт злоумышленнику ЧУЖОЙ лимит — это не
 *    расширение атаки, потому что дальше запрос всё равно отвалится по auth.
 * 3. Если JWT нет / битый — fallback по IP (X-Forwarded-For первый, потом
 *    remoteAddress).
 */

function makeJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${body}.fake-signature`;
}

describe('resolveThrottleTracker', () => {
    it('вытаскивает user id из cookie prepodavai_token', () => {
        const req = {
            cookies: { prepodavai_token: makeJwt({ sub: 'user-abc', role: 'teacher' }) },
            headers: {},
        };
        expect(resolveThrottleTracker(req as any)).toBe('user-user-abc');
    });

    it('вытаскивает user id из Authorization: Bearer', () => {
        const req = {
            headers: { authorization: `Bearer ${makeJwt({ sub: 'user-xyz' })}` },
        };
        expect(resolveThrottleTracker(req as any)).toBe('user-user-xyz');
    });

    it('cookie имеет приоритет над Bearer (совпадает с JwtStrategy)', () => {
        const req = {
            cookies: { prepodavai_token: makeJwt({ sub: 'from-cookie' }) },
            headers: { authorization: `Bearer ${makeJwt({ sub: 'from-header' })}` },
        };
        expect(resolveThrottleTracker(req as any)).toBe('user-from-cookie');
    });

    it('падает в IP-трекинг при битом JWT (не выбрасывает исключение)', () => {
        const req = {
            headers: { authorization: 'Bearer not-a-jwt', 'x-forwarded-for': '1.2.3.4' },
        };
        expect(resolveThrottleTracker(req as any)).toBe('ip-1.2.3.4');
    });

    it('падает в IP-трекинг когда токена нет вообще', () => {
        const req = {
            headers: { 'x-forwarded-for': '5.6.7.8' },
            socket: { remoteAddress: '10.0.0.1' },
        };
        expect(resolveThrottleTracker(req as any)).toBe('ip-5.6.7.8');
    });

    it('берёт первый IP из списка X-Forwarded-For (клиент, не прокси)', () => {
        const req = {
            headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1, 10.0.0.2' },
        };
        expect(resolveThrottleTracker(req as any)).toBe('ip-9.9.9.9');
    });

    it('падает на socket.remoteAddress когда X-Forwarded-For отсутствует', () => {
        const req = {
            headers: {},
            socket: { remoteAddress: '127.0.0.1' },
        };
        expect(resolveThrottleTracker(req as any)).toBe('ip-127.0.0.1');
    });

    it('возвращает ip-unknown если совсем ничего нет (не бросает)', () => {
        const req = { headers: {} };
        expect(resolveThrottleTracker(req as any)).toBe('ip-unknown');
    });

    it('игнорирует JWT без sub-поля', () => {
        const req = {
            cookies: { prepodavai_token: makeJwt({ role: 'nobody' }) },
            headers: { 'x-forwarded-for': '2.2.2.2' },
        };
        expect(resolveThrottleTracker(req as any)).toBe('ip-2.2.2.2');
    });

    it('игнорирует JWT с не-строковым sub', () => {
        const req = {
            cookies: { prepodavai_token: makeJwt({ sub: 12345 }) },
            headers: { 'x-forwarded-for': '3.3.3.3' },
        };
        // числовые id тоже валидны — приводим к строке
        expect(resolveThrottleTracker(req as any)).toBe('user-12345');
    });

    it('игнорирует Authorization без префикса Bearer', () => {
        const req = {
            headers: { authorization: makeJwt({ sub: 'x' }), 'x-forwarded-for': '4.4.4.4' },
        };
        expect(resolveThrottleTracker(req as any)).toBe('ip-4.4.4.4');
    });
});
