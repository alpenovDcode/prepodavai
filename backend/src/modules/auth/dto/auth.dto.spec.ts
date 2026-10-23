import { ValidationPipe } from '@nestjs/common';
import { VerifyEmailCodeDto } from './auth.dto';

/**
 * Прогоняем DTO через тот же ValidationPipe, что стоит глобально
 * в main.ts (whitelist + forbidNonWhitelisted + transform) — чтобы
 * тест ловил ровно ту ошибку, которую видит пользователь.
 *
 * Регрессия: фронт (AuthModal) шлёт anonId в /auth/verify-email-code
 * для склейки pre-reg аналитики, а DTO поле не объявлял —
 * ValidationPipe отвечал 400 «property anonId should not exist»
 * и регистрация по email-коду падала целиком.
 */
const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
});

const meta = { type: 'body' as const, metatype: VerifyEmailCodeDto };

describe('VerifyEmailCodeDto', () => {
    it('принимает минимальный валидный body', async () => {
        const dto = await pipe.transform(
            { email: 'user@example.com', code: '291598' },
            meta,
        );
        expect(dto.email).toBe('user@example.com');
        expect(dto.code).toBe('291598');
    });

    it('принимает anonId строкой (склейка аналитики)', async () => {
        const dto = await pipe.transform(
            { email: 'user@example.com', code: '291598', anonId: 'anon_abc123' },
            meta,
        );
        expect(dto.anonId).toBe('anon_abc123');
    });

    it('принимает anonId = null (tracker не инициализирован)', async () => {
        const dto = await pipe.transform(
            { email: 'user@example.com', code: '291598', anonId: null },
            meta,
        );
        expect(dto.anonId).toBeNull();
    });

    it('принимает полный body фронта: anonId + UTM + firstName', async () => {
        const dto = await pipe.transform(
            {
                email: 'user@example.com',
                code: '291598',
                firstName: 'Любовь',
                anonId: 'anon_abc123',
                utmSource: 'max',
                utmMedium: 'bot',
            },
            meta,
        );
        expect(dto.anonId).toBe('anon_abc123');
        expect(dto.utmSource).toBe('max');
    });

    it('по-прежнему отбивает действительно чужие поля', async () => {
        // Детали валидации у NestJS лежат в response.message,
        // текст самого исключения — просто «Bad Request Exception».
        await expect(
            pipe
                .transform({ email: 'user@example.com', code: '291598', isAdmin: true }, meta)
                .catch((e) => Promise.reject(new Error(JSON.stringify(e.getResponse())))),
        ).rejects.toThrow(/isAdmin/);
    });

    it('по-прежнему требует email и code', async () => {
        await expect(pipe.transform({ code: '291598' }, meta)).rejects.toThrow();
        await expect(pipe.transform({ email: 'user@example.com' }, meta)).rejects.toThrow();
    });
});
