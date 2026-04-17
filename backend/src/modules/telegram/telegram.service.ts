import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Bot, Context, InputFile } from 'grammy';
import axios from 'axios';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { HtmlExportService } from '../../common/services/html-export.service';
import { SmscService } from '../smsc/smsc.service';

// ── Типы состояний диалога регистрации ──────────────────────────────────────
type RegStep = 'awaiting_email' | 'awaiting_phone' | 'awaiting_sms_code';

interface RegistrationState {
  step: RegStep;
  email?: string;
  phone?: string;
  // Сохраняем не сам SMS-код, а его bcrypt-хэш — чтобы не светить plaintext в памяти
  smsCodeHash?: string;
  smsCodeExpiresAt?: number;   // unix ms
  // Rate-limit: счётчик неверных попыток ввода кода
  wrongAttempts?: number;
  // Rate-limit: когда последний раз отправляли SMS
  smsSentAt?: number;          // unix ms
  // Идемпотентность: блокируем повторную отправку в рамках одного шага
  locked?: boolean;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Bot;

  /**
   * Состояния регистрации в памяти.
   * Ключ — строковый telegramId.
   * Очищается после успешной/отменённой регистрации.
   * При рестарте сервиса — сбрасывается (это нормально: пользователь просто
   * начнёт /start заново).
   */
  private readonly regStates = new Map<string, RegistrationState>();

  // ── Константы безопасности ────────────────────────────────────────────────
  /** Максимум неверных попыток ввода SMS-кода до сброса сессии */
  private static readonly MAX_WRONG_ATTEMPTS = 3;
  /** Минимальный интервал между повторными отправками SMS (60 с) */
  private static readonly SMS_RESEND_COOLDOWN_MS = 60_000;
  /** TTL SMS-кода (5 минут) */
  private static readonly SMS_CODE_TTL_MS = 5 * 60_000;
  /** Максимальное число активных незавершённых сессий регистрации (DoS protection) */
  private static readonly MAX_CONCURRENT_SESSIONS = 500;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private readonly htmlExportService: HtmlExportService,
    private readonly smscService: SmscService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (token) {
      this.bot = new Bot(token);
      this.setupHandlers();
    } else {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not set. Telegram bot will not work.');
    }
  }

  /**
   * Обработка входящего обновления от Telegram (webhook mode).
   * Вызывается из TelegramController при каждом POST от Telegram.
   */
  async handleWebhook(body: any) {
    if (!this.bot) return;
    try {
      await this.bot.handleUpdate(body);
    } catch (error) {
      this.logger.error('Error handling Telegram update:', error);
    }
  }

  /**
   * Регистрация вебхука в Telegram API.
   * Вызывается вручную через GET /api/webhook/telegram/setup?url=...
   */
  async setupWebhook(url: string) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    }

    this.logger.log(`Registering Telegram webhook at: ${url}`);

    try {
      const response = await axios.post(
        `https://api.telegram.org/bot${token}/setWebhook`,
        { url, allowed_updates: ['message', 'callback_query'] },
      );
      this.logger.log(`setWebhook response: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error: any) {
      const errorData = error?.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;
      this.logger.error(`Failed to set Telegram webhook: ${errorData}`);
      throw new Error(`Failed to set webhook: ${errorData}`);
    }
  }

  /**
   * Настройка обработчиков бота
   */
  private setupHandlers() {
    // ── /start ──────────────────────────────────────────────────────────────
    this.bot.command('start', async (ctx: Context) => {
      const user = ctx.from;
      if (!user) return;

      const telegramId = user.id.toString();

      // 1. link_XXXXXXXX payload — привязка существующего web-аккаунта
      const payload = ctx.match as string | undefined;
      if (payload && payload.startsWith('link_')) {
        const token = payload.slice(5);
        await this.handleLinkToken(ctx, user, token);
        return;
      }

      // 2. Уже зарегистрирован — приветствие + кнопка TMA
      const existingUser = await this.prisma.appUser.findUnique({
        where: { telegramId },
      });

      if (existingUser) {
        await this.prisma.appUser.update({
          where: { id: existingUser.id },
          data: {
            lastAccessAt: new Date(),
            chatId: ctx.chat.id.toString(),
            telegramChatId: ctx.chat.id.toString(),
            firstName: user.first_name || existingUser.firstName,
            lastName: user.last_name || existingUser.lastName,
            username: user.username || existingUser.username,
          } as any,
        });
        // Сбрасываем незавершённую сессию регистрации, если вдруг была
        this.regStates.delete(telegramId);
        await this.sendWelcomeWithWebApp(ctx, existingUser);
        return;
      }

      // 3. Новый пользователь — начинаем регистрацию
      await this.startRegistration(ctx, telegramId);
    });

    // ── /cancel — отмена регистрации ────────────────────────────────────────
    this.bot.command('cancel', async (ctx: Context) => {
      const telegramId = ctx.from?.id.toString();
      if (!telegramId) return;
      if (this.regStates.has(telegramId)) {
        this.regStates.delete(telegramId);
        await ctx.reply('❌ Регистрация отменена. Чтобы начать заново, отправьте /start.');
      } else {
        await ctx.reply('Нет активного процесса регистрации.');
      }
    });

    // ── Текстовые сообщения — шаги регистрации ──────────────────────────────
    this.bot.on('message:text', async (ctx: Context) => {
      const user = ctx.from;
      if (!user) return;
      const telegramId = user.id.toString();
      const state = this.regStates.get(telegramId);

      // Нет активной сессии — игнорируем (не засоряем чат)
      if (!state) return;

      const text = (ctx.message as any)?.text?.trim() ?? '';

      switch (state.step) {
        case 'awaiting_email':
          await this.handleEmailInput(ctx, telegramId, state, text);
          break;
        case 'awaiting_phone':
          await this.handlePhoneInput(ctx, telegramId, state, text);
          break;
        case 'awaiting_sms_code':
          await this.handleSmsCodeInput(ctx, telegramId, state, text);
          break;
      }
    });
  }

  // ── Шаг 0: начало регистрации ────────────────────────────────────────────
  private async startRegistration(ctx: Context, telegramId: string) {
    // DoS protection: не более MAX_CONCURRENT_SESSIONS незавершённых сессий
    if (this.regStates.size >= TelegramService.MAX_CONCURRENT_SESSIONS) {
      this.logger.warn(`[RegBot] Too many concurrent sessions (${this.regStates.size}), rejecting ${telegramId}`);
      await ctx.reply('⚠️ Сервис временно недоступен. Попробуйте позже.');
      return;
    }

    this.regStates.set(telegramId, { step: 'awaiting_email', wrongAttempts: 0 });

    await ctx.reply(
      `👋 Добро пожаловать в *PrepodavAI*!\n\n` +
      `Давайте создадим ваш аккаунт — это займёт меньше минуты.\n\n` +
      `*Шаг 1 из 3* — Введите вашу электронную почту:`,
      { parse_mode: 'Markdown' },
    );
  }

  // ── Шаг 1: email ─────────────────────────────────────────────────────────
  private async handleEmailInput(
    ctx: Context,
    telegramId: string,
    state: RegistrationState,
    text: string,
  ) {
    // Валидация формата email — строгий regex
    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(text) || text.length > 254) {
      await ctx.reply(
        '❌ Некорректный формат email.\n\nПожалуйста, введите действительный адрес электронной почты, например: *ivan@example.com*',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    const email = text.toLowerCase();

    // Проверяем, не занят ли email
    const exists = await this.prisma.appUser.findFirst({ where: { email } });
    if (exists) {
      await ctx.reply(
        `⚠️ Этот email уже зарегистрирован.\n\nЕсли это ваш аккаунт — войдите на сайте и привяжите Telegram в настройках профиля.`,
      );
      // Не сбрасываем сессию — даём попробовать другой email
      return;
    }

    state.email = email;
    state.step = 'awaiting_phone';
    this.regStates.set(telegramId, state);

    await ctx.reply(
      `✅ Email принят.\n\n` +
      `*Шаг 2 из 3* — Введите номер телефона в международном формате:\n\n` +
      `Например: *+79991234567*\n\n` +
      `_Отправим SMS с кодом подтверждения_`,
      { parse_mode: 'Markdown' },
    );
  }

  // ── Шаг 2: телефон + отправка SMS ────────────────────────────────────────
  private async handlePhoneInput(
    ctx: Context,
    telegramId: string,
    state: RegistrationState,
    text: string,
  ) {
    // Нормализуем и валидируем номер
    const phone = text.replace(/[\s\-\(\)]/g, '');
    const phoneRegex = /^\+[1-9]\d{7,14}$/;
    if (!phoneRegex.test(phone)) {
      await ctx.reply(
        '❌ Некорректный формат номера.\n\nВведите номер с кодом страны, например: *+79991234567*',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    // Проверяем, не занят ли номер
    const exists = await this.prisma.appUser.findFirst({ where: { phone } });
    if (exists) {
      await ctx.reply(
        `⚠️ Этот номер телефона уже зарегистрирован.\n\nЕсли это ваш аккаунт — войдите на сайте и привяжите Telegram в настройках профиля.`,
      );
      return;
    }

    // Rate-limit: не более 1 SMS в 60 секунд
    const now = Date.now();
    if (state.smsSentAt && now - state.smsSentAt < TelegramService.SMS_RESEND_COOLDOWN_MS) {
      const secondsLeft = Math.ceil(
        (TelegramService.SMS_RESEND_COOLDOWN_MS - (now - state.smsSentAt)) / 1000,
      );
      await ctx.reply(`⏳ Подождите ${secondsLeft} секунд перед повторной отправкой SMS.`);
      return;
    }

    // Блокируем параллельные запросы (locked на время отправки)
    if (state.locked) return;
    state.locked = true;

    try {
      // Генерируем криптографически случайный 6-значный код
      const codeRaw = crypto.randomInt(100_000, 999_999).toString();

      // Хэшируем код перед хранением в памяти
      const codeHash = await bcrypt.hash(codeRaw, 10);

      const sent = await this.smscService.sendSms(
        phone,
        `PrepodavAI: ваш код подтверждения ${codeRaw}. Никому не сообщайте этот код.`,
      );

      if (!sent) {
        await ctx.reply('❌ Не удалось отправить SMS. Проверьте номер и попробуйте снова.');
        state.locked = false;
        return;
      }

      state.phone = phone;
      state.step = 'awaiting_sms_code';
      state.smsCodeHash = codeHash;
      state.smsCodeExpiresAt = now + TelegramService.SMS_CODE_TTL_MS;
      state.smsSentAt = now;
      state.wrongAttempts = 0;
      state.locked = false;
      this.regStates.set(telegramId, state);

      const maskedPhone = phone.slice(0, -4).replace(/\d/g, '•') + phone.slice(-4);
      await ctx.reply(
        `📱 SMS отправлено на *${maskedPhone}*\n\n` +
        `*Шаг 3 из 3* — Введите 6-значный код из SMS:\n\n` +
        `_Код действителен 5 минут. Для отмены — /cancel_`,
        { parse_mode: 'Markdown' },
      );
    } catch (err) {
      state.locked = false;
      this.logger.error(`[RegBot] SMS send error for ${telegramId}:`, err);
      await ctx.reply('❌ Внутренняя ошибка. Попробуйте позже.');
    }
  }

  // ── Шаг 3: проверка SMS-кода и создание аккаунта ─────────────────────────
  private async handleSmsCodeInput(
    ctx: Context,
    telegramId: string,
    state: RegistrationState,
    text: string,
  ) {
    // Принимаем только цифры
    if (!/^\d{4,6}$/.test(text)) {
      await ctx.reply('❌ Код должен состоять из 6 цифр. Попробуйте ещё раз.');
      return;
    }

    // Проверяем TTL кода
    if (!state.smsCodeExpiresAt || Date.now() > state.smsCodeExpiresAt) {
      this.regStates.delete(telegramId);
      await ctx.reply(
        '⏰ Срок действия кода истёк.\n\nНачните регистрацию заново: /start',
      );
      return;
    }

    // Предотвращаем параллельные попытки (timing attack protection)
    if (state.locked) return;
    state.locked = true;

    try {
      const isValid = await bcrypt.compare(text, state.smsCodeHash!);

      if (!isValid) {
        state.wrongAttempts = (state.wrongAttempts ?? 0) + 1;
        state.locked = false;
        this.regStates.set(telegramId, state);

        const attemptsLeft = TelegramService.MAX_WRONG_ATTEMPTS - state.wrongAttempts;

        if (attemptsLeft <= 0) {
          // Исчерпаны попытки — сбрасываем всю сессию
          this.regStates.delete(telegramId);
          this.logger.warn(`[RegBot] Too many wrong SMS attempts for telegramId=${telegramId}`);
          await ctx.reply(
            '🚫 Слишком много неверных попыток.\n\nРегистрация отменена. Начните заново: /start',
          );
        } else {
          await ctx.reply(`❌ Неверный код. Осталось попыток: *${attemptsLeft}*`, { parse_mode: 'Markdown' });
        }
        return;
      }

      // Код верный — создаём аккаунт
      await this.completeRegistration(ctx, telegramId, state);
    } catch (err) {
      state.locked = false;
      this.logger.error(`[RegBot] Code verify error for ${telegramId}:`, err);
      await ctx.reply('❌ Внутренняя ошибка. Попробуйте позже.');
    }
  }

  // ── Финал: создание AppUser + отправка учётных данных ────────────────────
  private async completeRegistration(
    ctx: Context,
    telegramId: string,
    state: RegistrationState,
  ) {
    const user = ctx.from!;

    // Финальная проверка уникальности (race condition protection)
    const [emailTaken, phoneTaken, tgTaken] = await Promise.all([
      this.prisma.appUser.findFirst({ where: { email: state.email } }),
      this.prisma.appUser.findFirst({ where: { phone: state.phone } }),
      this.prisma.appUser.findUnique({ where: { telegramId } }),
    ]);

    if (emailTaken || phoneTaken || tgTaken) {
      this.regStates.delete(telegramId);
      await ctx.reply(
        '⚠️ Аккаунт с такими данными уже существует.\n\nЕсли это ваш аккаунт — войдите на сайте.',
      );
      return;
    }

    // Генерируем безопасный пароль: 12 символов, буквы + цифры
    const password = crypto.randomBytes(9).toString('base64').slice(0, 12).replace(/[^a-zA-Z0-9]/g, 'x');
    const passwordHash = await bcrypt.hash(password, 12);

    // Генерируем уникальный username на основе Telegram username или first_name
    const baseUsername = user.username
      ? user.username.toLowerCase().replace(/[^a-z0-9_]/g, '')
      : `user${telegramId}`;
    const username = await this.ensureUniqueUsername(baseUsername);

    const pwdChars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const apiKey = Array.from(crypto.randomBytes(8)).map((b: number) => pwdChars[b % pwdChars.length]).join('');
    const chatId = ctx.chat!.id.toString();

    // Создаём пользователя + подписку в одной транзакции
    const newUser = await this.prisma.$transaction(async (tx) => {
      const appUser = await tx.appUser.create({
        data: {
          username,
          userHash: username,
          email: state.email,
          phone: state.phone,
          phoneVerified: true,        // телефон подтверждён SMS-кодом
          passwordHash,
          apiKey,
          telegramId,
          chatId,
          telegramChatId: chatId,
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          source: 'telegram_bot',     // ← когорта для аналитики
          lastAccessAt: new Date(),
          lastTelegramAppAccess: new Date(),
        } as any,
      });

      // Создаём стартовую подписку
      const starterPlan = await tx.subscriptionPlan.findUnique({
        where: { planKey: 'starter' },
      });

      if (starterPlan) {
        const now = new Date();
        const endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 1);

        await tx.userSubscription.create({
          data: {
            userId: appUser.id,
            planId: starterPlan.id,
            status: 'active',
            creditsBalance: 100,
            extraCredits: 0,
            creditsUsed: 0,
            overageCreditsUsed: 0,
            startDate: now,
            endDate,
            autoRenew: true,
          },
        });
      }

      return appUser;
    });

    // Удаляем сессию регистрации
    this.regStates.delete(telegramId);

    this.logger.log(`[RegBot] New user registered via bot: id=${newUser.id} username=${username}`);

    const webAppUrl = this.configService.get<string>('WEBAPP_URL', 'https://prepodavai.ru');

    // Отправляем учётные данные — в одном сообщении, без лишних деталей
    await ctx.reply(
      `🎉 *Регистрация завершена!*\n\n` +
      `Ваши данные для входа на сайте:\n\n` +
      `👤 Логин: \`${username}\`\n` +
      `🔑 Пароль: \`${password}\`\n\n` +
      `⚠️ *Сохраните пароль* — он больше не будет показан.\n\n` +
      `Нажмите кнопку ниже, чтобы открыть PrepodavAI:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Открыть PrepodavAI', web_app: { url: `${webAppUrl}/dashboard` } }],
            [{ text: '🌐 Войти на сайте', url: `${webAppUrl}/auth` }],
          ],
        },
      },
    );
  }

  /**
   * Генерация уникального username: если базовый занят — добавляем случайный суффикс.
   */
  private async ensureUniqueUsername(base: string): Promise<string> {
    // Ограничиваем длину
    const trimmed = base.slice(0, 20) || 'user';
    const exists = await this.prisma.appUser.findFirst({ where: { username: trimmed } });
    if (!exists) return trimmed;

    // Добавляем 4 случайные цифры
    const suffix = crypto.randomInt(1000, 9999).toString();
    const candidate = `${trimmed}_${suffix}`.slice(0, 25);
    // Рекурсивно (практически всегда срабатывает с первого раза)
    const exists2 = await this.prisma.appUser.findFirst({ where: { username: candidate } });
    return exists2
      ? `${trimmed}_${crypto.randomInt(10_000, 99_999)}`
      : candidate;
  }

  /**
   * Подтверждение привязки Telegram по токену
   */
  private async handleLinkToken(ctx: Context, user: any, token: string) {
    const linkToken = await this.prisma.linkToken.findUnique({ where: { token } });

    if (!linkToken || linkToken.platform !== 'telegram') {
      await ctx.reply('❌ Токен привязки не найден. Попробуйте сгенерировать новый в настройках профиля.');
      return;
    }

    if (linkToken.status !== 'pending') {
      await ctx.reply('⚠️ Этот токен уже использован или истёк. Сгенерируйте новый в настройках профиля.');
      return;
    }

    if (new Date() > linkToken.expiresAt) {
      await this.prisma.linkToken.update({ where: { id: linkToken.id }, data: { status: 'expired' } });
      await ctx.reply('⏰ Токен истёк. Пожалуйста, сгенерируйте новый в настройках профиля.');
      return;
    }

    // Check if this Telegram account is already linked to another user
    const alreadyLinked = await this.prisma.appUser.findUnique({
      where: { telegramId: user.id.toString() },
    });
    if (alreadyLinked && alreadyLinked.id !== linkToken.userId) {
      await ctx.reply('⚠️ Этот аккаунт Telegram уже привязан к другому профилю PrepodavAI.');
      return;
    }

    // Читаем текущие данные пользователя, чтобы не затереть уже заполненные поля
    const webUser = await this.prisma.appUser.findUnique({ where: { id: linkToken.userId } });
    if (!webUser) {
      await ctx.reply('❌ Аккаунт не найден. Попробуйте позже.');
      return;
    }

    const platformName = user.username ? `@${user.username}` : user.first_name || `id${user.id}`;

    // Link the platform and mark token as completed
    const telegramChatId = ctx.chat.id.toString();
    await this.prisma.$transaction([
      this.prisma.appUser.update({
        where: { id: linkToken.userId },
        data: {
          telegramId: user.id.toString(),
          telegramChatId,
          chatId: telegramChatId, // backward compat
          // Не перезаписываем username — он используется для входа на сайте
          // Заполняем firstName/lastName только если ещё не заданы
          ...(webUser.firstName ? {} : { firstName: user.first_name || undefined }),
          ...(webUser.lastName ? {} : { lastName: user.last_name || undefined }),
        } as any,
      }),
      this.prisma.linkToken.update({
        where: { id: linkToken.id },
        data: { status: 'completed', linkedId: user.id.toString(), linkedName: platformName },
      }),
    ]);

    await ctx.reply(
      `✅ Telegram успешно привязан к вашему аккаунту PrepodavAI!\n\n` +
      `Теперь вы будете получать результаты генерации прямо здесь.`,
    );
  }

  /**
   * Broadcast сообщение от администратора конкретному пользователю
   */
  async sendBroadcastMessage(chatId: string, text: string): Promise<void> {
    await this.bot.api.sendMessage(chatId, `📢 *Сообщение от администратора*\n\n${text}`, {
      parse_mode: 'Markdown',
    });
  }

  /**
   * Отправка результата генерации в Telegram
   */
  async sendGenerationResult(params: {
    userId: string;
    generationType: string;
    result: any;
    generationRequestId: string;
  }): Promise<{ success: boolean; message?: string }> {
    const { userId, generationType, result } = params;

    // Находим пользователя
    const appUser = await this.prisma.appUser.findUnique({
      where: { id: userId },
    }) as any;

    if (!appUser || !appUser.telegramId) {
      return { success: false, message: 'Telegram not linked for this user' };
    }

    // telegramChatId — основной, chatId — fallback для старых пользователей
    const chatId = appUser.telegramChatId || (appUser.source === 'telegram' ? appUser.chatId : null);
    if (!chatId) {
      return { success: false, message: 'No Telegram chatId available' };
    }

    // Skip for dummy test user
    if (chatId === '123456789') {
      console.log('[Telegram] Skipping send for test user (dummy chatId)');
      return { success: true, message: 'Skipped for test user' };
    }

    try {
      // Отправляем в зависимости от типа генерации
      if (generationType === 'image' || generationType === 'photosession') {
        await this.sendImage(chatId, result);
      } else if (generationType === 'presentation') {
        await this.sendPresentation(chatId, result);
      } else {
        await this.sendTextResult(chatId, generationType, result);
      }

      return { success: true, message: 'Result sent successfully' };
    } catch (error) {
      console.error('Error sending to Telegram:', error);
      return { success: false, message: String(error) };
    }
  }

  /**
   * Отправка изображения
   */
  private async sendImage(chatId: string, result: any) {
    const imageUrl = result?.imageUrl;
    if (!imageUrl) return;

    const messageText = `✅ Ваше изображение готово!${
      result?.prompt ? `\n\n📝 Промпт: ${result.prompt}` : ''
    }${result?.style ? `\n🎨 Стиль: ${result.style}` : ''}`;

    try {
      let photo: string | InputFile = imageUrl;

      // Если это data URL (base64), конвертируем в Buffer
      if (typeof imageUrl === 'string' && imageUrl.startsWith('data:image')) {
        const base64Data = imageUrl.split(',')[1];
        if (base64Data) {
          const buffer = Buffer.from(base64Data, 'base64');
          photo = new InputFile(buffer, 'image.jpg');
        }
      }
      // Если это внешний URL (например, от Replicate), скачиваем его
      else if (
        typeof imageUrl === 'string' &&
        (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))
      ) {
        try {
          const axios = (await import('axios')).default;
          const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
          const buffer = Buffer.from(response.data);
          photo = new InputFile(buffer, 'image.png');
        } catch (downloadError) {
          console.error('Error downloading image:', downloadError);
          // Fallback: try sending URL directly
          photo = imageUrl;
        }
      }

      await this.bot.api.sendPhoto(chatId, photo, {
        caption: messageText,
      });
    } catch (error) {
      console.error('Error sending photo to Telegram:', error);
      await this.bot.api.sendMessage(
        chatId,
        `⚠️ Не удалось отправить изображение в Telegram, но оно доступно в истории.\n\n${messageText}`,
      );
    }
  }

  /**
   * Отправка презентации
   */
  private async sendPresentation(chatId: string, result: any) {
    const exportUrl = result.exportUrl || result.pdfUrl || result.pptxUrl;

    if (!exportUrl) {
      // Check if we have raw presentation data (Replicate)
      if (result.presentation) {
        const message = `✅ Ваша презентация готова!${
          result.inputText ? `\n\n📌 Тема: ${result.inputText}` : ''
        }\n\n🌐 Просмотр доступен в веб-версии: https://prrv.pro`;
        await this.bot.api.sendMessage(chatId, message);
        return;
      }

      // Если нет файла для скачивания, отправляем только ссылку на Gamma
      const message = `✅ Ваша презентация готова!${
        result.inputText ? `\n\n📌 Тема: ${result.inputText}` : ''
      }${result.gammaUrl ? `\n\n🔗 [Открыть в Gamma](${result.gammaUrl})` : ''}`;

      await this.bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      return;
    }

    try {
      // Определяем тип файла по URL
      const isPptx =
        exportUrl.toLowerCase().includes('.pptx') || exportUrl.toLowerCase().includes('pptx');
      const fileExtension = isPptx ? 'pptx' : 'pdf';
      const fileType = isPptx ? 'PPTX' : 'PDF';
      const filename = `presentation_${Date.now()}.${fileExtension}`;

      // Скачиваем файл
      const axios = (await import('axios')).default;
      const response = await axios.get(exportUrl, { responseType: 'arraybuffer' });
      const fileBuffer = Buffer.from(response.data);

      // Отправляем файл в Telegram
      await this.bot.api.sendDocument(chatId, new InputFile(fileBuffer, filename), {
        caption: `✅ Ваша презентация готова (${fileType})!${
          result.inputText ? `\n\n📌 Тема: ${result.inputText}` : ''
        }${result.gammaUrl ? `\n\n🔗 [Открыть в Gamma](${result.gammaUrl})` : ''}`,
        parse_mode: 'Markdown',
      });
    } catch (error) {
      console.error('Error downloading/sending presentation file:', error);
      // Fallback: отправляем только ссылку
      const message = `✅ Ваша презентация готова!${
        result.inputText ? `\n\n📌 Тема: ${result.inputText}` : ''
      }${
        result.gammaUrl ? `\n\n🔗 [Открыть в Gamma](${result.gammaUrl})` : ''
      }${exportUrl ? `\n\n📥 [Скачать файл](${exportUrl})` : ''}`;

      await this.bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }
  }

  /**
   * Отправка текстового результата
   */
  private async sendTextResult(chatId: string, generationType: string, result: any) {
    console.log(`[Telegram] sendTextResult called for ${generationType}, chatId: ${chatId}`);
    const content = result?.content || result;
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

    const htmlPayload = this.extractHtmlPayload(text);
    const filename = `${generationType}_${new Date().toISOString().split('T')[0]}_${Date.now()}.pdf`;

    try {
      console.log(`[Telegram] Generating PDF for ${generationType}, text length: ${text.length}`);
      const htmlContent = htmlPayload.isHtml ? htmlPayload.html : this.wrapPlainTextAsHtml(text);
      console.log(`[Telegram] HTML content prepared, length: ${htmlContent.length}`);

      const pdfBuffer = await this.htmlExportService.htmlToPdf(htmlContent);
      console.log(`[Telegram] PDF generated successfully, size: ${pdfBuffer.length} bytes`);

      await this.bot.api.sendDocument(chatId, new InputFile(pdfBuffer, filename), {
        caption: '✅ Ваш материал готов! Мы прикрепили его в формате PDF.',
      });
      return;
    } catch (error) {
      console.error(`[Telegram] Failed to render PDF for ${generationType}:`, error);
      // Fallback удален по требованию: отправляем только PDF или ошибку (в логах)
    }

    // Если PDF не сгенерировался — не слать raw HTML, только дружественное сообщение
    await this.bot.api.sendMessage(
      chatId,
      `✅ Ваш материал готов!\n\nПросмотр доступен в веб-версии PrepodavAI.`,
    );
  }

  private looksLikeHtml(value: string) {
    if (!value) return false;
    const trimmed = value.trim();
    return (
      /<!DOCTYPE html/i.test(trimmed) || /<html[\s>]/i.test(trimmed) || /<body[\s>]/i.test(trimmed)
    );
  }

  private extractHtmlPayload(value: string): { isHtml: boolean; html: string } {
    if (!value) {
      return { isHtml: false, html: '' };
    }

    let processed = value.trim();

    // Убираем markdown-блоки ```html ... ```
    if (processed.startsWith('```')) {
      processed = processed
        .replace(/^```(?:html)?/i, '')
        .replace(/```$/, '')
        .trim();
    }

    // Иногда ответ окружён кавычками / JSON-строками
    if (
      (processed.startsWith('"') && processed.endsWith('"')) ||
      (processed.startsWith("'") && processed.endsWith("'"))
    ) {
      processed = processed.slice(1, -1);
    }

    const isHtml = this.looksLikeHtml(processed) || /<\/?[a-z][\s\S]*>/i.test(processed);
    return { isHtml, html: processed };
  }

  private wrapPlainTextAsHtml(text: string) {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n\n+/g, '</p><p>')
      .replace(/\n/g, '<br>');

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>PrepodavAI Result</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
      line-height: 1.6;
      padding: 24px;
      background: #ffffff;
      color: #1a1a1a;
    }
    p { margin: 12px 0; }
    .math-inline { font-weight: 500; }
    .math-block { margin: 16px 0; }
    pre {
      background: #f5f5f5;
      padding: 12px;
      border-radius: 8px;
      font-family: "JetBrains Mono", Consolas, monospace;
    }
  </style>
</head>
<body>
  <p>${escaped}</p>
</body>
</html>`;
  }

  /**
   * Отправка приветствия с кнопкой WebApp
   */
  private async sendWelcomeWithWebApp(ctx: Context, appUser: any) {
    const webAppUrl = this.configService.get<string>('WEBAPP_URL', 'https://prepodavai.ru');

    const message = this.getWelcomeMessage(appUser);

    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Открыть PrepodavAI',
              web_app: { url: `${webAppUrl}/dashboard` },
            },
          ],
        ],
      },
    });
  }

  /**
   * Приветственное сообщение
   */
  private getWelcomeMessage(_appUser?: any): string {
    return (
      `Добро пожаловать в prepodavAI 🎓\n\n` +
      `Я твой интеллектуальный помощник для:\n` +
      `— Создания учебных материалов\n` +
      `— Планирования уроков\n` +
      `— Проверки работ учеников\n` +
      `— Адаптации контента\n` +
      `— Методической поддержки\n\n` +
      `Нажмите кнопку ниже, чтобы начать работу!`
    );
  }
}
