import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HtmlExportService } from '../../common/services/html-export.service';
import * as crypto from 'crypto';
import axios from 'axios';
import * as FormData from 'form-data';
import { TOOL_CONFIGS, ToolConfig, FieldConfig, getToolConfig } from './tool-configs';

// ── Generation session types ──────────────────────────────────────────────────
interface GenSession {
  toolKey: string;
  fieldIndex: number;
  params: Record<string, string>;
  lastActivity: number;
  lastKeyboardMessageId?: string; // for editing multiselect keyboards
}

@Injectable()
export class MaxService {
  private readonly logger = new Logger(MaxService.name);
  private token: string;
  private apiUrl: string;
  private internalApiUrl: string;

  // ── Generation session state ────────────────────────────────────────────────
  private readonly genSessions = new Map<string, GenSession>();
  private readonly lastGenAt = new Map<string, number>();
  private static readonly GEN_SESSION_TTL_MS = 10 * 60_000;
  private static readonly GEN_RATE_LIMIT_MS = 15_000;
  private static readonly MAX_GEN_SESSIONS = 300;
  private static readonly MAX_CALLBACK_DATA_LEN = 32;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private readonly htmlExportService: HtmlExportService,
  ) {
    this.token = this.configService.get<string>('MAX_BOT_TOKEN');
    this.apiUrl = this.configService.get<string>('MAX_API_URL') || 'https://platform-api.max.ru';
    this.internalApiUrl = this.configService.get<string>('API_URL') || 'http://localhost:3001';

    this.logger.log(`MaxService initialized with API URL: ${this.apiUrl}`);
    if (!this.token) {
      this.logger.error('MAX_BOT_TOKEN is missing in configuration!');
    }
  }

  // ── Webhook entry point ───────────────────────────────────────────────────
  /**
   * Обработка входящего вебхука от MAX
   */
  async handleWebhook(body: any) {
    const updateType = body?.update_type;
    this.logger.log(`[Webhook] update_type=${updateType ?? 'unknown'}`);

    if (updateType === 'message_callback') {
      await this.handleCallback(body.callback);
    } else if (updateType === 'message_created') {
      await this.handleMessage(body.message);
    } else if (updateType === 'bot_started') {
      const userId = body?.user?.user_id?.toString() || body?.chat_id?.toString();
      const chatId = body?.chat_id?.toString() || userId;
      if (userId && chatId) {
        await this.handleStartCommand({ id: userId, ...body.user }, chatId);
      }
    } else if (updateType) {
      this.logger.warn(`[Webhook] Ignoring unknown update_type: ${updateType}`);
    }
  }

  // ── Message handler ───────────────────────────────────────────────────────
  private async handleMessage(message: any) {
    if (!message) return;
    try {
      const user = message.from || message.sender;
      const text: string = (message.text || message.content || message.body?.text || '').trim();

      // Reverting to using the user's ID as the primary chatId for the URL,
      // as it was the only one that didn't give 'dialog.not.found'.
      const chatId: string = (
        user?.user_id || user?.id || message.chat?.id || message.recipient?.chat_id
      )?.toString();

      const userIdForDb: string = (user?.user_id || user?.id)?.toString();

      if (!user || !chatId || !userIdForDb) {
        this.logger.warn('Could not extract user or chatId from MAX message');
        return;
      }

      const botUser = { ...user, id: userIdForDb };
      const botUserId = message.recipient?.user_id;

      this.logger.log(
        `Parsed message from ${botUser.username || botUser.id}: ${text} (Target: ${chatId}, Bot: ${botUserId})`,
      );

      if (text.startsWith('/start')) {
        const parts = text.split(/\s+/);
        const payload = parts.length > 1 ? parts[1] : undefined;
        await this.handleStartCommand(botUser, chatId, botUserId, payload);
        return;
      }

      if (text === '/generate') {
        const appUser = await this.prisma.appUser.findUnique({ where: { maxId: userIdForDb } });
        if (!appUser) {
          this.logger.warn(`[Gen] /generate by unlinked user=${userIdForDb}`);
          await this.sendMessage(chatId, '❌ Аккаунт не найден.\n\nСначала привяжите MAX в настройках профиля на prepodavai.ru');
          return;
        }
        this.logger.log(`[Gen] /generate by user=${userIdForDb}`);
        this.genSessions.delete(userIdForDb);
        await this.sendMessageWithKeyboard(
          chatId,
          '🛠️ Выберите инструмент:',
          this.buildToolSelectionAttachment(),
        );
        return;
      }

      if (text === '/cancel') {
        if (this.genSessions.has(userIdForDb)) {
          this.logger.log(`[Gen] /cancel — session cleared for user=${userIdForDb}`);
          this.genSessions.delete(userIdForDb);
          await this.sendMessage(chatId, '❌ Генерация отменена.');
        } else {
          this.logger.log(`[Gen] /cancel — no active session for user=${userIdForDb}`);
          await this.sendMessage(chatId, 'Нет активного процесса.');
        }
        return;
      }

      // Text input for active gen session
      const genSession = this.getGenSession(userIdForDb);
      if (genSession) {
        const tool = getToolConfig(genSession.toolKey);
        if (!tool) return;

        const field = tool.fields[genSession.fieldIndex];
        if (!field) return;

        if (field.type === 'file') {
          await this.sendMessage(
            chatId,
            '📎 Для загрузки файлов используйте веб-версию: https://prepodavai.ru',
          );
          this.genSessions.delete(userIdForDb);
          return;
        }

        if (field.type === 'multiselect') {
          await this.sendMessage(chatId, '👆 Нажмите на кнопки выше, чтобы выбрать разделы, затем нажмите Готово.');
          return;
        }

        if (field.type !== 'text') return;

        const sanitized = this.sanitize(text);
        const error = this.validateText(sanitized, field);
        if (error) {
          await this.sendMessage(chatId, error);
          return;
        }

        genSession.params[field.key] = sanitized;
        genSession.fieldIndex++;
        await this.nextStep(chatId, genSession, tool, botUserId);
        return;
      }
    } catch (error) {
      this.logger.error('Error handling MAX message:', error);
    }
  }

  // ── Callback handler ──────────────────────────────────────────────────────
  private async handleCallback(callback: any) {
    if (!callback) return;
    try {
      const callbackId: string = callback.callback_id;
      const userId: string = callback.user?.user_id?.toString();
      const chatId: string = (callback.user?.user_id || callback.message?.recipient?.user_id)?.toString();
      const payload: string = callback.payload || '';
      const messageId: string | undefined = callback.message?.body?.mid?.toString();

      if (!userId || !chatId) {
        this.logger.warn('Could not extract userId or chatId from MAX callback');
        return;
      }

      this.logger.log(`[Callback] userId=${userId} payload=${payload}`);

      // Answer the callback to dismiss loading state
      await this.answerCallback(callbackId);

      if (!payload.startsWith('g:')) {
        this.logger.warn(`[Callback] Ignoring non-g: payload="${payload}" from userId=${userId}`);
        return;
      }
      if (payload.length > MaxService.MAX_CALLBACK_DATA_LEN) {
        this.logger.warn(`[Callback] Oversized payload (${payload.length} chars) from userId=${userId}`);
        return;
      }

      if (payload.startsWith('g:t:')) {
        // Tool selection
        const toolKey = payload.slice(4);
        const tool = getToolConfig(toolKey);
        if (!tool) {
          this.logger.warn(`[Gen] Unknown tool key="${toolKey}" from userId=${userId}`);
          return;
        }

        const appUser = await this.prisma.appUser.findUnique({ where: { maxId: userId } });
        if (!appUser) {
          this.logger.warn(`[Gen] Tool selection by unlinked user=${userId} tool=${toolKey}`);
          await this.sendMessage(chatId, '❌ Аккаунт не найден. Используйте /start.');
          return;
        }

        let session: GenSession;
        try {
          session = this.createGenSession(userId, toolKey);
        } catch (e: any) {
          this.logger.warn(`[Gen] createGenSession failed for userId=${userId}: ${e.message}`);
          await this.sendMessage(chatId, `⚠️ ${e.message}`);
          return;
        }
        this.logger.log(`[Gen] Tool selected: userId=${userId} tool=${toolKey}`);
        await this.askField(chatId, tool, session);

      } else if (payload.startsWith('g:v:')) {
        // Select option
        const idx = parseInt(payload.slice(4), 10);
        if (!Number.isFinite(idx) || idx < 0 || idx > 50) {
          this.logger.warn(`[Gen] Invalid g:v: index="${payload.slice(4)}" from userId=${userId}`);
          return;
        }

        const session = this.getGenSession(userId);
        if (!session) {
          this.logger.warn(`[Gen] g:v: — session expired for userId=${userId}`);
          await this.sendMessage(chatId, '⏰ Сессия истекла. Начните заново: /generate');
          return;
        }

        const tool = getToolConfig(session.toolKey);
        if (!tool) return;

        const field = tool.fields[session.fieldIndex];
        if (!field) return;

        const value = this.resolveOptionByIndex(field, idx, session.params);
        if (value === null) {
          this.logger.warn(`[Gen] Out-of-range option idx=${idx} field=${field.key} tool=${session.toolKey} userId=${userId}`);
          await this.sendMessage(chatId, '❌ Недопустимый выбор. Нажмите одну из кнопок выше.');
          return;
        }

        this.logger.log(`[Gen] Option selected: userId=${userId} tool=${session.toolKey} field=${field.key} value="${value}"`);
        session.params[field.key] = value;
        session.fieldIndex++;
        await this.nextStep(chatId, session, tool);

      } else if (payload.startsWith('g:ms:')) {
        // Toggle multiselect option
        const idx = parseInt(payload.slice(5), 10);
        if (!Number.isFinite(idx) || idx < 0 || idx > 20) {
          this.logger.warn(`[Gen] Invalid g:ms: index="${payload.slice(5)}" from userId=${userId}`);
          return;
        }

        const session = this.getGenSession(userId);
        if (!session) {
          this.logger.warn(`[Gen] g:ms: — session expired for userId=${userId}`);
          await this.sendMessage(chatId, '⏰ Сессия истекла. Начните заново: /generate');
          return;
        }

        const tool = getToolConfig(session.toolKey);
        if (!tool) return;

        const field = tool.fields[session.fieldIndex];
        if (!field || field.type !== 'multiselect') return;

        const options = field.options ?? [];
        if (idx >= options.length) return;

        const current = new Set((session.params[field.key] || '').split(',').filter(Boolean));
        const optValue = options[idx].value;
        if (current.has(optValue)) {
          current.delete(optValue);
        } else {
          current.add(optValue);
        }
        session.params[field.key] = Array.from(current).join(',');

        // Edit the keyboard in-place
        const msAttachment = this.buildMultiselectAttachment(field, session);
        const targetMessageId = session.lastKeyboardMessageId || messageId;
        if (targetMessageId && msAttachment) {
          await this.editMessageKeyboard(targetMessageId, field.label, msAttachment).catch(() => null);
        }

      } else if (payload === 'g:msok') {
        // Confirm multiselect
        const session = this.getGenSession(userId);
        if (!session) {
          this.logger.warn(`[Gen] g:msok — session expired for userId=${userId}`);
          await this.sendMessage(chatId, '⏰ Сессия истекла. Начните заново: /generate');
          return;
        }

        const tool = getToolConfig(session.toolKey);
        if (!tool) return;

        const field = tool.fields[session.fieldIndex];
        if (!field || field.type !== 'multiselect') return;

        const selected = (session.params[field.key] || '').split(',').filter(Boolean);
        if (selected.length === 0) {
          this.logger.warn(`[Gen] g:msok — no options selected userId=${userId} field=${field.key}`);
          await this.sendMessage(chatId, '⚠️ Выберите хотя бы один раздел');
          return;
        }

        this.logger.log(`[Gen] Multiselect confirmed: userId=${userId} field=${field.key} selected=[${selected.join(',')}]`);
        session.fieldIndex++;
        await this.nextStep(chatId, session, tool);

      } else if (payload === 'g:skip') {
        const session = this.getGenSession(userId);
        if (!session) return;

        const tool = getToolConfig(session.toolKey);
        if (!tool) return;

        const field = tool.fields[session.fieldIndex];
        if (!field) return;

        if (field.required) {
          this.logger.warn(`[Gen] Skip attempted on required field=${field.key} userId=${userId}`);
          await this.sendMessage(chatId, '❌ Это поле обязательно — пропустить нельзя.');
          return;
        }

        this.logger.log(`[Gen] Skip: userId=${userId} field=${field.key} skipToEnd=${!!field.skipToEnd}`);
        if (field.default !== undefined) session.params[field.key] = field.default;
        if (field.skipToEnd) {
          session.fieldIndex = tool.fields.length;
        } else {
          session.fieldIndex++;
        }
        await this.nextStep(chatId, session, tool);

      } else if (payload === 'g:ok') {
        // Confirm generation
        const session = this.getGenSession(userId);
        if (!session) {
          this.logger.warn(`[Gen] g:ok — session expired for userId=${userId}`);
          await this.sendMessage(chatId, '⏰ Сессия истекла. Начните заново: /generate');
          return;
        }

        const lastGen = this.lastGenAt.get(userId) ?? 0;
        const waitMs = MaxService.GEN_RATE_LIMIT_MS - (Date.now() - lastGen);
        if (waitMs > 0) {
          this.logger.warn(`[Gen] Rate limit hit for userId=${userId} waitMs=${waitMs}`);
          await this.sendMessage(chatId, `⏳ Подождите ещё ${Math.ceil(waitMs / 1000)} сек. перед следующей генерацией.`);
          return;
        }

        const tool = getToolConfig(session.toolKey);
        if (!tool) return;

        const appUser = await this.prisma.appUser.findUnique({ where: { maxId: userId } }) as any;
        if (!appUser) {
          this.logger.warn(`[Gen] g:ok — appUser not found for userId=${userId}`);
          await this.sendMessage(chatId, '❌ Аккаунт не найден.');
          this.genSessions.delete(userId);
          return;
        }

        this.genSessions.delete(userId);
        this.lastGenAt.set(userId, Date.now());

        this.logger.log(`[Gen] Starting generation: userId=${userId} tool=${tool.key} params=${JSON.stringify(session.params)}`);
        await this.sendMessage(chatId, `⏳ Генерирую ${tool.emoji} ${tool.label}...\n${tool.estimatedTime}`);

        try {
          const apiKey = await this.ensureApiKey(appUser);
          const authToken = await this.getApiToken(appUser.username, apiKey);
          if (!authToken) {
            this.logger.error(`[Gen] Auth failed for userId=${userId} username=${appUser.username}`);
            await this.sendMessage(chatId, '❌ Ошибка авторизации. Попробуйте позже или обратитесь в поддержку.');
            return;
          }

          if (tool.serviceType === 'games') {
            this.logger.log(`[Gen] Calling games API: userId=${userId} type=${session.params.type} topic="${session.params.topic}"`);
            const result = await this.callGamesApi(authToken, session.params.type, session.params.topic);
            this.logger.log(`[Gen] Game created: userId=${userId} url=${result.url}`);
            const gameAttachment = [{
              type: 'inline_keyboard',
              payload: {
                buttons: [[{ type: 'link', url: result.url, text: '🎮 Открыть игру' }]],
              },
            }];
            await this.sendMessageWithMarkup(
              chatId,
              `🎮 Игра готова!\n\nТема: ${session.params.topic}\n\nНажмите кнопку, чтобы открыть:`,
              gameAttachment,
            );
          } else {
            let apiParams: Record<string, any> = { ...session.params };
            if (tool.key === 'lesson-preparation' && typeof apiParams.generationTypes === 'string') {
              apiParams.generationTypes = apiParams.generationTypes.split(',').filter(Boolean);
            }
            this.logger.log(`[Gen] Calling generation API: userId=${userId} type=${tool.generationType}`);
            const result = await this.callGenerationApi(authToken, tool.generationType, apiParams);
            this.logger.log(`[Gen] Generation API response: userId=${userId} status=${result.status} credits=${result.remainingCredits ?? '?'}`);
            if (result.status === 'completed') {
              await this.sendMessage(
                chatId,
                `✅ Готово! Отправляю ${tool.emoji} ${tool.label} в чат...\n\n💳 Осталось токенов: ${result.remainingCredits ?? '—'}`,
              );
            } else {
              await this.sendMessage(
                chatId,
                `✅ Задача принята! Результат придёт в этот чат, как только будет готов.\n\n💳 Осталось токенов: ${result.remainingCredits ?? '—'}`,
              );
            }
          }
        } catch (err: any) {
          this.logger.error(`[Gen] Generation failed for userId=${userId} tool=${tool.key}: ${err?.message ?? err}`);
          await this.sendMessage(chatId, this.humanizeError(err));
        }

      } else if (payload === 'g:no') {
        this.logger.log(`[Gen] Cancelled by userId=${userId}`);
        this.genSessions.delete(userId);
        await this.sendMessage(chatId, '❌ Генерация отменена.');
      }
    } catch (error) {
      this.logger.error('Error handling MAX callback:', error);
    }
  }

  // ── Start command ─────────────────────────────────────────────────────────
  private async handleStartCommand(user: any, chatId: string | number, botUserId?: number, payload?: string) {
    const chatIdStr = chatId.toString();

    // Handle link token: /start link_TOKEN
    if (payload && payload.startsWith('link_')) {
      const token = payload.slice(5);
      this.logger.log(`[Start] Link token flow: userId=${user.id} token=${token.slice(0, 6)}...`);
      await this.handleLinkToken(user, chatIdStr, token);
      return;
    }

    // Normal /start — only greet existing linked users
    let existingUser = await this.prisma.appUser.findUnique({
      where: { maxId: user.id.toString() },
      include: { subscription: true },
    });

    if (existingUser) {
      this.logger.log(`[Start] Linked user: userId=${user.id} appUserId=${existingUser.id}`);
      existingUser = await this.prisma.appUser.update({
        where: { id: existingUser.id },
        data: {
          lastAccessAt: new Date(),
          chatId: chatIdStr,
          maxChatId: chatIdStr,
          firstName: user.first_name || existingUser.firstName,
          lastName: user.last_name || existingUser.lastName,
          username: user.username || existingUser.username,
        } as any,
        include: { subscription: true },
      });
      await this.sendWelcomeMessage(chatIdStr, existingUser, botUserId);
    } else {
      this.logger.log(`[Start] Unlinked user: userId=${user.id} — showing registration prompt`);
      const webAppUrl = this.configService.get<string>('WEBAPP_URL', 'https://prepodavai.ru');
      await this.sendMessage(
        chatIdStr,
        `Добро пожаловать в PrepodavAI! 🎓\n\n` +
        `Для использования бота сначала зарегистрируйтесь на сайте, а затем привяжите MAX в настройках профиля.\n\n` +
        `После привязки вы сможете получать результаты генерации прямо здесь:\n${webAppUrl}/auth`,
      );
    }
  }

  /**
   * Подтверждение привязки MAX по токену
   */
  private async handleLinkToken(user: any, chatId: string, token: string) {
    const linkToken = await this.prisma.linkToken.findUnique({ where: { token } });

    if (!linkToken || linkToken.platform !== 'max') {
      this.logger.warn(`[LinkToken] Not found or wrong platform: token=${token.slice(0, 6)}... userId=${user.id}`);
      await this.sendMessage(chatId, '❌ Токен привязки не найден. Попробуйте сгенерировать новый в настройках профиля.');
      return;
    }

    if (linkToken.status !== 'pending') {
      this.logger.warn(`[LinkToken] Already used: tokenId=${linkToken.id} status=${linkToken.status} userId=${user.id}`);
      await this.sendMessage(chatId, '⚠️ Этот токен уже использован или истёк. Сгенерируйте новый в настройках профиля.');
      return;
    }

    if (new Date() > linkToken.expiresAt) {
      this.logger.warn(`[LinkToken] Expired: tokenId=${linkToken.id} expiresAt=${linkToken.expiresAt.toISOString()} userId=${user.id}`);
      await this.prisma.linkToken.update({ where: { id: linkToken.id }, data: { status: 'expired' } });
      await this.sendMessage(chatId, '⏰ Токен истёк. Пожалуйста, сгенерируйте новый в настройках профиля.');
      return;
    }

    // Check if this MAX account is already linked to another user
    const alreadyLinked = await this.prisma.appUser.findUnique({
      where: { maxId: user.id.toString() },
    });
    if (alreadyLinked && alreadyLinked.id !== linkToken.userId) {
      this.logger.warn(`[LinkToken] MAX account already linked: maxUserId=${user.id} linkedTo=${alreadyLinked.id} requestedBy=${linkToken.userId}`);
      await this.sendMessage(chatId, '⚠️ Этот аккаунт MAX уже привязан к другому профилю PrepodavAI.');
      return;
    }

    // Читаем текущие данные пользователя, чтобы не затереть уже заполненные поля
    const webUser = await this.prisma.appUser.findUnique({ where: { id: linkToken.userId } });
    if (!webUser) {
      this.logger.error(`[LinkToken] Web user not found: userId=${linkToken.userId} tokenId=${linkToken.id}`);
      await this.sendMessage(chatId, '❌ Аккаунт не найден. Попробуйте позже.');
      return;
    }

    const platformName = user.username ? `@${user.username}` : user.first_name || `id${user.id}`;

    await this.prisma.$transaction([
      this.prisma.appUser.update({
        where: { id: linkToken.userId },
        data: {
          maxId: user.id.toString(),
          maxChatId: chatId,
          chatId, // backward compat
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

    this.logger.log(`[LinkToken] Successfully linked: maxUserId=${user.id} appUserId=${linkToken.userId} as ${platformName}`);
    await this.sendMessage(
      chatId,
      `✅ MAX успешно привязан к вашему аккаунту PrepodavAI!\n\nТеперь вы будете получать результаты генерации прямо здесь.`,
    );
  }

  private async sendWelcomeMessage(chatId: string, appUser: any, _botUserId?: number) {
    const balance = appUser.subscription?.creditsBalance ?? null;
    const text = this.getWelcomeMessage(appUser, balance);
    await this.sendMessageWithMarkup(chatId, text);
    await this.sendMessageWithKeyboard(chatId, '🛠️ Выберите инструмент:', this.buildToolSelectionAttachment());
  }

  // ── Generation result delivery ────────────────────────────────────────────
  /**
   * Broadcast сообщение от администратора конкретному пользователю
   */
  async sendBroadcastMessage(chatId: string, text: string): Promise<void> {
    await this.sendMessage(chatId, `📢 Сообщение от администратора\n\n${text}`);
  }

  async sendGenerationResult(params: {
    userId: string;
    generationType: string;
    result: any;
    generationRequestId: string;
  }): Promise<{ success: boolean; message?: string }> {
    const { userId, generationType, result } = params;

    const appUser = await this.prisma.appUser.findUnique({
      where: { id: userId },
    }) as any;

    if (!appUser || !appUser.maxId) {
      return { success: false, message: 'MAX not linked for this user' };
    }

    // maxChatId — основной, chatId — fallback для старых пользователей
    const chatId = appUser.maxChatId || (appUser.source === 'max' ? appUser.chatId : null);
    if (!chatId) {
      return { success: false, message: 'No MAX chatId available' };
    }

    this.logger.log(`[MAX] Sending result: type=${generationType} userId=${userId} chatId=${chatId}`);

    try {
      if (generationType === 'image' || generationType === 'photosession') {
        await this.sendImage(chatId, result);
      } else if (generationType === 'presentation') {
        await this.sendPresentation(chatId, result);
      } else {
        await this.sendTextResult(chatId, generationType, result);
      }
      this.logger.log(`[MAX] Result delivered successfully: type=${generationType} userId=${userId}`);
      return { success: true, message: 'Result sent successfully' };
    } catch (error) {
      this.logger.error(`[MAX] Failed to deliver result: type=${generationType} userId=${userId} error=${error}`);
      return { success: false, message: String(error) };
    }
  }

  // ── Webhook registration ──────────────────────────────────────────────────
  /**
   * Регистрация вебхука в API MAX
   */
  async subscribeWebhook(url: string) {
    if (!this.token) {
      throw new Error('MAX_BOT_TOKEN is missing');
    }

    const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
    const subscriptionUrl = `${baseUrl}/subscriptions`;

    const payload = {
      url,
      update_types: ['message_created', 'bot_started', 'message_callback'],
    };

    this.logger.log(`Registering webhook at MAX: POST ${subscriptionUrl} with URL ${url}`);

    try {
      const response = await axios.post(
        subscriptionUrl,
        payload,
        { headers: { Authorization: this.token } },
      );
      this.logger.log(`Subscription response: ${response.status} ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error: any) {
      const errorData = error?.response?.data ? JSON.stringify(error.response.data) : error.message;
      this.logger.error(`Failed to subscribe webhook: ${errorData}`);
      throw new Error(`Failed to subscribe: ${errorData}`);
    }
  }

  // ── Generation session helpers ────────────────────────────────────────────
  private createGenSession(userId: string, toolKey: string): GenSession {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, s] of this.genSessions) {
      if (now - s.lastActivity > MaxService.GEN_SESSION_TTL_MS) {
        this.genSessions.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) this.logger.log(`[Gen] Cleaned up ${cleaned} expired sessions, active=${this.genSessions.size}`);
    if (this.genSessions.size >= MaxService.MAX_GEN_SESSIONS && !this.genSessions.has(userId)) {
      this.logger.error(`[Gen] MAX_GEN_SESSIONS (${MaxService.MAX_GEN_SESSIONS}) reached, rejecting userId=${userId}`);
      throw new Error('Сервис перегружен. Попробуйте позже.');
    }
    const session: GenSession = { toolKey, fieldIndex: 0, params: {}, lastActivity: now };
    this.genSessions.set(userId, session);
    this.logger.log(`[Gen] Session created: userId=${userId} tool=${toolKey} active=${this.genSessions.size}`);
    return session;
  }

  private getGenSession(userId: string): GenSession | undefined {
    const s = this.genSessions.get(userId);
    if (!s) return undefined;
    if (Date.now() - s.lastActivity > MaxService.GEN_SESSION_TTL_MS) {
      this.logger.warn(`[Gen] Session TTL expired for userId=${userId} tool=${s.toolKey}`);
      this.genSessions.delete(userId);
      return undefined;
    }
    s.lastActivity = Date.now();
    return s;
  }

  private buildConfirmMessage(tool: ToolConfig, params: Record<string, string>): string {
    const lines: string[] = [`${tool.emoji} ${tool.label} — подтверждение\n`];
    for (const field of tool.fields) {
      const val = params[field.key];
      if (val !== undefined && val !== '') lines.push(`• ${val}`);
    }
    lines.push(`\n💳 Стоимость: ${tool.creditCost} токена`);
    lines.push(`⏱ Примерное время: ${tool.estimatedTime}`);
    lines.push('\nГенерировать?');
    return lines.join('\n');
  }

  // ── Keyboard builders ─────────────────────────────────────────────────────
  private buildToolSelectionAttachment(): any[] {
    const buttons: any[][] = [];
    let row: any[] = [];
    TOOL_CONFIGS.forEach((tool, i) => {
      if (i > 0 && i % 2 === 0) {
        buttons.push(row);
        row = [];
      }
      row.push({ type: 'callback', text: `${tool.emoji} ${tool.label}`, payload: `g:t:${tool.key}` });
    });
    if (row.length > 0) buttons.push(row);
    return [{ type: 'inline_keyboard', payload: { buttons } }];
  }

  private buildMultiselectAttachment(field: FieldConfig, session: GenSession): any[] | null {
    if (field.type !== 'multiselect') return null;
    const selected = new Set((session.params[field.key] || '').split(',').filter(Boolean));
    const options = field.options ?? [];
    const buttons: any[][] = [];
    let row: any[] = [];
    options.forEach((opt, i) => {
      if (i > 0 && i % 2 === 0) {
        buttons.push(row);
        row = [];
      }
      const isSelected = selected.has(opt.value);
      row.push({ type: 'callback', text: `${isSelected ? '✅' : '☐'} ${opt.label}`, payload: `g:ms:${i}` });
    });
    if (row.length > 0) buttons.push(row);
    buttons.push([{
      type: 'callback',
      text: selected.size > 0 ? `✅ Готово (${selected.size})` : '✅ Готово',
      payload: 'g:msok',
    }]);
    buttons.push([{ type: 'callback', text: '❌ Отмена', payload: 'g:no' }]);
    return [{ type: 'inline_keyboard', payload: { buttons } }];
  }

  private buildFieldAttachment(field: FieldConfig, session: GenSession): any[] | null {
    if (field.type === 'multiselect') {
      return this.buildMultiselectAttachment(field, session);
    }
    if (field.type === 'file') {
      return [{ type: 'inline_keyboard', payload: { buttons: [[{ type: 'callback', text: '❌ Отмена', payload: 'g:no' }]] } }];
    }

    const options = this.resolveOptions(field, session.params);
    if (!options) {
      if (!field.required && field.skipLabel) {
        return [{ type: 'inline_keyboard', payload: { buttons: [[{ type: 'callback', text: `⏭️ ${field.skipLabel}`, payload: 'g:skip' }]] } }];
      }
      return null;
    }

    const cols = options.length <= 3 ? options.length : 2;
    const buttons: any[][] = [];
    let row: any[] = [];
    options.forEach((opt, i) => {
      if (i > 0 && i % cols === 0) {
        buttons.push(row);
        row = [];
      }
      row.push({ type: 'callback', text: opt.label, payload: `g:v:${i}` });
    });
    if (row.length > 0) buttons.push(row);

    if (!field.required && field.skipLabel) {
      buttons.push([{ type: 'callback', text: `⏭️ ${field.skipLabel}`, payload: 'g:skip' }]);
    }

    return [{ type: 'inline_keyboard', payload: { buttons } }];
  }

  private buildConfirmAttachment(): any[] {
    return [{
      type: 'inline_keyboard',
      payload: {
        buttons: [
          [
            { type: 'callback', text: '✅ Генерировать', payload: 'g:ok' },
            { type: 'callback', text: '❌ Отмена', payload: 'g:no' },
          ],
        ],
      },
    }];
  }

  // ── Wizard step helpers ───────────────────────────────────────────────────
  private async askField(chatId: string, tool: ToolConfig, session: GenSession, _botUserId?: number): Promise<void> {
    const field = tool.fields[session.fieldIndex];

    if (field.type === 'file') {
      // File uploads not supported in MAX — show message and cancel
      await this.sendMessage(
        chatId,
        '📎 Для загрузки файлов используйте веб-версию: https://prepodavai.ru',
      );
      this.genSessions.delete(chatId);
      return;
    }

    const attachment = this.buildFieldAttachment(field, session);

    if (field.type === 'multiselect') {
      const msgId = await this.sendMessageWithKeyboard(chatId, field.label, attachment);
      if (msgId) {
        session.lastKeyboardMessageId = msgId;
      }
    } else {
      await this.sendMessageWithKeyboard(chatId, field.label, attachment);
    }
  }

  private async nextStep(chatId: string, session: GenSession, tool: ToolConfig, _botUserId?: number): Promise<void> {
    if (session.fieldIndex >= tool.fields.length) {
      const msg = this.buildConfirmMessage(tool, session.params);
      await this.sendMessageWithKeyboard(chatId, msg, this.buildConfirmAttachment());
    } else {
      await this.askField(chatId, tool, session);
    }
  }

  // ── Backend API helpers ───────────────────────────────────────────────────
  private async getApiToken(username: string, apiKey: string): Promise<string | null> {
    const maskedKey = apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : 'null';
    this.logger.log(`[Auth] login attempt: username=${username} apiKey=${maskedKey}`);
    try {
      const resp = await axios.post(
        `${this.internalApiUrl}/api/auth/login-with-api-key`,
        { username, apiKey },
        { headers: { 'Content-Type': 'application/json' } },
      );
      return resp.data?.token ?? null;
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data ? JSON.stringify(err.response.data).slice(0, 200) : err.message;
      this.logger.error(`[Auth] login-with-api-key failed: status=${status} body=${body}`);
      return null;
    }
  }

  private async callGenerationApi(token: string, generationType: string, params: Record<string, any>): Promise<any> {
    const resp = await axios.post(
      `${this.internalApiUrl}/api/generate/${generationType}`,
      { ...params, _miniAppPlatform: 'max' },
      { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } },
    );
    return resp.data;
  }

  private async callGamesApi(token: string, type: string, topic: string): Promise<any> {
    const resp = await axios.post(
      `${this.internalApiUrl}/api/games/generate`,
      { type, topic },
      { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } },
    );
    return resp.data;
  }

  private async ensureApiKey(user: any): Promise<string> {
    if (user.apiKey) return user.apiKey;
    const newApiKey = crypto.randomBytes(16).toString('hex');
    await this.prisma.appUser.update({ where: { id: user.id }, data: { apiKey: newApiKey } as any });
    user.apiKey = newApiKey;
    this.logger.log(`[API] Generated missing apiKey for user ${user.id}`);
    return newApiKey;
  }

  private humanizeError(err: any): string {
    const msg: string = err?.message ?? '';
    if (
      msg.toLowerCase().includes('токен') ||
      msg.toLowerCase().includes('кредит') ||
      msg.toLowerCase().includes('баланс')
    ) {
      return '💳 Недостаточно токенов. Пополните баланс на сайте prepodavai.ru';
    }
    if (msg.toLowerCase().includes('не найден')) {
      return '❌ Аккаунт не найден. Используйте /start.';
    }
    this.logger.error('[Gen] Unhandled error:', msg);
    return '❌ Произошла ошибка при генерации. Попробуйте ещё раз или обратитесь в поддержку.';
  }

  // ── Text/field helpers ────────────────────────────────────────────────────
  private sanitize(raw: string): string {
    return raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  }

  private validateText(raw: string, field: FieldConfig): string | null {
    const value = raw.trim();
    if (field.required && !value) return '❌ Это поле обязательно. Пожалуйста, введите текст.';
    if (value.length > field.maxLength) return `❌ Слишком длинный текст. Максимум — ${field.maxLength} символов.`;
    return null;
  }

  private resolveOptions(field: FieldConfig, params: Record<string, string>) {
    if (field.conditionalOptions) return field.conditionalOptions(params);
    return field.options ?? null;
  }

  private resolveOptionByIndex(field: FieldConfig, index: number, params: Record<string, string>): string | null {
    const options = this.resolveOptions(field, params);
    if (!options || index < 0 || index >= options.length) return null;
    return options[index].value;
  }

  // ── Low-level MAX API wrappers ────────────────────────────────────────────
  private sendMessage(chatId: string, text: string) {
    return this.sendMessageWithMarkup(chatId, text);
  }

  private async sendMessageWithMarkup(chatId: string, text: string, attachments?: any[]): Promise<string | undefined> {
    if (!this.token) {
      this.logger.error('MAX_BOT_TOKEN is not defined! Cannot send message.');
      return undefined;
    }

    // BACK TO BASICS: Put user_id in query string as it was the only way that parsed the body successfully.
    // Use the provided chatId (which we'll ensure is the chat_id from the webhook).
    const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
    const url = `${baseUrl}/messages?user_id=${chatId}`;

    try {
      const payload: any = { text };
      if (attachments && attachments.length > 0) {
        payload.attachments = attachments;
      }

      const response = await axios.post(
        url,
        payload,
        { headers: { Authorization: this.token } },
      );
      this.logger.log(`[MAX] Message sent: status=${response.status} chatId=${chatId}`);

      // Extract message ID for keyboard editing
      const mid: string | undefined =
        response.data?.message?.body?.mid?.toString() ||
        response.data?.id?.toString();
      return mid;
    } catch (error: any) {
      this.logger.error(
        'Failed to send text message to MAX: ' +
        (error?.response?.data ? JSON.stringify(error.response.data) : error.message),
      );
      return undefined;
    }
  }

  private async sendMessageWithKeyboard(chatId: string, text: string, keyboardAttachments: any[] | null): Promise<string | undefined> {
    return this.sendMessageWithMarkup(chatId, text, keyboardAttachments ?? undefined);
  }

  private async editMessageKeyboard(messageId: string, text: string, attachments: any[]): Promise<void> {
    if (!this.token) return;
    const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
    const url = `${baseUrl}/messages?message_id=${messageId}`;
    try {
      await axios.put(url, { text, attachments }, { headers: { Authorization: this.token } });
    } catch (error: any) {
      this.logger.error(
        'Failed to edit MAX message: ' +
        (error?.response?.data ? JSON.stringify(error.response.data) : error.message),
      );
    }
  }

  private async answerCallback(callbackId: string): Promise<void> {
    if (!this.token) return;
    const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
    const url = `${baseUrl}/answers?callback_id=${callbackId}`;
    try {
      await axios.post(url, {}, { headers: { Authorization: this.token } });
    } catch (error: any) {
      this.logger.error(
        'Failed to answer MAX callback: ' +
        (error?.response?.data ? JSON.stringify(error.response.data) : error.message),
      );
    }
  }

  // ── Result delivery helpers ───────────────────────────────────────────────
  private async sendPresentation(chatId: string, result: any) {
    const exportUrl = result?.exportUrl || result?.pptxUrl || result?.pdfUrl;
    const topic = result?.inputText ? `\n\n📌 Тема: ${result.inputText}` : '';

    if (exportUrl) {
      try {
        const isPptx = exportUrl.toLowerCase().includes('.pptx') || exportUrl.toLowerCase().includes('pptx');
        const ext = isPptx ? 'pptx' : 'pdf';
        const filename = `presentation_${Date.now()}.${ext}`;
        this.logger.log(`[MAX] Downloading presentation: ${exportUrl}`);
        const fileResp = await axios.get(exportUrl, { responseType: 'arraybuffer', timeout: 60_000 });
        const buffer = Buffer.from(fileResp.data);
        this.logger.log(`[MAX] Presentation downloaded: ${buffer.length} bytes, uploading to MAX...`);
        await this.uploadAndSendFile(chatId, buffer, filename, `✅ Ваша презентация готова!${topic}`);
        return;
      } catch (error: any) {
        this.logger.error(`[MAX] Failed to download/upload presentation: ${error?.message ?? error}`);
      }
    } else {
      this.logger.warn('[MAX] sendPresentation: no exportUrl in result');
    }

    // Fallback
    await this.sendMessage(
      chatId,
      `✅ Ваша презентация готова!${topic}\n\nПросмотр доступен в веб-версии PrepodavAI.`,
    );
  }

  private async sendImage(chatId: string, result: any) {
    const messageText = `✅ Ваше изображение готово!${result?.prompt ? `\n\n📝 Промпт: ${result.prompt}` : ''}`;
    await this.sendMessage(chatId, messageText + `\n\n[Изображение доступно в веб-версии]`);
  }

  private async sendTextResult(chatId: string, generationType: string, result: any) {
    const content = result?.content || result;
    const filename = `${generationType}_${new Date().toISOString().split('T')[0]}.pdf`;

    try {
      const htmlContent = this.htmlExportService.normalizeIncomingHtml(content);
      const pdfBuffer = await this.htmlExportService.htmlToPdf(htmlContent);
      await this.uploadAndSendFile(chatId, pdfBuffer, filename, '✅ Ваш материал готов!');
      return;
    } catch (error) {
      this.logger.error(`[MAX] PDF generation failed for ${generationType}:`, error);
    }

    // Fallback — без raw HTML
    await this.sendMessage(chatId, `✅ Ваш материал готов!\n\nПросмотр доступен в веб-версии PrepodavAI.`);
  }

  /**
   * Загружает файл в MAX и отправляет как документ.
   * MAX Bot API: POST /uploads?type=file → { url } → multipart POST → { token } → message с attachment.
   */
  private async uploadAndSendFile(chatId: string, buffer: Buffer, filename: string, caption: string) {
    const base = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;

    // 1. Получаем upload URL
    const uploadUrlResp = await axios.post(
      `${base}/uploads?type=file`,
      {},
      { headers: { Authorization: this.token } },
    );
    const uploadUrl: string = uploadUrlResp.data?.url;
    if (!uploadUrl) throw new Error('MAX did not return upload URL');

    // 2. Загружаем файл через multipart
    const form = new FormData();
    form.append('file', buffer, { filename, contentType: 'application/octet-stream' });
    const uploadResp = await axios.post(uploadUrl, form, {
      headers: { ...form.getHeaders(), Authorization: this.token },
    });

    // Токен может прийти в разных форматах в зависимости от версии API
    const token: string =
      uploadResp.data?.token ||
      uploadResp.data?.attachment?.payload?.token ||
      uploadResp.data?.attachment?.token;
    if (!token) throw new Error('MAX did not return file token');

    this.logger.log(`[MAX] File uploaded, token=${token.slice(0, 12)}... Waiting for processing...`);

    // 3. Ждём пока MAX обработает файл, затем отправляем с ретраями
    const delays = [3000, 5000, 8000]; // 3 попытки: через 3, 5, 8 секунд
    for (let attempt = 0; attempt < delays.length; attempt++) {
      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
      try {
        await axios.post(
          `${base}/messages?user_id=${chatId}`,
          { text: caption, attachments: [{ type: 'file', payload: { token } }] },
          { headers: { Authorization: this.token } },
        );
        this.logger.log(`[MAX] File sent successfully on attempt ${attempt + 1}`);
        return;
      } catch (err: any) {
        const code = err?.response?.data?.code;
        this.logger.warn(`[MAX] Send attempt ${attempt + 1} failed: ${code ?? err?.message}`);
        if (code !== 'attachment.not.ready' || attempt === delays.length - 1) throw err;
      }
    }
  }

  private getWelcomeMessage(appUser: any, balance: number | null = null): string {
    const balanceLine = balance !== null ? `💳 Токенов на балансе: ${balance}\n\n` : '';
    return (
      `Добро пожаловать в prepodavAI 🎓\n\n` +
      `🔑 Ваши данные для входа в веб-версию:\n\n` +
      `👤 Username: ${appUser.username}\n` +
      `🔐 Пароль: ${appUser.apiKey}\n\n` +
      `⚠️ Сохраните эти данные! Они понадобятся для входа в веб-версию.\n\n` +
      `🌐 Веб-версия: https://prepodavai.ru/\n\n` +
      balanceLine +
      `Я твой интеллектуальный помощник для:\n` +
      `— Создания учебных материалов\n` +
      `— Планирования уроков\n` +
      `— Проверки работ учеников\n` +
      `— Адаптации контента\n` +
      `— Методической поддержки\n\n` +
      `Открой Mini App (Веб-приложение МАКС) для начала работы!`
    );
  }
}
