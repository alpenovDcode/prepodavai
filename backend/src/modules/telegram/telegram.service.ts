import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Bot, Context, InputFile } from 'grammy';
import axios from 'axios';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { HtmlExportService } from '../../common/services/html-export.service';
import { EmailService } from '../../common/services/email.service';
import { FilesService } from '../files/files.service';
import { AnalyticsEventsService } from '../analytics-events/analytics-events.service';

// ── Типы состояний диалога регистрации ──────────────────────────────────────
type RegStep = 'awaiting_email';

interface RegistrationState {
  step: RegStep;
  email?: string;
  locked?: boolean;
}

const MINI_APP_BTN = '📱 Открыть мини-приложение';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Bot;

  private readonly regStates = new Map<string, RegistrationState>();

  private static readonly MAX_CONCURRENT_SESSIONS = 500;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private readonly htmlExportService: HtmlExportService,
    private readonly emailService: EmailService,
    private readonly filesService: FilesService,
    private readonly analyticsEvents: AnalyticsEventsService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (token) {
      this.bot = new Bot(token);
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
  // ── Шаг 0: начало регистрации ────────────────────────────────────────────
  private async startRegistration(ctx: Context, telegramId: string) {
    if (this.regStates.size >= TelegramService.MAX_CONCURRENT_SESSIONS) {
      this.logger.warn(`[RegBot] Too many concurrent sessions (${this.regStates.size}), rejecting ${telegramId}`);
      await ctx.reply('⚠️ Сервис временно недоступен. Попробуйте позже.');
      return;
    }

    this.regStates.set(telegramId, { step: 'awaiting_email' });

    await ctx.reply(
      `👋 Добро пожаловать в *ПреподаваИИ*!\n\n` +
      `Давайте создадим ваш аккаунт — это займёт меньше минуты.\n\n` +
      `Введите вашу электронную почту:`,
      { parse_mode: 'Markdown' },
    );
  }

  private async handleEmailInput(
    ctx: Context,
    telegramId: string,
    state: RegistrationState,
    text: string,
  ) {
    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(text) || text.length > 254) {
      await ctx.reply(
        '❌ Некорректный формат email.\n\nВведите действительный адрес, например: *ivan@example.com*',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    const email = text.toLowerCase();
    const exists = await this.prisma.appUser.findFirst({ where: { email } });
    if (exists) {
      await ctx.reply('⚠️ Этот email уже зарегистрирован.\n\nЕсли это ваш аккаунт — войдите на сайте и привяжите Telegram в настройках профиля.');
      return;
    }

    if (state.locked) return;
    state.locked = true;

    state.email = email;
    this.regStates.set(telegramId, state);

    try {
      await this.completeRegistration(ctx, telegramId, state);
    } catch (err) {
      state.locked = false;
      this.logger.error(`[RegBot] Registration error for ${telegramId}:`, err);
      await ctx.reply('❌ Внутренняя ошибка. Попробуйте позже.');
    }
  }

  private async completeRegistration(
    ctx: Context,
    telegramId: string,
    state: RegistrationState,
  ) {
    const user = ctx.from!;

    const [emailTaken, tgTaken] = await Promise.all([
      this.prisma.appUser.findFirst({ where: { email: state.email } }),
      this.prisma.appUser.findUnique({ where: { telegramId } }),
    ]);

    if (emailTaken || tgTaken) {
      this.regStates.delete(telegramId);
      await ctx.reply('⚠️ Аккаунт с такими данными уже существует.\n\nЕсли это ваш аккаунт — войдите на сайте.');
      return;
    }

    const password = crypto.randomBytes(9).toString('base64').slice(0, 12).replace(/[^a-zA-Z0-9]/g, 'x');
    const passwordHash = await bcrypt.hash(password, 12);

    const baseUsername = user.username
      ? user.username.toLowerCase().replace(/[^a-z0-9_]/g, '')
      : `user${telegramId}`;
    const username = await this.ensureUniqueUsername(baseUsername);

    const pwdChars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const apiKey = Array.from(crypto.randomBytes(8)).map((b: number) => pwdChars[b % pwdChars.length]).join('');
    const chatId = ctx.chat!.id.toString();

    const newUser = await this.prisma.$transaction(async (tx) => {
      const appUser = await tx.appUser.create({
        data: {
          username, userHash: username, email: state.email,
          passwordHash, apiKey, telegramId, chatId, telegramChatId: chatId,
          firstName: user.first_name || '', lastName: user.last_name || '',
          source: 'telegram_bot', lastAccessAt: new Date(), lastTelegramAppAccess: new Date(),
        } as any,
      });

      const starterPlan = await tx.subscriptionPlan.findUnique({ where: { planKey: 'starter' } });
      if (starterPlan) {
        const now = new Date();
        const endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 1);
        await tx.userSubscription.create({
          data: {
            userId: appUser.id, planId: starterPlan.id, status: 'active',
            creditsBalance: 100, extraCredits: 0, creditsUsed: 0,
            overageCreditsUsed: 0, startDate: now, endDate, autoRenew: true,
          },
        });
      }

      await (tx as any).botUser.create({
        data: {
          telegramId, appUserId: appUser.id,
          firstName: user.first_name || null, lastName: user.last_name || null,
          username: user.username || null, email: state.email,
          registrationStatus: 'registered', source: 'telegram_bot',
          lastActiveAt: new Date(),
        },
      });

      return appUser;
    });

    this.regStates.delete(telegramId);
    this.logger.log(`[RegBot] New user registered: id=${newUser.id} username=${username}`);

    // Отправляем email с данными для входа
    this.emailService.sendWelcomeEmail(username, password, state.email!).catch((err) => {
      this.logger.error(`[RegBot] Failed to send welcome email to ${state.email}:`, err);
    });

    const webAppUrl = this.configService.get<string>('WEBAPP_URL', 'https://prepodavai.ru');

    await ctx.reply(
      `🎉 *Спасибо за регистрацию!*\n\n` +
      `Данные для входа отправлены на *${state.email}*\n\n` +
      `Ваши данные для входа на сайте:\n\n` +
      `👤 Логин: \`${username}\`\n` +
      `🔑 Пароль: \`${password}\`\n\n` +
      `⚠️ *Сохраните пароль* — он больше не будет показан.`,
      { parse_mode: 'Markdown' },
    );

    await ctx.reply(
      `Нажмите кнопку ниже, чтобы открыть ПреподаваИИ:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Открыть ПреподаваИИ', web_app: { url: `${webAppUrl}/dashboard` } }],
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
      await ctx.reply('⚠️ Этот аккаунт Telegram уже привязан к другому профилю ПреподаваИИ.');
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

    // Аналитика: ключевая конверсия «из реги в привязку ТГ»
    this.analyticsEvents.track({
      userId: linkToken.userId,
      eventType: 'tg_linked',
      payload: {
        telegramId: user.id.toString(),
        username: user.username || null,
      },
    }).catch(() => { /* silent */ });

    this.regStates.delete(user.id.toString());

    // Create/update BotUser for this Telegram account
    await (this.prisma as any).botUser.upsert({
      where: { telegramId: user.id.toString() },
      update: { appUserId: linkToken.userId, lastActiveAt: new Date(), registrationStatus: 'linked' },
      create: {
        telegramId: user.id.toString(),
        appUserId: linkToken.userId,
        firstName: user.first_name || null,
        lastName: user.last_name || null,
        username: user.username || null,
        email: webUser.email || null,
        registrationStatus: 'linked',
        source: 'linked_telegram',
        lastActiveAt: new Date(),
      },
    });

    await ctx.reply(
      `✅ Telegram успешно привязан к вашему аккаунту ПреподаваИИ!\n\n` +
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

    const isBotOnlyUser = appUser.source === 'telegram_bot' && !appUser.email;

    try {
      if (
        generationType === 'image' ||
        generationType === 'image_generation' ||
        generationType === 'image_edit' ||
        generationType === 'photosession'
      ) {
        await this.sendImage(chatId, result);
      } else if (generationType === 'presentation') {
        await this.sendPresentation(chatId, result);
      } else {
        await this.sendTextResult(chatId, generationType, result, isBotOnlyUser);
      }
      console.log(`[Telegram] Result delivered successfully: type=${generationType} userId=${userId}`);
      return { success: true, message: 'Result sent successfully' };
    } catch (error) {
      console.error(`[Telegram] Failed to deliver result: type=${generationType} userId=${userId} error=${error}`);
      return { success: false, message: String(error) };
    } finally {
      await this.bot.api.sendMessage(chatId, '🛠️ *Выберите инструмент:*', {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📄 Рабочий лист', callback_data: 'g:t:worksheet' }, { text: '📝 Генератор тестов', callback_data: 'g:t:quiz' }],
            [{ text: '📖 Словарь', callback_data: 'g:t:vocabulary' }, { text: '📋 Конструктор уроков', callback_data: 'g:t:lesson-plan' }],
            [{ text: '✨ Вау-урок', callback_data: 'g:t:lesson-preparation' }, { text: '🖼️ Генератор изображений', callback_data: 'g:t:image' }],
            [{ text: '🎮 Обучающая игра', callback_data: 'g:t:game' }, { text: '📊 Презентация', callback_data: 'g:t:presentation' }],
            [{ text: '📚 Выдать классу/ученикам', callback_data: 'pf:hw' }],
          ],
        },
      }).catch(() => {});
    }
  }

  /**
   * Отправка изображения
   */
  private async sendImage(chatId: string, result: any) {
    // Извлекаем URL картинки из всех возможных форм результата (как в /image),
    // иначе изображение «приходило кодом» (HTML/JSON уходил текстом/в PDF).
    const imageUrl: string | null =
      (typeof result === 'string' && /^(https?:\/\/|data:image)/.test(result) ? result : null) ||
      result?.imageUrl ||
      result?.imageUrls?.[0] ||
      result?.content?.imageUrl ||
      (typeof result?.content === 'string' && /^(https?:\/\/|data:image)/.test(result.content)
        ? result.content
        : null) ||
      null;

    if (!imageUrl) {
      await this.bot.api
        .sendMessage(
          chatId,
          '⚠️ Изображение сгенерировано, но не удалось получить ссылку. Оно доступно в истории на сайте.',
        )
        .catch(() => {});
      return;
    }

    const messageText = `✅ Ваше изображение готово!${
      result?.prompt ? `\n\n📝 Промпт: ${result.prompt}` : ''
    }${result?.style ? `\n🎨 Стиль: ${result.style}` : ''}`;

    try {
      let photo: string | InputFile = imageUrl;

      // Наш собственный файл (/api/files/<hash>): читаем напрямую с диска через
      // FilesService — URL защищён JwtAuthGuard, Telegram сам его не скачает.
      const ownMatch = typeof imageUrl === 'string'
        ? imageUrl.match(/\/api\/files\/([a-f0-9]{32})(?:[?#].*)?$/i)
        : null;
      if (ownMatch) {
        const file = await this.filesService.getFile(ownMatch[1]);
        if (file) {
          const ext = file.mimeType.includes('png') ? 'png'
                    : file.mimeType.includes('webp') ? 'webp'
                    : file.mimeType.includes('gif') ? 'gif'
                    : 'jpg';
          photo = new InputFile(file.buffer, `image.${ext}`);
        }
      }
      // Если это data URL (base64), конвертируем в Buffer
      else if (typeof imageUrl === 'string' && imageUrl.startsWith('data:image')) {
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
  private async sendTextResult(chatId: string, generationType: string, result: any, isBotOnlyUser = false) {
    console.log(`[Telegram] sendTextResult called for ${generationType}, chatId: ${chatId}`);
    const content = result?.htmlResult || result?.content || result;
    const filename = `${generationType}_${new Date().toISOString().split('T')[0]}_${Date.now()}.pdf`;

    try {
      const htmlContent = this.htmlExportService.normalizeIncomingHtml(content);
      console.log(`[Telegram] HTML content prepared, length: ${htmlContent.length}`);

      const pdfBuffer = await this.htmlExportService.htmlToPdf(htmlContent);
      console.log(`[Telegram] PDF generated successfully, size: ${pdfBuffer.length} bytes`);

      await this.bot.api.sendDocument(chatId, new InputFile(pdfBuffer, filename), {
        caption: '✅ Ваш материал готов! Мы прикрепили его в формате PDF.',
      });
      return;
    } catch (error) {
      console.error(`[Telegram] Failed to render PDF for ${generationType}:`, error);
    }

    const fallbackText = isBotOnlyUser
      ? `✅ Ваш материал готов!\n\n⚠️ Не удалось создать PDF. Попробуйте сгенерировать ещё раз.`
      : `✅ Ваш материал готов!\n\nПросмотр доступен в веб-версии ПреподаваИИ.`;

    await this.bot.api.sendMessage(chatId, fallbackText);
  }

  /**
   * Отправка приветствия с кнопкой WebApp
   */

  private async sendWelcomeWithWebApp(ctx: Context, _appUser: any) {
    const telegramId = ctx.from?.id.toString();
    let botCredits: number | null = null;
    if (telegramId) {
      const botUserRecord = await (this.prisma as any).botUser.findUnique({ where: { telegramId } });
      botCredits = botUserRecord?.botCredits ?? null;
    }
    const balanceLine = botCredits !== null ? `\n\n💳 Токенов на балансе: ${botCredits}` : '';

    await ctx.reply(
      `Добро пожаловать в Преподавай 🎓\n\n` +
      `Я Ваш интеллектуальный помощник для:\n` +
      `— Создания учебных материалов\n` +
      `— Планирования уроков\n` +
      `— Создания красочных презентаций\n` +
      `— Методической поддержки\n` +
      `— Создания интерактивных игр` +
      balanceLine,
    );

    await ctx.reply(
      `📌 *Как пользоваться:*\n\n` +
      `1\\. Выберите инструмент из списка ниже\n` +
      `2\\. Ответьте на несколько вопросов\n` +
      `3\\. Получите готовый материал в PDF\n\n` +
      `Каждая генерация стоит 3 токена\\.`,
      { parse_mode: 'MarkdownV2' },
    );
  }
}
