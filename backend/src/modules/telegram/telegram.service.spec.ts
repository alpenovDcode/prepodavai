import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HtmlExportService } from '../../common/services/html-export.service';
import { EmailService } from '../../common/services/email.service';
import { FilesService } from '../files/files.service';
import { AnalyticsEventsService } from '../analytics-events/analytics-events.service';
import { SmartLinkTokensService } from '../smart-links/smart-link-tokens.service';
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
    callbackQuery: jest.fn().mockReturnThis(),
    use: jest.fn().mockReturnThis(),
    catch: jest.fn().mockReturnThis(),
    init: jest.fn().mockResolvedValue(undefined),
    api: {
      getChatMember: jest.fn().mockResolvedValue({ status: 'member' }),
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
    answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn(async (msg: string) => { replies.push(msg); }),
    _replies: replies,
  };
}

describe('TelegramService', () => {
  let service: TelegramService;
  let mockPrisma: any;
  let mockEmail: any;

  beforeEach(async () => {
    mockPrisma = {
      appUser: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'user-1', username: 'testuser' }),
        update: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({ id: "shadow-1" }),
      },
      botUser: { create: jest.fn().mockResolvedValue({}), upsert: jest.fn().mockResolvedValue({}) },
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

    mockEmail = { sendWelcomeEmail: jest.fn().mockResolvedValue(undefined) };

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
        { provide: EmailService, useValue: mockEmail },
        { provide: FilesService, useValue: {} },
        { provide: AnalyticsEventsService, useValue: { track: jest.fn().mockResolvedValue(undefined) } },
        { provide: SmartLinkTokensService, useValue: {} },
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

    it('completes registration directly after a valid email', async () => {
      mockPrisma.appUser.findFirst.mockResolvedValue(null);
      const ctx = makeMockCtx();
      await (service as any).handleEmailInput(ctx, telegramId, state, 'valid@example.com');
      expect(state.email).toBe('valid@example.com');
      expect(mockPrisma.appUser.create).toHaveBeenCalled();
      expect((service as any).regStates.has(telegramId)).toBe(false);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Спасибо за регистрацию'),
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

  // Email-only onboarding replaced the removed phone/SMS flow.
  describe('email registration safety', () => {
    const telegramId = '123456789';

    it('ignores parallel registration while locked', async () => {
      await (service as any).handleEmailInput(makeMockCtx(), telegramId,
        { step: 'awaiting_email', locked: true }, 'test@example.com');
      expect(mockPrisma.appUser.create).not.toHaveBeenCalled();
    });

    it('unlocks the session after database failure so registration can be retried', async () => {
      mockPrisma.$transaction.mockRejectedValueOnce(new Error('DB unavailable'));
      const state = { step: 'awaiting_email', locked: false };
      const ctx = makeMockCtx();
      await (service as any).handleEmailInput(ctx, telegramId, state, 'test@example.com');
      expect(state.locked).toBe(false);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Внутренняя ошибка'));
      expect(mockEmail.sendWelcomeEmail).not.toHaveBeenCalled();
    });

    it.each(['email', 'telegram'])('rejects a concurrent duplicate %s before creating an account', async (duplicate) => {
      if (duplicate === 'email') mockPrisma.appUser.findFirst.mockResolvedValue({ id: 'other' });
      else mockPrisma.appUser.findUnique.mockResolvedValue({ id: 'other' });
      const ctx = makeMockCtx();
      (service as any).regStates.set(telegramId, { step: 'awaiting_email' });
      await (service as any).completeRegistration(ctx, telegramId, { email: 'test@example.com' });
      expect(mockPrisma.appUser.create).not.toHaveBeenCalled();
      expect((service as any).regStates.has(telegramId)).toBe(false);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('уже существует'));
    });

    it('stores only a bcrypt password hash and delivers the matching password via mocked email', async () => {
      await (service as any).handleEmailInput(makeMockCtx(), telegramId,
        { step: 'awaiting_email' }, 'test@example.com');
      const data = mockPrisma.appUser.create.mock.calls[0][0].data;
      const [username, password, email] = mockEmail.sendWelcomeEmail.mock.calls[0];
      expect(data).not.toHaveProperty('password');
      expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(await bcrypt.compare(password, data.passwordHash)).toBe(true);
      expect(email).toBe('test@example.com');
      expect(username).toBe(data.username);
      expect(data).toMatchObject({ telegramId, telegramChatId: telegramId, source: 'telegram_bot' });
      expect(mockPrisma.botUser.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ registrationStatus: 'registered', appUserId: 'user-1' }),
      }));
    });

    it('creates a starter subscription with 100 credits', async () => {
      await (service as any).completeRegistration(makeMockCtx(), telegramId, { email: 'test@example.com' });
      expect(mockPrisma.userSubscription.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        userId: 'user-1', planId: 'plan-1', status: 'active', creditsBalance: 100,
      }) });
    });

    it('does not create a subscription if the starter plan is absent', async () => {
      mockPrisma.subscriptionPlan.findUnique.mockResolvedValue(null);
      await (service as any).completeRegistration(makeMockCtx(), telegramId, { email: 'test@example.com' });
      expect(mockPrisma.appUser.create).toHaveBeenCalled();
      expect(mockPrisma.userSubscription.create).not.toHaveBeenCalled();
    });

    it('still supplies login details in chat when welcome email fails', async () => {
      mockEmail.sendWelcomeEmail.mockRejectedValueOnce(new Error('Mail unavailable'));
      const ctx = makeMockCtx();
      await (service as any).completeRegistration(ctx, telegramId, { email: 'test@example.com' });
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Спасибо за регистрацию'), expect.anything());
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
    it('shows the subscription activation flow on /start', async () => {
      const ctx = makeMockCtx();
      await (service as any).bot._commandHandlers.start(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('рада вас видеть'), expect.anything());
      expect(ctx.reply).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        reply_markup: expect.objectContaining({ inline_keyboard: expect.any(Array) }),
      }));
      expect(mockPrisma.appUser.create).not.toHaveBeenCalled();
    });

    it('new user without registration sees welcome registration message', async () => {
      const telegramId = '999999999';
      const regStates = (service as any).regStates;
      const ctx = makeMockCtx({ fromId: 999999999 });

      await (service as any).startRegistration(ctx, telegramId);

      expect(regStates.get(telegramId)).toMatchObject({ step: 'awaiting_email' });
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Введите вашу электронную почту'),
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

  describe('channel subscription checks', () => {
    it.each(['member', 'administrator', 'creator'])('accepts %s membership', async (status) => {
      (service as any).bot.api.getChatMember.mockResolvedValueOnce({ status });
      expect(await (service as any).checkChannelSubscription('channel-test', '123456789')).toBe(true);
    });

    it.each(['left', 'kicked', 'restricted'])('rejects %s membership', async (status) => {
      (service as any).bot.api.getChatMember.mockResolvedValueOnce({ status });
      expect(await (service as any).checkChannelSubscription('channel-test', '123456789')).toBe(false);
    });

    it('denies access when Telegram membership lookup fails', async () => {
      (service as any).bot.api.getChatMember.mockRejectedValueOnce(new Error('API unavailable'));
      expect(await (service as any).checkChannelSubscription('channel-test', '123456789')).toBe(false);
    });

    it('does not create a shadow account for an unsubscribed user', async () => {
      const config = (service as any).configService;
      config.get.mockImplementation((key: string) => key === 'TELEGRAM_CHANNEL_ID' ? 'channel-test' : null);
      (service as any).bot.api.getChatMember.mockResolvedValueOnce({ status: 'left' });
      const ctx = makeMockCtx();
      await (service as any).handleDefaultSubscriptionCheck(ctx, '123456789');
      expect(mockPrisma.appUser.upsert).not.toHaveBeenCalled();
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(expect.objectContaining({ text: 'Подписка не найдена' }));
    });

    it('creates a shadow account and opens the app for a subscribed user', async () => {
      const ctx = makeMockCtx();
      await (service as any).handleDefaultSubscriptionCheck(ctx, '123456789');
      expect(mockPrisma.appUser.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { telegramId: '123456789' },
        create: expect.objectContaining({ telegramId: '123456789', telegramChatId: '123456789' }),
      }));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Откройте сервис'), expect.anything());
    });
  });
});
