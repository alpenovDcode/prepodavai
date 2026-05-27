import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HtmlExportService } from '../../common/services/html-export.service';
import { SmscService } from '../smsc/smsc.service';
import * as bcrypt from 'bcryptjs';

// Мокаем grammy чтобы не делать реальных HTTP запросов
jest.mock('grammy', () => {
  const commandHandlers = {};
  const onHandlers = {};
  const mockBot = {
    _commandHandlers: commandHandlers,
    _onHandlers: onHandlers,
    command: jest.fn().mockImplementation((cmd, fn) => {
      commandHandlers[cmd] = fn;
      return mockBot;
    }),
    on: jest.fn().mockImplementation((filter, fn) => {
      onHandlers[filter] = fn;
      return mockBot;
    }),
    use: jest.fn().mockReturnThis(),
    catch: jest.fn().mockReturnThis(),
    init: jest.fn().mockResolvedValue(undefined),
    api: {
      sendMessage: jest.fn().mockResolvedValue({}),
      sendPhoto: jest.fn().mockResolvedValue({}),
      sendDocument: jest.fn().mockResolvedValue({}),
    },
    token: 'test_token',
  };
  return {
    Bot: jest.fn().mockImplementation(() => mockBot),
    InputFile: jest.fn(),
    InlineKeyboard: class {
      text = jest.fn().mockReturnThis();
      url = jest.fn().mockReturnThis();
      row = jest.fn().mockReturnThis();
    },
    Context: jest.fn(),
  };
});

// Хелпер: создаёт mock Context объект
function makeMockCtx(overrides: Partial<{
  fromId: number;
  fromUsername: string;
  firstName: string;
  text: string;
  chatId: number;
  match: string;
}> = {}) {
  const {
    fromId = 123456789,
    fromUsername = 'testuser',
    firstName = 'Test',
    text = '',
    chatId = 123456789,
    match = '',
  } = overrides;

  const replies: string[] = [];
  return {
    from: { id: fromId, username: fromUsername, first_name: firstName },
    chat: { id: chatId },
    message: { text },
    match,
    reply: jest.fn(async (msg: string) => { replies.push(msg); }),
    _replies: replies,
  };
}

describe('TelegramService', () => {
  let service: TelegramService;
  let mockPrisma: any;
  let mockSmsc: any;

  beforeEach(async () => {
    mockPrisma = {
      appUser: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'user-1', username: 'testuser' }),
        update: jest.fn().mockResolvedValue({}),
      },
      linkToken: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      userSubscription: { create: jest.fn() },
      subscriptionPlan: { findUnique: jest.fn().mockResolvedValue({ id: 'plan-1' }) },
      $transaction: jest.fn().mockImplementation(async (cb: any) => {
        if (typeof cb === 'function') return cb(mockPrisma);
        return Promise.all(cb);
      }),
    };

    mockSmsc = { sendSms: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        { provide: ConfigService, useValue: {
          get: jest.fn((key: string) => {
            if (key === 'TELEGRAM_BOT_TOKEN') return 'test_token';
            if (key === 'WEBAPP_URL') return 'https://prepodavai.ru';
            return null;
          }),
        }},
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HtmlExportService, useValue: { normalizeIncomingHtml: jest.fn(), htmlToPdf: jest.fn() } },
        { provide: SmscService, useValue: mockSmsc },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
  });

  // ── Email validation ────────────────────────────────────────────────────────

  describe('handleEmailInput', () => {
    const telegramId = '123456789';
    let state: any;

    beforeEach(() => {
      state = { step: 'awaiting_email', wrongAttempts: 0 };
    });

    it('rejects invalid email format', async () => {
      const ctx = makeMockCtx({ text: 'not-an-email' });
      await (service as any).handleEmailInput(ctx, telegramId, state, 'not-an-email');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Некорректный формат email'),
        expect.anything(),
      );
      expect(state.step).toBe('awaiting_email'); // не перешли дальше
    });

    it('rejects email longer than 254 chars', async () => {
      const longEmail = 'a'.repeat(250) + '@x.com';
      const ctx = makeMockCtx();
      await (service as any).handleEmailInput(ctx, telegramId, state, longEmail);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Некорректный формат email'),
        expect.anything(),
      );
    });

    it('rejects already taken email', async () => {
      mockPrisma.appUser.findFirst.mockResolvedValue({ id: 'other-user' });
      const ctx = makeMockCtx();
      await (service as any).handleEmailInput(ctx, telegramId, state, 'taken@example.com');
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('уже зарегистрирован'));
      expect(state.step).toBe('awaiting_email');
    });

    it('accepts valid email and moves to awaiting_phone', async () => {
      mockPrisma.appUser.findFirst.mockResolvedValue(null);
      const ctx = makeMockCtx();
      await (service as any).handleEmailInput(ctx, telegramId, state, 'valid@example.com');
      expect(state.email).toBe('valid@example.com');
      expect(state.step).toBe('awaiting_phone');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Шаг 2 из 3'),
        expect.anything(),
      );
    });

    it('lowercases the email', async () => {
      mockPrisma.appUser.findFirst.mockResolvedValue(null);
      const ctx = makeMockCtx();
      await (service as any).handleEmailInput(ctx, telegramId, state, 'Valid@Example.COM');
      expect(state.email).toBe('valid@example.com');
    });
  });

  // ── Phone validation ────────────────────────────────────────────────────────

  describe('handlePhoneInput', () => {
    const telegramId = '123456789';
    let state: any;

    beforeEach(() => {
      state = {
        step: 'awaiting_phone',
        email: 'test@example.com',
        wrongAttempts: 0,
        locked: false,
      };
    });

    it('rejects invalid phone format', async () => {
      const ctx = makeMockCtx();
      await (service as any).handlePhoneInput(ctx, telegramId, state, '89991234567');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Некорректный формат номера'),
        expect.anything(),
      );
    });

    it('rejects phone without country code', async () => {
      const ctx = makeMockCtx();
      await (service as any).handlePhoneInput(ctx, telegramId, state, '9991234567');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Некорректный формат номера'),
        expect.anything(),
      );
    });

    it('rejects already taken phone', async () => {
      mockPrisma.appUser.findFirst.mockResolvedValue({ id: 'other-user' });
      const ctx = makeMockCtx();
      await (service as any).handlePhoneInput(ctx, telegramId, state, '+79991234567');
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('уже зарегистрирован'));
    });

    it('enforces SMS resend cooldown of 60s', async () => {
      state.smsSentAt = Date.now() - 30_000; // 30 сек назад — ещё не прошло 60
      const ctx = makeMockCtx();
      await (service as any).handlePhoneInput(ctx, telegramId, state, '+79991234567');
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Подождите'));
      expect(mockSmsc.sendSms).not.toHaveBeenCalled();
    });

    it('allows SMS after cooldown expires', async () => {
      state.smsSentAt = Date.now() - 61_000; // 61 сек назад — уже прошло
      mockPrisma.appUser.findFirst.mockResolvedValue(null);
      const ctx = makeMockCtx();
      await (service as any).handlePhoneInput(ctx, telegramId, state, '+79991234567');
      expect(mockSmsc.sendSms).toHaveBeenCalled();
    });

    it('sends SMS and moves to awaiting_sms_code on success', async () => {
      mockPrisma.appUser.findFirst.mockResolvedValue(null);
      const ctx = makeMockCtx();
      await (service as any).handlePhoneInput(ctx, telegramId, state, '+79991234567');
      expect(mockSmsc.sendSms).toHaveBeenCalledWith('+79991234567', expect.any(String));
      expect(state.step).toBe('awaiting_sms_code');
      expect(state.smsCodeHash).toBeDefined();
      expect(state.smsCodeExpiresAt).toBeGreaterThan(Date.now());
    });

    it('strips whitespace from phone number', async () => {
      mockPrisma.appUser.findFirst.mockResolvedValue(null);
      const ctx = makeMockCtx();
      await (service as any).handlePhoneInput(ctx, telegramId, state, '+7 999 123-45-67');
      expect(mockSmsc.sendSms).toHaveBeenCalledWith('+79991234567', expect.any(String));
    });

    it('handles SMS send failure gracefully', async () => {
      mockPrisma.appUser.findFirst.mockResolvedValue(null);
      mockSmsc.sendSms.mockResolvedValue(false);
      const ctx = makeMockCtx();
      await (service as any).handlePhoneInput(ctx, telegramId, state, '+79991234567');
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Не удалось отправить SMS'));
      expect(state.step).toBe('awaiting_phone'); // не перешли дальше
    });

    it('skips if locked (prevents parallel requests)', async () => {
      state.locked = true;
      const ctx = makeMockCtx();
      await (service as any).handlePhoneInput(ctx, telegramId, state, '+79991234567');
      expect(mockSmsc.sendSms).not.toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });

  // ── SMS code verification ───────────────────────────────────────────────────

  describe('handleSmsCodeInput', () => {
    const telegramId = '123456789';
    const validCode = '123456';
    let state: any;

    beforeEach(async () => {
      state = {
        step: 'awaiting_sms_code',
        email: 'test@example.com',
        phone: '+79991234567',
        smsCodeHash: await bcrypt.hash(validCode, 10),
        smsCodeExpiresAt: Date.now() + 5 * 60_000,
        wrongAttempts: 0,
        locked: false,
      };
    });

    it('rejects non-digit input', async () => {
      const ctx = makeMockCtx();
      await (service as any).handleSmsCodeInput(ctx, telegramId, state, 'abcdef');
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('из 6 цифр'));
    });

    it('rejects expired code and clears session', async () => {
      state.smsCodeExpiresAt = Date.now() - 1000; // уже истёк
      const regStates = (service as any).regStates;
      regStates.set(telegramId, state);
      const ctx = makeMockCtx({ fromId: 123456789 });
      await (service as any).handleSmsCodeInput(ctx, telegramId, state, validCode);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Срок действия кода истёк'));
      expect(regStates.has(telegramId)).toBe(false);
    });

    it('increments wrongAttempts on wrong code', async () => {
      const regStates = (service as any).regStates;
      regStates.set(telegramId, state);
      const ctx = makeMockCtx({ fromId: 123456789 });
      await (service as any).handleSmsCodeInput(ctx, telegramId, state, '000000');
      expect(state.wrongAttempts).toBe(1);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Неверный код'), expect.anything());
    });

    it('deletes session after 3 wrong attempts', async () => {
      state.wrongAttempts = 2; // ещё 1 осталось
      const regStates = (service as any).regStates;
      regStates.set(telegramId, state);
      const ctx = makeMockCtx({ fromId: 123456789 });
      await (service as any).handleSmsCodeInput(ctx, telegramId, state, '000000');
      expect(regStates.has(telegramId)).toBe(false);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Слишком много неверных попыток'));
    });

    it('skips if locked (timing attack protection)', async () => {
      state.locked = true;
      const ctx = makeMockCtx();
      await (service as any).handleSmsCodeInput(ctx, telegramId, state, validCode);
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('calls completeRegistration on correct code', async () => {
      const completeSpy = jest
        .spyOn(service as any, 'completeRegistration')
        .mockResolvedValue(undefined);
      const regStates = (service as any).regStates;
      regStates.set(telegramId, state);
      const ctx = makeMockCtx({ fromId: 123456789 });
      await (service as any).handleSmsCodeInput(ctx, telegramId, state, validCode);
      expect(completeSpy).toHaveBeenCalled();
    });
  });

  // ── Linking flow ─────────────────────────────────────────────────────────────

  describe('handleLinkToken', () => {
    const user = { id: 123456789, username: 'testuser', first_name: 'Test', last_name: '' };
    const webUser = { id: 'web-user-1', firstName: 'Web', lastName: 'User' };
    const telegramId = '123456789';

    function makeValidToken(overrides = {}) {
      return {
        id: 'token-1',
        token: 'ABC12345',
        userId: 'web-user-1',
        platform: 'telegram',
        status: 'pending',
        expiresAt: new Date(Date.now() + 10 * 60_000),
        ...overrides,
      };
    }

    it('links Telegram to web account on valid token', async () => {
      mockPrisma.linkToken.findUnique.mockResolvedValue(makeValidToken());
      mockPrisma.appUser.findUnique
        .mockResolvedValueOnce(null)   // alreadyLinked check
        .mockResolvedValueOnce(webUser); // webUser fetch
      const ctx = makeMockCtx({ fromId: 123456789 });

      await (service as any).handleLinkToken(ctx, user, 'ABC12345');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('успешно привязан'));
    });

    it('rejects token not found', async () => {
      mockPrisma.linkToken.findUnique.mockResolvedValue(null);
      const ctx = makeMockCtx({ fromId: 123456789 });
      await (service as any).handleLinkToken(ctx, user, 'BADTOKEN');
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('не найден'));
    });

    it('rejects non-telegram platform token', async () => {
      mockPrisma.linkToken.findUnique.mockResolvedValue(makeValidToken({ platform: 'max' }));
      const ctx = makeMockCtx({ fromId: 123456789 });
      await (service as any).handleLinkToken(ctx, user, 'ABC12345');
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('не найден'));
    });

    it('rejects already used token (status=completed)', async () => {
      mockPrisma.linkToken.findUnique.mockResolvedValue(makeValidToken({ status: 'completed' }));
      const ctx = makeMockCtx({ fromId: 123456789 });
      await (service as any).handleLinkToken(ctx, user, 'ABC12345');
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('уже использован'));
    });

    it('rejects expired token and updates status to expired', async () => {
      mockPrisma.linkToken.findUnique.mockResolvedValue(
        makeValidToken({ expiresAt: new Date(Date.now() - 1000) }),
      );
      const ctx = makeMockCtx({ fromId: 123456789 });
      await (service as any).handleLinkToken(ctx, user, 'ABC12345');
      expect(mockPrisma.linkToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'expired' } }),
      );
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('истёк'));
    });

    it('rejects if this Telegram is already linked to a DIFFERENT user', async () => {
      mockPrisma.linkToken.findUnique.mockResolvedValue(makeValidToken({ userId: 'web-user-1' }));
      mockPrisma.appUser.findUnique.mockResolvedValue({ id: 'other-web-user' }); // alreadyLinked
      const ctx = makeMockCtx({ fromId: 123456789 });
      await (service as any).handleLinkToken(ctx, user, 'ABC12345');
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('уже привязан к другому профилю'));
    });

    it('clears active regState after successful link', async () => {
      mockPrisma.linkToken.findUnique.mockResolvedValue(makeValidToken());
      mockPrisma.appUser.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(webUser);

      const regStates = (service as any).regStates;
      regStates.set(telegramId, { step: 'awaiting_email', wrongAttempts: 0 });

      const ctx = makeMockCtx({ fromId: 123456789 });
      await (service as any).handleLinkToken(ctx, user, 'ABC12345');

      expect(regStates.has(telegramId)).toBe(false);
    });
  });

  // ── /start command ──────────────────────────────────────────────────────────

  describe('/start command handler', () => {
    it('existing user sees welcome message and regState is cleared', async () => {
      const telegramId = '123456789';
      const existingUser = { id: 'user-1', firstName: 'Test', lastName: '', username: 'testuser' };
      mockPrisma.appUser.findUnique.mockResolvedValue(existingUser);
      mockPrisma.appUser.update.mockResolvedValue(existingUser);

      const regStates = (service as any).regStates;
      regStates.set(telegramId, { step: 'awaiting_email' });

      // Вызываем /start handler через захваченный handler (existingUser, без payload)
      const startHandler = (service as any).bot._commandHandlers['start'];
      const ctx = makeMockCtx({ fromId: 123456789 });
      await startHandler(ctx);

      expect(regStates.has(telegramId)).toBe(false); // regState очищен
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('prepodavAI'),
        expect.anything(),
      );
    });

    it('new user without registration sees welcome registration message', async () => {
      const telegramId = '999999999';
      const regStates = (service as any).regStates;
      const ctx = makeMockCtx({ fromId: 999999999 });

      await (service as any).startRegistration(ctx, telegramId);

      expect(regStates.get(telegramId)).toMatchObject({ step: 'awaiting_email' });
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Шаг 1 из 3'),
        expect.anything(),
      );
    });

    it('rejects new registration when MAX_CONCURRENT_SESSIONS reached', async () => {
      const regStates = (service as any).regStates;
      // Заполняем до лимита
      for (let i = 0; i < 500; i++) {
        regStates.set(`user_${i}`, { step: 'awaiting_email' });
      }

      const ctx = makeMockCtx({ fromId: 999999999 });
      await (service as any).startRegistration(ctx, '999999999');

      expect(regStates.has('999999999')).toBe(false);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('временно недоступен'));
    });
  });

  // ── /cancel command ─────────────────────────────────────────────────────────

  describe('/cancel command', () => {
    let cancelHandler: Function;

    beforeEach(() => {
      // Захватываем handler зарегистрированный через bot.command('cancel', fn)
      cancelHandler = (service as any).bot._commandHandlers['cancel'];
    });

    it('cancels active registration', async () => {
      const telegramId = '123456789';
      const regStates = (service as any).regStates;
      regStates.set(telegramId, { step: 'awaiting_email' });

      const ctx = makeMockCtx({ fromId: 123456789, text: '/cancel' });
      await cancelHandler(ctx);

      expect(regStates.has(telegramId)).toBe(false);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Регистрация отменена'));
    });

    it('replies "no active process" when nothing to cancel', async () => {
      const ctx = makeMockCtx({ fromId: 123456789 });
      await cancelHandler(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Нет активного процесса'));
    });
  });

  // ── Security & rate limits ──────────────────────────────────────────────────

  describe('security', () => {
    it('masks phone number in SMS confirmation message', async () => {
      const state: any = {
        email: 'test@example.com',
        step: 'awaiting_phone',
        wrongAttempts: 0,
        locked: false,
      };
      mockPrisma.appUser.findFirst.mockResolvedValue(null);
      const ctx = makeMockCtx({ fromId: 123456789 });
      await (service as any).handlePhoneInput(ctx, '123456789', state, '+79991234567');

      const replyCall = ctx.reply.mock.calls.find(
        (args: any[]) => args[0] && args[0].includes('SMS отправлено'),
      );
      expect(replyCall).toBeDefined();
      // Проверяем что в сообщении есть маскированный номер
      // +79991234567 → +•••••••4567 (последние 4 видны, остальные скрыты)
      const replyText = replyCall![0];
      expect(replyText).toContain('4567'); // последние 4 цифры видны
      expect(replyText).not.toContain('999'); // середина скрыта
    });

    it('stores SMS code as bcrypt hash (not plaintext)', async () => {
      const state: any = {
        email: 'test@example.com',
        step: 'awaiting_phone',
        wrongAttempts: 0,
        locked: false,
      };
      mockPrisma.appUser.findFirst.mockResolvedValue(null);
      const ctx = makeMockCtx({ fromId: 123456789 });
      await (service as any).handlePhoneInput(ctx, '123456789', state, '+79991234567');

      expect(state.smsCodeHash).toBeDefined();
      expect(state.smsCodeHash).not.toMatch(/^\d{6}$/); // не plaintext
      // bcrypt хэш начинается с $2b$
      expect(state.smsCodeHash).toMatch(/^\$2[aby]\$/);
    });
  });
});

// Вспомогательный метод: позволяет тестировать приватные методы TelegramService
// через прямой вызов (service as any).methodName
