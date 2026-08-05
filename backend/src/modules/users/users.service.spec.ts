import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SmscService } from '../smsc/smsc.service';

/**
 * Регресс на баг: при вводе неверного текущего пароля пользователя
 * ВЫБРАСЫВАЛО из сессии, а пароль оставался старым.
 *
 * Причина: сервис отвечал 401 (UnauthorizedException) на ошибку ПОЛЯ ФОРМЫ.
 * Глобальный axios-интерцептор на фронте трактует ЛЮБОЙ 401 как «сессия
 * истекла» → чистит localStorage и редиректит на главную.
 *
 * Ошибка ввода в форме — это 400, а не 401. 401 должен означать только
 * «твой токен недействителен».
 */
describe('UsersService — коды ошибок форм (не должны разлогинивать)', () => {
    let service: UsersService;
    let prisma: any;

    beforeEach(async () => {
        prisma = {
            appUser: { findUnique: jest.fn(), update: jest.fn() },
            verificationCode: { findFirst: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
            $transaction: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UsersService,
                { provide: PrismaService, useValue: prisma },
                { provide: SmscService, useValue: { sendSms: jest.fn() } },
            ],
        }).compile();

        service = module.get<UsersService>(UsersService);
    });

    describe('changePassword', () => {
        const withHash = async (plain: string) => ({
            id: 'u-1',
            passwordHash: await bcrypt.hash(plain, 10),
        });

        it('неверный текущий пароль → 400, а НЕ 401 (иначе фронт разлогинивает)', async () => {
            prisma.appUser.findUnique.mockResolvedValue(await withHash('правильный-пароль'));

            await expect(
                service.changePassword('u-1', 'неправильный-пароль', 'новый-пароль-123'),
            ).rejects.toThrow(BadRequestException);

            await expect(
                service.changePassword('u-1', 'неправильный-пароль', 'новый-пароль-123'),
            ).rejects.not.toThrow(UnauthorizedException);
        });

        it('неверный текущий пароль → статус ровно 400', async () => {
            prisma.appUser.findUnique.mockResolvedValue(await withHash('правильный-пароль'));

            await expect(
                service.changePassword('u-1', 'неправильный-пароль', 'новый-пароль-123'),
            ).rejects.toMatchObject({ status: 400 });
        });

        it('неверный текущий пароль → пароль в БД НЕ меняется', async () => {
            prisma.appUser.findUnique.mockResolvedValue(await withHash('правильный-пароль'));

            await expect(
                service.changePassword('u-1', 'неправильный-пароль', 'новый-пароль-123'),
            ).rejects.toThrow();

            expect(prisma.appUser.update).not.toHaveBeenCalled();
        });

        it('верный текущий пароль → пароль обновляется', async () => {
            prisma.appUser.findUnique.mockResolvedValue(await withHash('правильный-пароль'));

            await service.changePassword('u-1', 'правильный-пароль', 'новый-пароль-123');

            expect(prisma.appUser.update).toHaveBeenCalledTimes(1);
            const arg = prisma.appUser.update.mock.calls[0][0];
            expect(arg.where).toEqual({ id: 'u-1' });
            await expect(
                bcrypt.compare('новый-пароль-123', arg.data.passwordHash),
            ).resolves.toBe(true);
        });

        it('пользователь без пароля (вход через Telegram) → пароль просто устанавливается', async () => {
            prisma.appUser.findUnique.mockResolvedValue({ id: 'u-1', passwordHash: null });

            await service.changePassword('u-1', '', 'новый-пароль-123');

            expect(prisma.appUser.update).toHaveBeenCalledTimes(1);
        });
    });

    describe('verifyPhoneAndGrantBonus', () => {
        it('неверный код из SMS → 400, а НЕ 401 (тот же класс бага)', async () => {
            prisma.appUser.findUnique.mockResolvedValue({ id: 'u-1', phoneVerified: false });
            prisma.verificationCode.findFirst.mockResolvedValue(null);

            await expect(
                service.verifyPhoneAndGrantBonus('u-1', '+79990000000', '0000'),
            ).rejects.toMatchObject({ status: 400 });
        });
    });
});
