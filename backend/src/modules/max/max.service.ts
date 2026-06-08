import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HtmlExportService } from '../../common/services/html-export.service';
import { EmailService } from '../../common/services/email.service';
import { FilesService } from '../files/files.service';
import * as crypto from 'crypto';
import axios from 'axios';
import * as FormData from 'form-data';
import { TOOL_CONFIGS, ToolConfig, FieldConfig, getToolConfig } from './tool-configs';

// ── Subscription flow ─────────────────────────────────────────────────────────
const SUBSCRIPTION_TEXT =
  'Преподавай — бесплатный ИИ-сервис для репетиторов.\n\n' +
  'Он помогает быстрее готовиться к урокам:\n' +
  '— составлять планы занятий\n' +
  '— генерировать рабочие листы\n' +
  '— подбирать упражнения\n' +
  '— делать домашку\n' +
  '— объяснять темы простым языком\n\n' +
  'Чтобы пользоваться сервисом бесплатно, надо быть подписанным на канал «Прорыв в репетиторстве».\n' +
  'После подписки нажмите «Я подписался» — и бот откроет доступ.\n\n' +
  'Ссылка на канал: https://max.ru/id503501079307_1_bot?startapp=TL24a54e3010c7';

// ── Generation session types ──────────────────────────────────────────────────
interface GenSession {
  toolKey: string;
  fieldIndex: number;
  params: Record<string, string>;
  lastActivity: number;
  lastKeyboardMessageId?: string; // for editing multiselect keyboards
}

// ── NL-interface parsed request ────────────────────────────────────────────────
interface NlParsedRequest {
  action: 'generate' | 'show_history' | 'show_classes' | 'assign_homework' | 'show_balance' | 'show_menu' | 'show_tools' | 'show_analytics' | 'cancel' | 'register' | 'unknown';
  tool?: string;
  params?: Record<string, string>;
  target?: 'student' | 'class';
  dueDate?: string;
}

// ── Platform state (history, classes, pending homework) ───────────────────────
interface MaxPlatformState {
  genHistoryIds: string[];       // IDs генераций на текущей странице истории
  genOffset: number;             // текущий offset истории
  classes: Array<{ id: string; name: string; studentCount: number }>;
  classStudents: Array<{ id: string; name: string }>;
  pendingHwGenId: string | null;    // ID генерации для назначения ДЗ
  pendingHwGenTopic: string | null; // тема генерации (для создания урока)
  pendingHwTarget: 'class' | 'student' | null;
  pendingHwClassIdx: number | null;   // выбранный класс
  pendingHwStudentIdx: number | null; // выбранный ученик
  pendingViewGenType: string | null;  // тип генерации для просмотра файла
  pendingGameUrl?: string | null;     // URL игры для просмотра (кешируем как в TG боте)
  classGenList?: Array<{ id: string; type: string; topic: string }>; // список генераций для назначения из класса
  pendingNlRequest?: NlParsedRequest; // распознанный NL-запрос ожидает подтверждения
  nlPending?: boolean;                // запрос к Gemini Flash в процессе
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

  // ── Platform state (history / classes / homework flow) ───────────────────────
  private readonly platformStates = new Map<string, MaxPlatformState>();
  private static readonly GEN_HISTORY_PAGE_SIZE = 5;

  // ── JWT token cache (username → {token, expiresAt}) ──────────────────────────
  private readonly jwtCache = new Map<string, { token: string; expiresAt: number }>();
  private static readonly JWT_CACHE_TTL_MS = 8 * 60_000;

  // ── bot_started retry deduplication ──────────────────────────────────────────
  private readonly startAttemptGen = new Map<string, number>();
  private static readonly GEN_SESSION_TTL_MS = 10 * 60_000;
  private static readonly GEN_RATE_LIMIT_MS = 15_000;
  private static readonly MAX_GEN_SESSIONS = 300;
  private static readonly MAX_CALLBACK_DATA_LEN = 32;

  // ── Registration session state ────────────────────────────────────────────
  private readonly regStates = new Map<string, { step: 'awaiting_email'; email?: string; locked?: boolean; maxUsername?: string }>();
  private static readonly MAX_CONCURRENT_REG_SESSIONS = 100;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private readonly htmlExportService: HtmlExportService,
    private readonly emailService: EmailService,
    private readonly filesService: FilesService,
  ) {
    this.token = this.configService.get<string>('MAX_BOT_TOKEN');
    this.apiUrl = this.configService.get<string>('MAX_API_URL') || 'https://platform-api.max.ru';
    this.internalApiUrl = this.configService.get<string>('API_URL') || 'http://localhost:3001';

    this.logger.log(`MaxService initialized with API URL: ${this.apiUrl}`);
    if (!this.token) {
      this.logger.error('MAX_BOT_TOKEN is missing in configuration!');
    }
  }

  // ── Откуда Подписки (tgtrack) ─────────────────────────────────────────────
  private tgtrack(method: string, body: Record<string, any>): void {
    const apiKey = this.configService.get<string>('TGTRACK_MAX_API_KEY') || '';
    if (!apiKey) return;
    const base = this.configService.get<string>('TGTRACK_MAX_BASE_URL') || 'https://max.tgtrack.ru/v1';
    fetch(`${base}/${apiKey}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch((err) => this.logger.warn(`[tgtrack] ${method} failed: ${err?.message}`));
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
      if (userId) {
        const user = { id: userId, ...body.user };
        const gen = (this.startAttemptGen.get(userId) ?? 0) + 1;
        this.startAttemptGen.set(userId, gen);
        const retryDelays = [500, 1000, 2000];
        const tryStart = (attempt: number) => {
          // Если пользователь успел написать /start вручную — счётчик уже другой, стоп
          if (this.startAttemptGen.get(userId) !== gen) return;
          this.handleStartCommand(user, userId)
            .then(() => this.logger.log(`[Start] bot_started OK attempt=${attempt} userId=${userId}`))
            .catch((err) => {
              const isDialogNotFound = err?.response?.data?.code === 'dialog.not.found';
              if (isDialogNotFound && attempt < retryDelays.length) {
                setTimeout(() => tryStart(attempt + 1), retryDelays[attempt]);
              } else {
                this.logger.error(`[Start] bot_started failed userId=${userId}: ${err?.message}`);
              }
            });
        };
        tryStart(0);
      }
    } else if (updateType === 'bot_stopped') {
      const userId = body?.user?.user_id?.toString() || body?.chat_id?.toString();
      if (userId) {
        this.logger.log(`[Webhook] bot_stopped userId=${userId}`);
        this.tgtrack('my_bot_was_stopped', { user_id: userId });
      }
    } else if (updateType) {
      this.logger.warn(`[Webhook] Ignoring unknown update_type: ${updateType}`);
    }
  }

  // ── Message handler ───────────────────────────────────────────────────────
  private async handleMessage(message: any) {
    if (!message) return;
    try {
      // Ignore non-personal messages (channels, groups, channel DMs)
      const chatType = message.recipient?.chat_type;
      if (chatType && chatType !== 'dialog') {
        this.logger.log(`[Message] Ignoring non-dialog message chat_type=${chatType}`);
        return;
      }
      const channelId = this.configService.get<string>('MAX_CHANNEL_ID');
      if (channelId && message.recipient?.chat_id?.toString() === channelId) {
        this.logger.log(`[Message] Ignoring message addressed to channel ${channelId}`);
        return;
      }

      const user = message.from || message.sender;
      let text: string = (message.text || message.content || message.body?.text || '').trim();

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

      // Голосовое / аудио-сообщение → транскрибируем в текст
      if (!text) {
        const attachments: any[] = message.body?.attachments ?? message.attachments ?? [];
        const audioAttach = attachments.find((a: any) => a.type === 'audio' || a.type === 'voice');
        const audioUrl: string | undefined = audioAttach?.payload?.url;
        if (audioUrl) {
          const voiceState = this.getMaxPlatformState(userIdForDb);
          if (voiceState.nlPending) {
            await this.sendMessage(chatId, '⏳ Обрабатываю предыдущий запрос, подождите...');
            return;
          }
          voiceState.nlPending = true;
          let transcript: string | null = null;
          try {
            transcript = await this.transcribeVoice(audioUrl);
          } finally {
            voiceState.nlPending = false;
          }
          if (!transcript) {
            await this.sendMessage(chatId, '❌ Не удалось распознать голосовое сообщение. Попробуйте написать текстом.');
            return;
          }
          await this.sendMessage(chatId, `🎤 Распознал: «${transcript}»`);
          text = transcript;
        } else if (!text) {
          // Не текст и не аудио (стикер, фото и т.д.) — игнорируем
          return;
        }
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

      // Fallback для новых пользователей: bot_started не может отправить сообщение
      // пока диалог не создан. При первом сообщении показываем activation flow.
      const hasAppUser = await this.prisma.appUser.findUnique({ where: { maxId: userIdForDb }, select: { id: true } });
      if (!hasAppUser) {
        await this.sendActivationFlow(chatId);
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
        } else if (this.regStates.has(userIdForDb)) {
          this.logger.log(`[Reg] /cancel — registration cancelled for user=${userIdForDb}`);
          this.regStates.delete(userIdForDb);
          await this.sendMessage(chatId, '❌ Регистрация отменена.');
        } else {
          this.logger.log(`[Gen] /cancel — no active session for user=${userIdForDb}`);
          await this.sendMessage(chatId, 'Нет активного процесса.');
        }
        return;
      }

      // Registration flow — email input
      const regState = this.regStates.get(userIdForDb);
      if (regState && regState.step === 'awaiting_email') {
        await this.handleMaxEmailInput(userIdForDb, chatId, regState, text);
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

        // NL-запрос внутри активной сессии — показываем диалог конфликта
        if (this.looksLikeNlRequest(text)) {
          const nlInSessionState = this.getMaxPlatformState(userIdForDb);
          if (!nlInSessionState.nlPending) {
            nlInSessionState.nlPending = true;
            let inSessionParsed: NlParsedRequest;
            try {
              inSessionParsed = await this.parseNlRequest(text);
            } finally {
              nlInSessionState.nlPending = false;
            }
            if (inSessionParsed.action !== 'unknown') {
              nlInSessionState.pendingNlRequest = inSessionParsed;
              const currentLabel = `${tool.emoji} ${tool.label}`;
              if (inSessionParsed.action === 'generate' && inSessionParsed.tool) {
                const newTool = getToolConfig(inSessionParsed.tool);
                if (newTool) {
                  await this.sendMessageWithKeyboard(
                    chatId,
                    `⚠️ Вы заполняете форму «${currentLabel}».\n\nХотите прервать и создать ${newTool.emoji} ${newTool.label}?\n\n${this.buildNlConfirmMessage(inSessionParsed)}`,
                    [{ type: 'inline_keyboard', payload: { buttons: [
                      [{ type: 'callback', text: '▶ Продолжить форму', payload: 'pf:nl:cont' }],
                      [{ type: 'callback', text: `✨ Создать ${newTool.label}`.slice(0, 20), payload: 'pf:nl:go' }],
                      [{ type: 'callback', text: '❌ Отмена', payload: 'pf:nl:no' }],
                    ]}}],
                  );
                  return;
                }
              } else {
                const navLabels: Record<string, string> = {
                  show_history: 'посмотреть историю генераций',
                  show_classes: 'посмотреть классы',
                  assign_homework: 'перейти к выдаче задания',
                  show_balance: 'посмотреть баланс',
                  show_menu: 'перейти в главное меню',
                  show_tools: 'посмотреть инструменты',
                  show_analytics: 'посмотреть аналитику',
                  cancel: 'отменить и выйти в меню',
                  register: 'зарегистрироваться на сайте',
                };
                const navLabel = navLabels[inSessionParsed.action] ?? 'выполнить другое действие';
                await this.sendMessageWithKeyboard(
                  chatId,
                  `⚠️ Вы заполняете форму «${currentLabel}».\n\nХотите прервать и ${navLabel}?`,
                  [{ type: 'inline_keyboard', payload: { buttons: [
                    [{ type: 'callback', text: '▶ Продолжить форму', payload: 'pf:nl:cont' }],
                    [{ type: 'callback', text: '✅ Да, перейти', payload: 'pf:nl:go' }],
                    [{ type: 'callback', text: '❌ Отмена', payload: 'pf:nl:no' }],
                  ]}}],
                );
                return;
              }
            }
            // action === 'unknown' → воспринимаем как обычный ввод поля
          }
        }

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

      // Пользователь пишет текст вне активной сессии — NL-интерфейс
      const MENU_TRIGGERS = new Set(['старт', 'start', 'начало', 'заново', 'сначала', 'сначало', 'поехали', 'погнали']);
      if (text && MENU_TRIGGERS.has(text.toLowerCase())) {
        await this.showMainMenu(chatId, userIdForDb);
        await this.sendMessageWithKeyboard(chatId, '🛠️ Выберите инструмент:', this.buildToolSelectionAttachment());
        return;
      }

      const GREETINGS = new Set(['привет', 'здравствуй', 'здравствуйте', 'ок', 'окей', 'хорошо', 'спасибо', 'да', 'нет', 'ладно']);
      if (!text || text.length < 4 || GREETINGS.has(text.toLowerCase())) {
        await this.sendMessageWithKeyboard(chatId, '🏠 Используйте кнопки меню:', this.buildMainMenuAttachment());
        return;
      }

      const nlState = this.getMaxPlatformState(userIdForDb);
      if (nlState.nlPending) {
        await this.sendMessage(chatId, '⏳ Обрабатываю ваш предыдущий запрос, подождите...');
        return;
      }

      nlState.nlPending = true;
      let nlParsed: NlParsedRequest;
      try {
        nlParsed = await this.parseNlRequest(text);
      } finally {
        nlState.nlPending = false;
      }

      if (nlParsed.action === 'unknown') {
        await this.sendMessageWithKeyboard(
          chatId,
          'Не совсем понял. Напишите что хотите — например: «создай тест по биологии для 8 класса», «покажи мои генерации».',
          this.buildMainMenuAttachment(),
        );
        return;
      }

      nlState.pendingNlRequest = nlParsed;
      const isGenAction = nlParsed.action === 'generate';
      const confirmButtons = isGenAction
        ? [
            [{ type: 'callback', text: '✅ Создать', payload: 'pf:nl:go' }, { type: 'callback', text: '✏️ Изменить', payload: 'pf:nl:edit' }],
            [{ type: 'callback', text: '❌ Отмена', payload: 'pf:nl:no' }],
          ]
        : [
            [{ type: 'callback', text: '✅ Да', payload: 'pf:nl:go' }, { type: 'callback', text: '❌ Нет', payload: 'pf:nl:no' }],
          ];
      await this.sendMessageWithKeyboard(
        chatId,
        this.buildNlConfirmMessage(nlParsed),
        [{ type: 'inline_keyboard', payload: { buttons: confirmButtons } }],
      );
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

      // Ignore callbacks from channels — only process personal dialogs
      const cbChatType = callback.message?.recipient?.chat_type;
      if (cbChatType && cbChatType !== 'dialog') {
        this.logger.log(`[Callback] Ignoring non-dialog callback chat_type=${cbChatType}`);
        return;
      }
      const cbChannelId = this.configService.get<string>('MAX_CHANNEL_ID');
      if (cbChannelId && callback.message?.recipient?.chat_id?.toString() === cbChannelId) {
        this.logger.log(`[Callback] Ignoring callback addressed to channel ${cbChannelId}`);
        return;
      }

      if (!userId || !chatId) {
        this.logger.warn('Could not extract userId or chatId from MAX callback');
        return;
      }

      this.logger.log(`[Callback] userId=${userId} payload=${payload}`);

      // Answer the callback to dismiss loading state
      await this.answerCallback(callbackId);

      if (payload === 'sub:check') {
        await this.handleSubscriptionCheck(userId, chatId);
        return;
      }

      // ── Navigation & feature callbacks ────────────────────────────────────────
      if (payload === 'm:menu') {
        await this.showMainMenu(chatId, userId);
        return;
      }
      if (payload === 'm:tools') {
        await this.sendMessageWithKeyboard(chatId, '🛠️ Выберите инструмент:', this.buildToolSelectionAttachment());
        return;
      }
      if (payload === 'm:classes') {
        await this.showClasses(chatId, userId);
        return;
      }
      if (payload === 'm:gview') {
        await this.showGenContent(chatId, userId);
        return;
      }
      if (payload === 'm:analytics') {
        await this.showAnalytics(chatId, userId);
        return;
      }
      if (payload.startsWith('m:hist:')) {
        const offset = parseInt(payload.slice(7), 10);
        if (!Number.isFinite(offset) || offset < 0) return;
        await this.showHistory(chatId, userId, offset, messageId);
        return;
      }
      if (payload.startsWith('m:gen:')) {
        const idx = parseInt(payload.slice(6), 10);
        if (!Number.isFinite(idx) || idx < 0) return;
        await this.showGenDetail(chatId, userId, idx);
        return;
      }
      if (payload.startsWith('m:cls:')) {
        const idx = parseInt(payload.slice(6), 10);
        if (!Number.isFinite(idx) || idx < 0) return;
        await this.showClassDetail(chatId, userId, idx);
        return;
      }
      if (payload.startsWith('m:cgp:')) {
        const idx = parseInt(payload.slice(6), 10);
        if (!Number.isFinite(idx) || idx < 0) return;
        await this.showClassGenPicker(chatId, userId, idx);
        return;
      }
      if (payload.startsWith('hw:cg:')) {
        const idx = parseInt(payload.slice(6), 10);
        if (!Number.isFinite(idx) || idx < 0) return;
        await this.pickClassGen(chatId, userId, idx);
        return;
      }

      // ── Homework assignment callbacks ─────────────────────────────────────────
      if (payload === 'hw:who') {
        await this.showHwWho(chatId, userId);
        return;
      }
      if (payload === 'hw:wc') {
        await this.showHwClassPicker(chatId, userId, 'class');
        return;
      }
      if (payload === 'hw:ws') {
        await this.showHwClassPicker(chatId, userId, 'student');
        return;
      }
      if (payload.startsWith('hw:c:')) {
        const idx = parseInt(payload.slice(5), 10);
        if (!Number.isFinite(idx) || idx < 0) return;
        const state = this.getMaxPlatformState(userId);
        state.pendingHwClassIdx = idx;
        await this.sendMessageWithKeyboard(chatId, '📅 Выберите срок сдачи:', this.buildDueDateAttachment());
        return;
      }
      if (payload.startsWith('hw:sc:')) {
        const idx = parseInt(payload.slice(6), 10);
        if (!Number.isFinite(idx) || idx < 0) return;
        await this.showHwStudentList(chatId, userId, idx);
        return;
      }
      if (payload.startsWith('hw:s:')) {
        const idx = parseInt(payload.slice(5), 10);
        if (!Number.isFinite(idx) || idx < 0) return;
        const state = this.getMaxPlatformState(userId);
        state.pendingHwStudentIdx = idx;
        await this.sendMessageWithKeyboard(chatId, '📅 Выберите срок сдачи:', this.buildDueDateAttachment());
        return;
      }
      if (payload.startsWith('hw:d:')) {
        const days = parseInt(payload.slice(5), 10);
        if (!Number.isFinite(days) || days < 0) return;
        await this.doAssignHomework(chatId, userId, days);
        return;
      }

      // ── NL-interface callbacks ────────────────────────────────────────────────
      if (payload === 'pf:nl:go') {
        const nlState = this.getMaxPlatformState(userId);
        const pending = nlState.pendingNlRequest;
        nlState.pendingNlRequest = undefined;
        if (!pending) return;
        this.genSessions.delete(userId);
        if (pending.action === 'generate' && pending.tool && pending.params) {
          await this.startNlGenSession(chatId, userId, pending.tool, pending.params);
        } else if (pending.action === 'show_history') {
          nlState.genOffset = 0;
          await this.showHistory(chatId, userId, 0);
        } else if (pending.action === 'show_classes') {
          await this.showClasses(chatId, userId);
        } else if (pending.action === 'assign_homework') {
          // Если нет выбранной генерации — берём последнюю завершённую
          if (!nlState.pendingHwGenId) {
            const auth = await this.getAuthForUser(userId, chatId);
            if (!auth) return;
            try {
              const data = await this.callApi(auth.token, 'generate/history?limit=10&offset=0');
              const gen = (data.generations ?? []).find((g: any) => g.status === 'completed');
              if (!gen) {
                await this.sendMessage(chatId, '❌ Нет завершённых генераций. Сначала создайте материал.');
                return;
              }
              nlState.pendingHwGenId = gen.id;
              const p = (typeof gen.params === 'object' && gen.params) ? gen.params as Record<string, any> : {};
              const topic = (p.topic || p.subject || p.lessonTopic || p.theme || '').toString().slice(0, 60);
              nlState.pendingHwGenTopic = topic || gen.type || 'Материал из MAX';
              nlState.pendingViewGenType = gen.type || '';
            } catch {
              await this.sendMessage(chatId, '❌ Выберите генерацию из списка «📋 Мои генерации».');
              return;
            }
          }
          if (pending.target === 'student') {
            await this.showHwClassPicker(chatId, userId, 'student');
          } else {
            await this.showHwClassPicker(chatId, userId, 'class');
          }
        } else if (pending.action === 'show_balance') {
          await this.showMainMenu(chatId, userId);
        } else if (pending.action === 'show_menu') {
          await this.showMainMenu(chatId, userId);
          await this.sendMessageWithKeyboard(chatId, '🛠️ Выберите инструмент:', this.buildToolSelectionAttachment());
        } else if (pending.action === 'show_tools') {
          await this.sendMessageWithKeyboard(chatId, '🛠️ Выберите инструмент:', this.buildToolSelectionAttachment());
        } else if (pending.action === 'show_analytics') {
          await this.showAnalytics(chatId, userId);
        } else if (pending.action === 'cancel') {
          await this.sendMessageWithKeyboard(chatId, '✅ Готово.', this.buildMainMenuAttachment());
        } else if (pending.action === 'register') {
          const appUrl = this.configService.get<string>('NEXT_PUBLIC_APP_URL') || 'https://prepodavai.ru';
          await this.sendMessageWithKeyboard(chatId, `Для создания полного аккаунта перейдите на сайт: ${appUrl}\n\nТам можно зарегистрироваться и получить 1500 токенов.`, this.buildMainMenuAttachment());
        }
        return;
      }
      if (payload === 'pf:nl:no') {
        const nlState = this.getMaxPlatformState(userId);
        nlState.pendingNlRequest = undefined;
        await this.sendMessageWithKeyboard(chatId, 'Понял, отменяю.', this.buildMainMenuAttachment());
        return;
      }
      if (payload === 'pf:nl:edit') {
        const nlState = this.getMaxPlatformState(userId);
        const pending = nlState.pendingNlRequest;
        nlState.pendingNlRequest = undefined;
        if (!pending?.tool) return;
        const editTool = getToolConfig(pending.tool);
        if (!editTool) return;
        this.genSessions.delete(userId);
        let editSession: GenSession;
        try {
          editSession = this.createGenSession(userId, pending.tool);
        } catch (e: any) {
          await this.sendMessage(chatId, `⚠️ ${e.message}`);
          return;
        }
        await this.askField(chatId, editTool, editSession);
        return;
      }
      if (payload === 'pf:nl:cont') {
        const nlState = this.getMaxPlatformState(userId);
        nlState.pendingNlRequest = undefined;
        const contSession = this.getGenSession(userId);
        if (!contSession) {
          await this.sendMessage(chatId, '⏰ Время заполнения формы истекло. Начните заново через меню.');
          return;
        }
        const contTool = getToolConfig(contSession.toolKey);
        if (!contTool) return;
        await this.askField(chatId, contTool, contSession);
        return;
      }

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

        // Отменяем регистрацию если была активна (иначе текстовый ответ уйдёт в reg flow)
        this.regStates.delete(userId);

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

        // Атомарно списываем 3 токена: subscription если привязан, иначе botCredits
        const tokenResult = await this.deductTokens(userId, appUser.id);
        if (!tokenResult.success) {
          this.logger.warn(`[Gen] Insufficient tokens for userId=${userId} source=${tokenResult.source}`);
          await this.sendMessage(chatId, '❌ Недостаточно токенов для генерации.\n\nОбратитесь к администратору для пополнения баланса.');
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
            await this.refundTokens(userId, appUser.id, tokenResult.source);
            await this.sendMessage(chatId, '❌ Ошибка авторизации. Попробуйте позже или обратитесь в поддержку.');
            return;
          }

          if (tool.serviceType === 'games') {
            this.logger.log(`[Gen] Calling games API: userId=${userId} type=${session.params.type} topic="${session.params.topic}"`);
            const result = await this.callGamesApi(authToken, session.params.type, session.params.topic);
            this.logger.log(`[Gen] Game created: userId=${userId} url=${result.url}`);
            await (this.prisma as any).botUser.update({
              where: { maxId: userId },
              data: { totalGenerations: { increment: 1 }, generationsThisMonth: { increment: 1 }, lastGenerationAt: new Date() },
            });
            const gameAttachment = [{
              type: 'inline_keyboard',
              payload: { buttons: [[{ type: 'link', url: result.url, text: '🎮 Открыть игру' }]] },
            }];
            await this.sendMessageWithMarkup(chatId, `🎮 Игра готова!\n\nТема: ${session.params.topic}\n\nНажмите кнопку, чтобы открыть:`, gameAttachment);
            await this.sendMessage(chatId, `💳 Осталось токенов: ${tokenResult.remaining}`);
            await this.sendMessageWithKeyboard(chatId, '🏠 Главное меню:', this.buildMainMenuAttachment());
          } else {
            let apiParams: Record<string, any> = { ...session.params };
            if (tool.key === 'lesson-preparation' && typeof apiParams.generationTypes === 'string') {
              apiParams.generationTypes = apiParams.generationTypes.split(',').filter(Boolean);
            }
            this.logger.log(`[Gen] Calling generation API: userId=${userId} type=${tool.generationType}`);
            const result = await this.callGenerationApi(authToken, tool.generationType, apiParams);
            this.logger.log(`[Gen] Generation API response: userId=${userId} status=${result.status}`);
            this.tgtrack('send_reach_goal', { user_id: userId, target: 'generation_created' });
            if (result.status === 'failed') {
              await this.refundTokens(userId, appUser.id, tokenResult.source);
              await this.sendMessage(chatId, '❌ Генерация не удалась. Токены возвращены.');
              await this.sendMessageWithKeyboard(chatId, '🏠 Главное меню:', this.buildMainMenuAttachment());
              return;
            }
            await (this.prisma as any).botUser.update({
              where: { maxId: userId },
              data: { totalGenerations: { increment: 1 }, generationsThisMonth: { increment: 1 }, lastGenerationAt: new Date() },
            });
            if (result.status === 'completed') {
              await this.sendMessage(chatId, `✅ Готово! Отправляю ${tool.emoji} ${tool.label} в чат...\n\n💳 Осталось токенов: ${tokenResult.remaining}`);
            } else {
              await this.sendMessage(chatId, `✅ Задача принята! Результат придёт в этот чат, как только будет готов.\n\n💳 Осталось токенов: ${tokenResult.remaining}`);
            }
          }
        } catch (err: any) {
          this.logger.error(`[Gen] Generation failed for userId=${userId} tool=${tool.key}: ${err?.message ?? err}`);
          await this.refundTokens(userId, appUser.id, tokenResult.source);
          await this.sendMessage(chatId, this.humanizeError(err));
          await this.sendMessageWithKeyboard(chatId, '🏠 Главное меню:', this.buildMainMenuAttachment());
        }

      } else if (payload === 'g:webapp') {
        const botUser = await (this.prisma as any).botUser.findUnique({ where: { maxId: userId } });
        const appUser = await this.prisma.appUser.findUnique({ where: { maxId: userId } });
        const isRegistered = ['registered', 'linked'].includes(botUser?.registrationStatus) && !!appUser?.email;
        const webAppUrl = this.configService.get<string>('WEBAPP_URL', 'https://prepodavai.ru');
        if (isRegistered) {
          await this.sendMessageWithMarkup(chatId, 'Нажмите кнопку, чтобы открыть Преподавай:', [{
            type: 'inline_keyboard',
            payload: { buttons: [[{ type: 'link', url: `${webAppUrl}/dashboard`, text: '🚀 Открыть Преподавай' }]] },
          }]);
        } else {
          await this.startMaxRegistration(userId, chatId, botUser?.username);
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

    // Отменяем pending bot_started retries для этого пользователя
    const userId = user.id?.toString();
    if (userId) {
      this.startAttemptGen.set(userId, (this.startAttemptGen.get(userId) ?? 0) + 1);
    }

    // Фиксируем старт бота в Откуда Подписки (fire-and-forget)
    this.tgtrack('user_did_start_bot', {
      user_id: user.id?.toString() || chatIdStr,
      ...(user.name && { first_name: user.name }),
      ...(user.username && { username: user.username }),
      ...(payload && { start_value: payload }),
    });

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
      // Очищаем незавершённые сессии — /start всегда начинает с чистого листа
      const uidStr = user.id.toString();
      this.genSessions.delete(uidStr);
      this.regStates.delete(uidStr);
      this.platformStates.delete(uidStr);
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
      // Найти или создать BotUser
      await (this.prisma as any).botUser.upsert({
        where: { maxId: user.id.toString() },
        update: { lastActiveAt: new Date() },
        create: {
          maxId: user.id.toString(),
          appUserId: existingUser.id,
          firstName: user.first_name || null,
          lastName: user.last_name || null,
          username: user.username || null,
          email: existingUser.email || null,
          registrationStatus: 'linked',
          source: 'linked_max',
          lastActiveAt: new Date(),
        },
      });
      await this.sendWelcomeMessage(chatIdStr, existingUser, botUserId);
    } else {
      this.logger.log(`[Start] New user: userId=${user.id} — upsert botUser and show activation flow`);
      await (this.prisma as any).botUser.upsert({
        where: { maxId: user.id.toString() },
        update: { lastActiveAt: new Date(), firstName: user.first_name || undefined, lastName: user.last_name || undefined, username: user.username || undefined },
        create: {
          maxId: user.id.toString(),
          firstName: user.first_name || null,
          lastName: user.last_name || null,
          username: user.username || null,
          registrationStatus: 'pending',
          source: 'max_bot',
          lastActiveAt: new Date(),
        },
      });
      await this.sendActivationFlow(chatIdStr);
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
    const isShadowAccount = (alreadyLinked as any)?.source === 'max_bot';
    if (alreadyLinked && alreadyLinked.id !== linkToken.userId && !isShadowAccount) {
      this.logger.warn(`[LinkToken] MAX account already linked: maxUserId=${user.id} linkedTo=${alreadyLinked.id} requestedBy=${linkToken.userId}`);
      await this.sendMessage(chatId, '⚠️ Этот аккаунт MAX уже привязан к другому профилю Преподавай.');
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

    try {
      await this.prisma.$transaction(async (tx) => {
        // Переносим историю генераций shadow-аккаунта и освобождаем его maxId
        if (isShadowAccount && alreadyLinked) {
          await (tx as any).userGeneration.updateMany({
            where: { userId: alreadyLinked.id },
            data: { userId: linkToken.userId },
          });
          await tx.appUser.update({
            where: { id: alreadyLinked.id },
            data: { maxId: null, maxChatId: null } as any,
          });
        }
        await tx.appUser.update({
          where: { id: linkToken.userId },
          data: {
            maxId: user.id.toString(),
            maxChatId: chatId,
            chatId,
            ...(webUser.firstName ? {} : { firstName: user.first_name || undefined }),
            ...(webUser.lastName ? {} : { lastName: user.last_name || undefined }),
          } as any,
        });
        await tx.linkToken.update({
          where: { id: linkToken.id },
          data: { status: 'completed', linkedId: user.id.toString(), linkedName: platformName },
        });
      });

      const existingBotUserForLink = await (this.prisma as any).botUser.findUnique({
        where: { maxId: user.id.toString() },
        select: { registrationStatus: true },
      });
      const preservedLinkStatus =
        existingBotUserForLink?.registrationStatus === 'registered' ? 'registered' : 'linked';

      await (this.prisma as any).botUser.upsert({
        where: { maxId: user.id.toString() },
        update: { appUserId: linkToken.userId, lastActiveAt: new Date(), registrationStatus: preservedLinkStatus },
        create: {
          maxId: user.id.toString(),
          appUserId: linkToken.userId,
          firstName: user.first_name || null,
          lastName: user.last_name || null,
          username: user.username || null,
          email: webUser.email || null,
          registrationStatus: 'linked',
          source: 'linked_max',
          lastActiveAt: new Date(),
        },
      });

      // Очищаем возможную незавершённую регистрацию
      this.regStates.delete(user.id.toString());

      this.logger.log(`[LinkToken] Successfully linked: maxUserId=${user.id} appUserId=${linkToken.userId} as ${platformName}`);
      await this.sendMessage(
        chatId,
        `✅ MAX успешно привязан к вашему аккаунту Преподавай!\n\nТеперь вы будете получать результаты генерации прямо здесь.`,
      );
    } catch (err) {
      this.logger.error(`[LinkToken] Failed to link: maxUserId=${user.id} error=${err}`);
      await this.sendMessage(chatId, '❌ Не удалось привязать аккаунт. Попробуйте позже.');
    }
  }

  private async sendWelcomeMessage(chatId: string, appUser: any, _botUserId?: number) {
    let balance: number | null = null;
    const subscription = await this.prisma.userSubscription.findUnique({ where: { userId: appUser.id } });
    if (subscription && subscription.status === 'active') {
      balance = subscription.creditsBalance + subscription.extraCredits;
    } else {
      const maxId = appUser.maxId?.toString();
      if (maxId) {
        const botUserRecord = await (this.prisma as any).botUser.findUnique({ where: { maxId } });
        balance = botUserRecord?.botCredits ?? null;
      }
    }
    const text = this.getWelcomeMessage(appUser, balance);
    await this.sendMessageWithMarkup(chatId, text);
    await this.sendMessageWithKeyboard(chatId, '🏠 Главное меню:', this.buildMainMenuAttachment());
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
    const { userId, generationType, result, generationRequestId } = params;

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

    const isBotOnlyUser = appUser.source === 'max_bot' && !appUser.email;
    this.logger.log(`[MAX] Sending result: type=${generationType} userId=${userId} chatId=${chatId}`);

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
      this.logger.log(`[MAX] Result delivered successfully: type=${generationType} userId=${userId}`);

      // Store the delivered generation in platformState so "Назначить ДЗ" works immediately
      const maxUserId = String(appUser.maxId);
      const userGeneration = await this.prisma.userGeneration.findUnique({
        where: { generationRequestId },
        select: { id: true, inputParams: true, generationType: true },
      });
      if (userGeneration) {
        const state = this.getMaxPlatformState(maxUserId);
        state.pendingHwGenId = userGeneration.id;
        const p = (typeof userGeneration.inputParams === 'object' && userGeneration.inputParams)
          ? userGeneration.inputParams as Record<string, any>
          : {};
        const topic = (p.topic || p.subject || p.lessonTopic || p.theme || '').toString().slice(0, 60);
        state.pendingHwGenTopic = topic || userGeneration.generationType || 'Материал из MAX';
      }

      await this.sendMessageWithKeyboard(chatId, '🏠 Главное меню:', this.buildAfterDeliveryAttachment()).catch(() => {});
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
      update_types: ['message_created', 'bot_started', 'message_callback', 'bot_stopped'],
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

  // ── Subscription flow ─────────────────────────────────────────────────────
  private buildSubscriptionKeyboard(): any[] {
    return [{
      type: 'inline_keyboard',
      payload: {
        buttons: [[
          { type: 'link', text: 'ПОДПИСАТЬСЯ НА КАНАЛ', url: 'https://max.ru/id503501079307_1_bot?startapp=TL24a54e3010c7' },
          { type: 'callback', text: 'Я ПОДПИСАЛСЯ', payload: 'sub:check' },
        ]],
      },
    }];
  }

  private async checkChannelSubscription(userId: string): Promise<boolean> {
    const channelId = this.configService.get<string>('MAX_CHANNEL_ID');
    if (!channelId) {
      this.logger.warn('[Sub] MAX_CHANNEL_ID not configured — skipping check, granting access');
      return true;
    }
    try {
      const base = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
      const resp = await axios.get(
        `${base}/chats/${channelId}/members?user_ids=${userId}`,
        { headers: { Authorization: this.token }, timeout: 8_000 },
      );
      return Array.isArray(resp.data?.members) && resp.data.members.length > 0;
    } catch (err: any) {
      this.logger.error(`[Sub] Subscription check failed: ${err?.message}`);
      return false;
    }
  }

  private async sendActivationFlow(chatId: string): Promise<void> {
    await this.sendMessage(chatId, 'Коллега, рада вас видеть 👋');

    const introVideoToken = this.configService.get<string>('MAX_INTRO_VIDEO_TOKEN');
    if (introVideoToken) {
      await this.sendMessageWithMarkup(chatId, '', [{
        type: 'video',
        payload: { token: introVideoToken },
      }]).catch((err) => this.logger.warn(`[Start] Failed to send intro video: ${err?.message}`));
    }

    await this.sendMessageWithKeyboard(chatId, SUBSCRIPTION_TEXT, this.buildSubscriptionKeyboard());
  }

  private async handleSubscriptionCheck(userId: string, chatId: string): Promise<void> {
    const isSubscribed = await this.checkChannelSubscription(userId);

    if (!isSubscribed) {
      await this.sendMessageWithKeyboard(
        chatId,
        'Пока не вижу подписку на канал.\n\nЧтобы открыть бесплатный доступ к Преподавай, подпишитесь на канал «Прорыв в репетиторстве», а потом нажмите «Я подписался».',
        this.buildSubscriptionKeyboard(),
      );
      return;
    }

    await this.sendMessage(
      chatId,
      'Готово, доступ открыт ✅\n\nТеперь можете пользоваться Преподавай бесплатно, пока подписаны на канал «Прорыв в репетиторстве».',
    );

    const shadowApiKey = crypto.randomBytes(16).toString('hex');
    const shadowAppUser = await this.prisma.appUser.upsert({
      where: { maxId: userId },
      update: { lastAccessAt: new Date() },
      create: {
        maxId: userId,
        maxChatId: chatId,
        chatId,
        username: `max_${userId}`,
        apiKey: shadowApiKey,
        source: 'max_bot',
      } as any,
    });

    const existingBotUserForSub = await (this.prisma as any).botUser.findUnique({ where: { maxId: userId }, select: { registrationStatus: true } });
    const preservedStatus = existingBotUserForSub && ['linked', 'registered'].includes(existingBotUserForSub.registrationStatus)
      ? existingBotUserForSub.registrationStatus
      : 'subscribed';

    const botUserRecord = await (this.prisma as any).botUser.upsert({
      where: { maxId: userId },
      update: { appUserId: shadowAppUser.id, lastActiveAt: new Date(), registrationStatus: preservedStatus },
      create: {
        maxId: userId,
        appUserId: shadowAppUser.id,
        registrationStatus: 'subscribed',
        source: 'max_bot',
        lastActiveAt: new Date(),
      },
    });

    const text = this.getWelcomeMessage(null, botUserRecord.botCredits);
    await this.sendMessageWithMarkup(chatId, text);

    await this.sendMessage(
      chatId,
      'Как пользоваться:\n\n' +
      '🛠 Создать материал — выберите инструмент (тест, план урока, рабочий лист и др.) или просто напишите запрос своими словами — бот поймёт\n' +
      '📋 Мои генерации — история ваших материалов, можно посмотреть и назначить как ДЗ\n' +
      '📚 Классы — список классов и учеников\n' +
      '📊 Аналитика — прогресс учеников и статистика\n' +
      '🎤 Голосовые сообщения — тоже принимаю\n\n' +
      '💳 1 генерация = 3 токена\n\n' +
      'Попробуйте прямо сейчас — нажмите «🛠 Создать материал»!',
    );

    await this.sendMessageWithKeyboard(chatId, '🏠 Главное меню:', this.buildMainMenuAttachment());
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
    buttons.push([{ type: 'callback', text: '◀ Меню', payload: 'm:menu' }]);
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

  // ── Platform state helper ─────────────────────────────────────────────────
  private getMaxPlatformState(userId: string): MaxPlatformState {
    if (!this.platformStates.has(userId)) {
      this.platformStates.set(userId, {
        genHistoryIds: [], genOffset: 0,
        classes: [], classStudents: [],
        pendingHwGenId: null, pendingHwGenTopic: null,
        pendingHwTarget: null,
        pendingHwClassIdx: null, pendingHwStudentIdx: null,
        pendingViewGenType: null,
      });
    }
    return this.platformStates.get(userId)!;
  }

  // ── Generic backend API caller ────────────────────────────────────────────
  private async callApi(token: string, path: string, method = 'GET', body?: any): Promise<any> {
    const resp = await axios.request({
      method,
      url: `${this.internalApiUrl}/api/${path}`,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body ? { data: body } : {}),
    });
    return resp.data;
  }

  // Получить appUser + authToken или вернуть null (с сообщением об ошибке пользователю)
  private async getAuthForUser(userId: string, chatId?: string): Promise<{ appUser: any; token: string } | null> {
    const appUser = await this.prisma.appUser.findUnique({ where: { maxId: userId } }) as any;
    if (!appUser) {
      if (chatId) await this.sendMessage(chatId, '❌ Аккаунт не найден. Используйте /start.');
      return null;
    }
    const apiKey = await this.ensureApiKey(appUser);
    const token = await this.getApiToken(appUser.username, apiKey);
    if (!token) {
      if (chatId) await this.sendMessage(chatId, '❌ Ошибка авторизации. Попробуйте позже.');
      return null;
    }
    return { appUser, token };
  }

  // ── Main menu ─────────────────────────────────────────────────────────────
  private async showMainMenu(chatId: string, userId: string): Promise<void> {
    const botUser = await (this.prisma as any).botUser.findUnique({
      where: { maxId: userId }, select: { botCredits: true },
    });
    const sub = await this.prisma.appUser.findUnique({
      where: { maxId: userId }, select: { id: true },
    });
    let balance: number | null = null;
    if (sub?.id) {
      const userSub = await this.prisma.userSubscription.findUnique({ where: { userId: sub.id } });
      if (userSub?.status === 'active') {
        balance = userSub.creditsBalance + userSub.extraCredits;
      }
    }
    if (balance === null) balance = botUser?.botCredits ?? null;
    const balanceLine = balance !== null ? `\n💳 Токенов: ${balance}` : '';
    await this.sendMessageWithKeyboard(
      chatId,
      `🏠 Главное меню${balanceLine}`,
      this.buildMainMenuAttachment(),
    );
  }

  private buildMainMenuAttachment(): any[] {
    const webAppUrl = this.configService.get<string>('WEBAPP_URL', 'https://prepodavai.ru');
    return [{
      type: 'inline_keyboard',
      payload: {
        buttons: [
          [{ type: 'callback', text: '🛠 Создать материал', payload: 'm:tools' }],
          [
            { type: 'callback', text: '📋 Мои генерации', payload: 'm:hist:0' },
            { type: 'callback', text: '📚 Классы', payload: 'm:classes' },
          ],
          [{ type: 'callback', text: '📊 Аналитика', payload: 'm:analytics' }],
          [{ type: 'link', text: '📱 Открыть сайт', url: `${webAppUrl}/dashboard` }],
        ],
      },
    }];
  }

  private buildAfterDeliveryAttachment(): any[] {
    return [{
      type: 'inline_keyboard',
      payload: {
        buttons: [
          [
            { type: 'callback', text: '📚 Назначить как ДЗ', payload: 'hw:who' },
            { type: 'callback', text: '📋 Мои генерации', payload: 'm:hist:0' },
          ],
          [{ type: 'callback', text: '🛠 Создать ещё', payload: 'm:tools' }],
        ],
      },
    }];
  }

  // ── NL-interface helpers ──────────────────────────────────────────────────
  private looksLikeNlRequest(text: string): boolean {
    return /^(сгенерируй|создай|сделай|составь|сделайте|создайте|сгенерируйте|составьте|хочу создать|хочу сгенерировать|мне нужн|придумай|подготовь|генерируй|покажи|посмотреть|сколько|мой баланс|мои токены|отмени|стоп$|хватит$|аналитика|статистика|главное меню|инструменты|что умеешь|что можешь|выдать|назначить|задать дом)/i.test(text.trim()) &&
      text.trim().length > 3;
  }

  private nlNavFallback(text: string): NlParsedRequest {
    const t = text.toLowerCase();
    if (/история|мои ген|покажи ген|что я создавал|мои работы|мои материалы/.test(t)) return { action: 'show_history' };
    if (/выдать|домашнее задание|задать дом|назначить задание/.test(t)) {
      const target: 'student' | 'class' = /ученик|ученице|ученику|ученика/.test(t) ? 'student' : 'class';
      return { action: 'assign_homework', target };
    }
    if (/мои классы|список классов|посмотреть классы|мои ученики/.test(t)) return { action: 'show_classes' };
    if (/баланс|токен|сколько осталось|мой счёт|остаток/.test(t)) return { action: 'show_balance' };
    if (/главное меню|^меню$|на главную|домой|в начало|назад в меню/.test(t)) return { action: 'show_menu' };
    if (/инструменты|что умеешь|что можешь|доступные функции|список инструм/.test(t)) return { action: 'show_tools' };
    if (/аналитика|статистика|в риске|на проверку|дедлайн|успеваемость/.test(t)) return { action: 'show_analytics' };
    if (/^отмени|^стоп$|^хватит$|не надо/.test(t)) return { action: 'cancel' };
    if (/регистр|зарегистр|создать аккаунт|создай аккаунт/.test(t)) return { action: 'register' };
    return { action: 'unknown' };
  }

  private async transcribeVoice(audioUrl: string): Promise<string | null> {
    const replicateToken = this.configService.get<string>('REPLICATE_API_TOKEN') || '';
    if (!replicateToken) return null;
    try {
      // Скачиваем аудио сами — надёжнее, чем давать URL Replicate
      const dlResp = await axios.get<Buffer>(audioUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
      });
      const base64Audio = `data:audio/ogg;base64,${Buffer.from(dlResp.data).toString('base64')}`;

      const res = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${replicateToken}`,
          'Content-Type': 'application/json',
          Prefer: 'wait',
        },
        body: JSON.stringify({
          version: '8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e',
          input: { audio: base64Audio, language: 'ru', transcription: 'plain text' },
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        this.logger.error(`[Voice] Replicate error ${res.status}: ${errText.slice(0, 200)}`);
        return null;
      }
      const data: any = await res.json();
      const out = data.output;
      const transcript = typeof out === 'string'
        ? out
        : (out?.transcription ?? out?.text ?? (Array.isArray(out) ? out.join('') : ''));
      return transcript.trim() || null;
    } catch (err: any) {
      this.logger.error(`[Voice] transcribeVoice error: ${err?.message}`);
      return null;
    }
  }

  private async parseNlRequest(text: string): Promise<NlParsedRequest> {
    const input = text.trim().slice(0, 300);
    const replicateToken = this.configService.get<string>('REPLICATE_API_TOKEN') || '';
    if (!replicateToken) return this.nlNavFallback(input);

    const prompt =
      'Ты классифицируешь запросы учителя для бота «Преподавай». Верни ТОЛЬКО JSON без пояснений.\n\n' +
      'Форматы ответа:\n' +
      '{"action":"generate","tool":"<key>","params":{<только найденные поля>}}\n' +
      '{"action":"show_history"}\n' +
      '{"action":"show_classes"}\n' +
      '{"action":"assign_homework","target":"class","dueDate":"YYYY-MM-DD"}\n' +
      '{"action":"show_balance"}\n' +
      '{"action":"show_menu"}\n' +
      '{"action":"show_tools"}\n' +
      '{"action":"show_analytics"}\n' +
      '{"action":"cancel"}\n' +
      '{"action":"register"}\n' +
      '{"action":"unknown"}\n\n' +
      'Инструменты:\n' +
      'worksheet: рабочий лист. subject?(предмет), topic(тема), level("Младшие классы"|"Средняя школа"|"Старшие классы"|"Взрослые"|"Подготовка к ОГЭ"|"Подготовка к ЕГЭ"|"Студенты вузов"), questionsCount("5"|"10"|"15"|"20")\n' +
      'quiz: тест. subject?, topic, level("1 Класс"..."11 Класс"), questionsCount("5"|"10"|"15"|"20"|"25"), answersCount("2"|"3"|"4")\n' +
      'vocabulary: словарь. topic, language("ru"|"en"|"de"|"fr"|"es"|"it"|"zh"|"ko"|"ja"|"ar"), wordsCount("5"|"10"|"15"|"20"|"25"|"30")\n' +
      'lesson-plan: план урока. subject?, topic, level("5 Класс"|"6 Класс"|"7 Класс"|"8 Класс"|"Старшая Школа"), duration("30"|"45"|"90"), style("Интерактивный"|"Лекция")\n' +
      'lesson-preparation: Вау-урок. subject?, topic, level("1"..."11"), interests?, depth("short"|"standard"|"deep")\n' +
      'image: изображение. prompt(описание), style("realistic"|"cartoon"|"sketch"|"illustration"|"3d-model"|"anime")\n' +
      'game: игра. type("millionaire"|"flashcards"|"crossword"|"memory"|"truefalse"), topic\n' +
      'presentation: презентация. topic, duration("5"|"15"|"30"|"45"), style("modern"|"academic"|"creative"|"corporate"), targetAudience("students"|"colleagues"|"parents"|"general")\n\n' +
      'Правило: включай в params только поля явно упомянутые в запросе. Значения select строго из списка.\n' +
      'Для assign_homework: target="student" если упомянут ученик/ему, target="class" если класс (по умолчанию "class"). dueDate — дата в ISO (YYYY-MM-DD) если явно указана, иначе не включай.\n' +
      'Примеры триггеров:\n' +
      'generate: "создай тест", "придумай задание", "сделай рабочий лист", "составь план урока", "хочу тест по математике", "нужен кроссворд", "подготовь словарный диктант", "сгенерируй игру", "сделай словарь"\n' +
      'show_history: "мои генерации", "история", "что я создавал", "покажи мои работы", "мои материалы"\n' +
      'show_classes: "мои классы", "список классов", "мои ученики", "покажи классы"\n' +
      'assign_homework: "выдать дз", "задать домашнее", "назначить задание", "отправить задание ученику"\n' +
      'show_balance: "баланс", "сколько токенов", "мой счёт", "сколько у меня", "остаток токенов", "сколько осталось", "мои токены"\n' +
      'show_menu: "главное меню", "меню", "домой", "на главную", "в начало", "назад в меню"\n' +
      'show_tools: "список инструментов", "что умеешь", "что можешь", "покажи инструменты", "доступные функции", "что есть"\n' +
      'show_analytics: "аналитика", "статистика", "кто в риске", "работы на проверку", "дедлайны", "успеваемость"\n' +
      'cancel: "отмени", "отменить", "стоп", "хватит", "не надо", "выйти"\n' +
      'register: "регистрация", "зарегистрироваться", "создать аккаунт", "пройти регистрацию", "хочу зарегистрироваться", "регистрируюсь"\n\n' +
      `Запрос: «${input}»`;

    try {
      const res = await fetch('https://api.replicate.com/v1/models/google/gemini-3-flash/predictions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${replicateToken}`, 'Content-Type': 'application/json', Prefer: 'wait' },
        body: JSON.stringify({ input: { prompt, max_new_tokens: 200, temperature: 0 } }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return this.nlNavFallback(input);

      const data: any = await res.json();
      const raw: string = Array.isArray(data.output) ? data.output.join('') : (data.output ?? '');
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return this.nlNavFallback(input);

      let parsed: any;
      try { parsed = JSON.parse(jsonMatch[0]); } catch { return this.nlNavFallback(input); }

      if (!parsed.action) return { action: 'unknown' };
      if (['show_history', 'show_classes', 'show_balance', 'show_menu', 'show_tools', 'show_analytics', 'cancel', 'register', 'unknown'].includes(parsed.action)) return { action: parsed.action };

      if (parsed.action === 'assign_homework') {
        const target: 'student' | 'class' = parsed.target === 'student' ? 'student' : 'class';
        const dueDate = typeof parsed.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dueDate)
          ? parsed.dueDate : undefined;
        return { action: 'assign_homework', target, dueDate };
      }

      if (parsed.action === 'generate') {
        const tool = getToolConfig(parsed.tool);
        if (!tool) return { action: 'unknown' };
        const validParams: Record<string, string> = {};
        for (const field of tool.fields) {
          if (field.type === 'multiselect') continue;
          const val = parsed.params?.[field.key];
          if (val === undefined || val === null) continue;
          const strVal = String(val).trim().slice(0, field.maxLength);
          if (!strVal) continue;
          if (field.type === 'select' && field.options) {
            if (!field.options.some(o => o.value === strVal)) continue;
          }
          validParams[field.key] = strVal;
        }
        return { action: 'generate', tool: parsed.tool, params: validParams };
      }

      return { action: 'unknown' };
    } catch {
      return this.nlNavFallback(input);
    }
  }

  private buildNlConfirmMessage(parsed: NlParsedRequest): string {
    if (parsed.action === 'generate' && parsed.tool) {
      const tool = getToolConfig(parsed.tool);
      if (!tool) return 'Не совсем понял запрос.';
      const lines: string[] = [`Понял! Вот что создам:\n\n${tool.emoji} ${tool.label}`];
      for (const field of tool.fields) {
        if (field.type === 'multiselect') continue;
        const fieldLabel = field.label.split('\n')[0];
        const detectedVal = parsed.params?.[field.key];
        if (detectedVal !== undefined) {
          const display = field.options?.find(o => o.value === detectedVal)?.label ?? detectedVal;
          lines.push(`• ${fieldLabel}: ${display}`);
        } else if (field.default !== undefined) {
          const display = field.options?.find(o => o.value === field.default)?.label ?? field.default;
          lines.push(`• ${fieldLabel}: ${display} (по умолч.)`);
        }
      }
      const missingRequired = tool.fields.filter(
        f => f.type !== 'multiselect' && f.required && parsed.params?.[f.key] === undefined && f.default === undefined,
      );
      if (missingRequired.length > 0) {
        lines.push(`\nУточню дополнительно: ${missingRequired.map(f => f.label.split('\n')[0]).join(', ')}`);
      }
      lines.push('\nВсё верно?');
      return lines.join('\n');
    }
    if (parsed.action === 'assign_homework') {
      const targetLabel = parsed.target === 'student' ? 'ученику' : 'классу';
      const dueLine = parsed.dueDate
        ? `\nСрок: ${new Date(parsed.dueDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`
        : '';
      return `Правильно понял? Хотите выдать задание ${targetLabel}.${dueLine}`;
    }
    const navMessages: Record<string, string> = {
      show_history: 'Правильно понял? Хотите посмотреть историю своих генераций.',
      show_classes: 'Правильно понял? Хотите посмотреть свои классы и учеников.',
      show_balance: 'Правильно понял? Хотите посмотреть баланс токенов.',
      show_menu: 'Правильно понял? Хотите перейти в главное меню.',
      show_tools: 'Правильно понял? Хотите посмотреть список инструментов.',
      show_analytics: 'Правильно понял? Хотите посмотреть аналитику по классам.',
      cancel: 'Правильно понял? Хотите отменить текущее действие и вернуться в меню.',
      register: 'Правильно понял? Хотите зарегистрироваться на сайте Преподавай.',
    };
    return navMessages[parsed.action] ?? 'Не совсем понял запрос.';
  }

  private async startNlGenSession(chatId: string, userId: string, toolKey: string, prefilledParams: Record<string, string>): Promise<void> {
    const tool = getToolConfig(toolKey);
    if (!tool) return;
    let session: GenSession;
    try {
      session = this.createGenSession(userId, toolKey);
    } catch (e: any) {
      await this.sendMessage(chatId, `⚠️ ${e.message}`);
      return;
    }
    for (const [key, val] of Object.entries(prefilledParams)) {
      session.params[key] = val;
    }
    for (const field of tool.fields) {
      if (session.params[field.key] === undefined && field.default !== undefined) {
        session.params[field.key] = field.default;
      }
    }
    await this.nextStep(chatId, session, tool);
  }

  // ── History ───────────────────────────────────────────────────────────────
  private async showHistory(chatId: string, userId: string, offset: number, editMessageId?: string): Promise<void> {
    const auth = await this.getAuthForUser(userId, chatId);
    if (!auth) return;

    const PAGE = MaxService.GEN_HISTORY_PAGE_SIZE;
    let data: any;
    try {
      data = await this.callApi(auth.token, `generate/history?limit=${PAGE}&offset=${offset}`);
    } catch {
      await this.sendMessage(chatId, '❌ Не удалось загрузить историю. Попробуйте позже.');
      return;
    }

    const gens: any[] = data.generations ?? [];
    const total: number = data.total ?? 0;
    const state = this.getMaxPlatformState(userId);
    state.genHistoryIds = gens.map((g: any) => g.id);
    state.genOffset = offset;

    if (!gens.length) {
      await this.sendMessageWithKeyboard(
        chatId,
        offset === 0
          ? '📋 Генераций пока нет. Создайте первую!'
          : '📋 Больше генераций нет.',
        this.buildMainMenuAttachment(),
      );
      return;
    }

    const typeEmoji: Record<string, string> = {
      worksheet: '📄', quiz: '📝', vocabulary: '📖', 'lesson-plan': '📋',
      'lesson-preparation': '✨', image: '🖼️', game_generation: '🎮', presentation: '📊',
    };
    const lines = gens.map((g: any, i: number) => {
      const emoji = typeEmoji[g.type] || '📄';
      const params = (typeof g.params === 'object' && g.params) ? g.params : {};
      const topic = (params.topic || params.subject || params.lessonTopic || '').slice(0, 28);
      const date = g.createdAt
        ? new Date(g.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
        : '';
      return `${offset + i + 1}. ${emoji} ${topic || g.generationType}${date ? ' · ' + date : ''}`;
    });

    const header = total > PAGE
      ? `📋 Генерации (${offset + 1}–${Math.min(offset + PAGE, total)} из ${total}):`
      : '📋 Мои генерации:';

    const numLabels = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
    const numButtons = gens.map((_, i) => ({
      type: 'callback', text: numLabels[i] ?? `${i + 1}`, payload: `m:gen:${i}`,
    }));

    const navRow: any[] = [];
    if (offset > 0) navRow.push({ type: 'callback', text: '◀ Назад', payload: `m:hist:${offset - PAGE}` });
    if (offset + PAGE < total) navRow.push({ type: 'callback', text: 'Вперёд ▶', payload: `m:hist:${offset + PAGE}` });

    const buttons: any[][] = [numButtons];
    if (navRow.length) buttons.push(navRow);
    buttons.push([{ type: 'callback', text: '◀ Меню', payload: 'm:menu' }]);

    const msgText = `${header}\n\n${lines.join('\n')}\n\nНажмите номер для деталей.`;
    const msgAttachments = [{ type: 'inline_keyboard', payload: { buttons } }];

    if (editMessageId) {
      await this.editMessageKeyboard(editMessageId, msgText, msgAttachments).catch(() =>
        this.sendMessageWithKeyboard(chatId, msgText, msgAttachments),
      );
    } else {
      await this.sendMessageWithKeyboard(chatId, msgText, msgAttachments);
    }
  }

  private async showGenDetail(chatId: string, userId: string, idx: number): Promise<void> {
    const state = this.getMaxPlatformState(userId);
    const genId = state.genHistoryIds[idx];
    if (!genId) {
      await this.sendMessage(chatId, '❌ Генерация не найдена. Обновите список.');
      return;
    }

    // Загружаем полные данные генерации чтобы получить тему для создания урока
    const auth = await this.getAuthForUser(userId, chatId);
    if (!auth) return;

    let topic = '';
    let genLabel = '';
    let genGameUrl: string | null = null;
    try {
      const data = await this.callApi(auth.token, `generate/history?limit=1&offset=${state.genOffset + idx}`);
      const gen = data.generations?.[0];
      if (gen) {
        const params = (typeof gen.params === 'object' && gen.params) ? gen.params : {};
        topic = (params.topic || params.subject || params.lessonTopic || params.theme || '').slice(0, 60);
        genLabel = gen.type || '';
        if (genLabel === 'game_generation') {
          genGameUrl = gen.result?.gameUrl || gen.result?.url || null;
        }
      }
    } catch {
      // fallback — назначение всё равно сработает, тема будет пустой
    }

    state.pendingHwGenId = genId;
    state.pendingHwGenTopic = topic || genLabel || 'Материал из MAX';
    state.pendingViewGenType = genLabel;
    state.pendingGameUrl = genGameUrl;

    const displayTopic = topic || genLabel || 'Генерация';
    await this.sendMessageWithKeyboard(
      chatId,
      `📄 ${displayTopic}\n\nЧто сделать с этой генерацией?`,
      [{
        type: 'inline_keyboard',
        payload: {
          buttons: [
            [
              { type: 'callback', text: '👁 Посмотреть', payload: 'm:gview' },
              { type: 'callback', text: '📚 Назначить как ДЗ', payload: 'hw:who' },
            ],
            [
              { type: 'callback', text: '◀ К списку', payload: `m:hist:${state.genOffset}` },
              { type: 'callback', text: '◀ Меню', payload: 'm:menu' },
            ],
          ],
        },
      }],
    );
  }

  // ── Classes ───────────────────────────────────────────────────────────────
  private async showClasses(chatId: string, userId: string): Promise<void> {
    const auth = await this.getAuthForUser(userId, chatId);
    if (!auth) return;

    let classes: any[];
    try {
      classes = await this.callApi(auth.token, 'classes');
    } catch {
      await this.sendMessage(chatId, '❌ Не удалось загрузить классы. Попробуйте позже.');
      return;
    }

    const state = this.getMaxPlatformState(userId);
    state.classes = (classes ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      studentCount: c._count?.students ?? c.students?.length ?? 0,
    }));

    if (!state.classes.length) {
      await this.sendMessageWithKeyboard(
        chatId,
        '📚 У вас нет классов.\n\nСоздайте класс на сайте prepodavai.ru и пригласите учеников.',
        this.buildMainMenuAttachment(),
      );
      return;
    }

    const lines = state.classes.map((c, i) => `${i + 1}. ${c.name} — ${c.studentCount} уч.`).join('\n');

    const buttons: any[][] = [];
    let row: any[] = [];
    state.classes.forEach((c, i) => {
      if (i > 0 && i % 2 === 0) { buttons.push(row); row = []; }
      row.push({ type: 'callback', text: `${c.name} · ${c.studentCount} уч.`.slice(0, 20), payload: `m:cls:${i}` });
    });
    if (row.length) buttons.push(row);
    buttons.push([{ type: 'callback', text: '◀ Меню', payload: 'm:menu' }]);

    await this.sendMessageWithKeyboard(
      chatId,
      `📚 Мои классы:\n\n${lines}`,
      [{ type: 'inline_keyboard', payload: { buttons } }],
    );
  }

  private async showClassDetail(chatId: string, userId: string, idx: number): Promise<void> {
    const state = this.getMaxPlatformState(userId);
    const cls = state.classes[idx];
    if (!cls) {
      await this.sendMessage(chatId, '❌ Класс не найден. Обновите список кнопкой «📚 Классы».');
      return;
    }

    const auth = await this.getAuthForUser(userId, chatId);
    if (!auth) return;

    let classData: any;
    try {
      classData = await this.callApi(auth.token, `classes/${cls.id}`);
    } catch {
      await this.sendMessage(chatId, '❌ Не удалось загрузить данные класса.');
      return;
    }

    const students: any[] = classData.students ?? [];
    state.classStudents = students.slice(0, 50).map((s: any) => ({ id: s.id, name: s.name }));

    if (!students.length) {
      await this.sendMessageWithKeyboard(
        chatId,
        `📚 ${cls.name} — учеников нет.\n\nПригласите учеников через сайт prepodavai.ru.`,
        [{ type: 'inline_keyboard', payload: { buttons: [[{ type: 'callback', text: '◀ Классы', payload: 'm:classes' }]] } }],
      );
      return;
    }

    // Загружаем аналитику рисков (B4)
    const riskMap: Record<string, 'risk' | 'watch' | 'good'> = {};
    try {
      const analytics = await this.callApi(auth.token, `classes/${cls.id}/analytics`);
      for (const s of analytics?.studentBreakdown ?? []) {
        riskMap[s.id] = s.riskLevel ?? 'good';
      }
    } catch { /* аналитика опциональна */ }

    const riskIcon = (id: string) => riskMap[id] === 'risk' ? ' 🔴' : riskMap[id] === 'watch' ? ' 🟡' : '';
    const hasRisk = Object.values(riskMap).some(v => v === 'risk' || v === 'watch');

    const shown = students.slice(0, 50);
    const overflowNote = students.length > 50 ? `\n_Показаны первые 50 из ${students.length} учеников_` : '';
    const lines = shown.map((s: any, i: number) => `${i + 1}. ${s.name}${riskIcon(s.id)}`).join('\n');
    const legend = hasRisk ? '\n\n🔴 риск  🟡 внимание' : '';

    await this.sendMessageWithKeyboard(
      chatId,
      `📚 ${cls.name} — ${students.length} уч.:\n\n${lines}${legend}${overflowNote}`,
      [{ type: 'inline_keyboard', payload: { buttons: [
        [{ type: 'callback', text: '📚 Выдать задание классу', payload: `m:cgp:${idx}` }],
        [{ type: 'callback', text: '◀ Классы', payload: 'm:classes' }],
      ]}}],
    );
  }

  // ── Class gen picker (B3) ─────────────────────────────────────────────────
  private async showClassGenPicker(chatId: string, userId: string, classIdx: number): Promise<void> {
    const state = this.getMaxPlatformState(userId);
    const cls = state.classes[classIdx];
    if (!cls) {
      await this.sendMessage(chatId, '❌ Класс не найден. Обновите список кнопкой «📚 Классы».');
      return;
    }

    const auth = await this.getAuthForUser(userId, chatId);
    if (!auth) return;

    let gens: any[];
    try {
      const data = await this.callApi(auth.token, 'generate/history?limit=10&offset=0');
      gens = (data.generations ?? []).filter((g: any) => g.status === 'completed');
    } catch {
      await this.sendMessage(chatId, '❌ Не удалось загрузить генерации. Попробуйте позже.');
      return;
    }

    if (!gens.length) {
      await this.sendMessageWithKeyboard(
        chatId,
        '❌ Нет завершённых генераций. Сначала создайте материал.',
        [{ type: 'inline_keyboard', payload: { buttons: [
          [{ type: 'callback', text: '🛠 Создать материал', payload: 'm:tools' }],
          [{ type: 'callback', text: '◀ Назад', payload: `m:cls:${classIdx}` }],
        ]}}],
      );
      return;
    }

    state.pendingHwClassIdx = classIdx;
    state.pendingHwTarget = 'class';
    state.classGenList = gens.slice(0, 10).map((g: any) => {
      const p = (typeof g.params === 'object' && g.params) ? g.params as Record<string, any> : {};
      const topic = (p.topic || p.subject || p.lessonTopic || p.theme || '').toString().slice(0, 40);
      return { id: g.id, type: g.type || '', topic };
    });

    const typeEmoji: Record<string, string> = {
      worksheet: '📄', quiz: '📝', vocabulary: '📖', 'lesson-plan': '📋',
      'lesson-preparation': '✨', image: '🖼️', game_generation: '🎮', presentation: '📊',
    };

    const lines = state.classGenList.map((g, i) => {
      const emoji = typeEmoji[g.type] || '📄';
      return `${i + 1}. ${emoji} ${g.topic || g.type}`;
    });

    const numLabels = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const numButtons: any[] = [];
    let row: any[] = [];
    state.classGenList.forEach((_, i) => {
      if (i > 0 && i % 5 === 0) { numButtons.push(row); row = []; }
      row.push({ type: 'callback', text: numLabels[i] ?? `${i + 1}`, payload: `hw:cg:${i}` });
    });
    if (row.length) numButtons.push(row);
    numButtons.push([{ type: 'callback', text: '◀ Назад', payload: `m:cls:${classIdx}` }]);

    await this.sendMessageWithKeyboard(
      chatId,
      `📚 Выберите материал для ${cls.name}:\n\n${lines.join('\n')}`,
      [{ type: 'inline_keyboard', payload: { buttons: numButtons } }],
    );
  }

  private async pickClassGen(chatId: string, userId: string, genIdx: number): Promise<void> {
    const state = this.getMaxPlatformState(userId);
    const gen = state.classGenList?.[genIdx];
    if (!gen) {
      await this.sendMessage(chatId, '❌ Генерация не найдена. Попробуйте ещё раз.');
      return;
    }

    state.pendingHwGenId = gen.id;
    state.pendingHwGenTopic = gen.topic || gen.type || 'Материал из MAX';
    state.pendingViewGenType = gen.type;

    await this.sendMessageWithKeyboard(chatId, '📅 Выберите срок сдачи:', this.buildDueDateAttachment());
  }

  // ── Homework assignment ───────────────────────────────────────────────────
  private async showHwWho(chatId: string, userId: string): Promise<void> {
    const state = this.getMaxPlatformState(userId);
    if (!state.pendingHwGenId) {
      await this.sendMessage(chatId, '❌ Сначала выберите генерацию из списка.');
      await this.showHistory(chatId, userId, 0);
      return;
    }
    await this.sendMessageWithKeyboard(chatId, '📚 Кому назначить задание?', [{
      type: 'inline_keyboard',
      payload: {
        buttons: [
          [
            { type: 'callback', text: '👥 Классу', payload: 'hw:wc' },
            { type: 'callback', text: '👤 Ученику', payload: 'hw:ws' },
          ],
          [{ type: 'callback', text: '❌ Отмена', payload: 'm:menu' }],
        ],
      },
    }]);
  }

  private async showHwClassPicker(chatId: string, userId: string, mode: 'class' | 'student'): Promise<void> {
    const state = this.getMaxPlatformState(userId);
    state.pendingHwTarget = mode;

    if (!state.classes.length) {
      const auth = await this.getAuthForUser(userId, chatId);
      if (!auth) return;
      try {
        const classes = await this.callApi(auth.token, 'classes');
        state.classes = (classes ?? []).map((c: any) => ({
          id: c.id, name: c.name,
          studentCount: c._count?.students ?? 0,
        }));
      } catch {
        await this.sendMessage(chatId, '❌ Не удалось загрузить классы.');
        return;
      }
    }

    if (!state.classes.length) {
      await this.sendMessage(chatId, '❌ Классов нет. Создайте класс на сайте prepodavai.ru.');
      return;
    }

    const payloadPrefix = mode === 'class' ? 'hw:c' : 'hw:sc';
    const buttons: any[][] = [];
    let row: any[] = [];
    state.classes.forEach((c, i) => {
      if (i > 0 && i % 2 === 0) { buttons.push(row); row = []; }
      row.push({ type: 'callback', text: `${c.name} · ${c.studentCount} уч.`.slice(0, 20), payload: `${payloadPrefix}:${i}` });
    });
    if (row.length) buttons.push(row);
    buttons.push([{ type: 'callback', text: '❌ Отмена', payload: 'm:menu' }]);

    const prompt = mode === 'class' ? 'Выберите класс:' : 'Выберите класс (для выбора ученика):';
    await this.sendMessageWithKeyboard(chatId, prompt, [{ type: 'inline_keyboard', payload: { buttons } }]);
  }

  private async showHwStudentList(chatId: string, userId: string, classIdx: number): Promise<void> {
    const state = this.getMaxPlatformState(userId);
    const cls = state.classes[classIdx];
    if (!cls) {
      await this.sendMessage(chatId, '❌ Класс не найден.');
      return;
    }
    state.pendingHwClassIdx = classIdx;

    const auth = await this.getAuthForUser(userId, chatId);
    if (!auth) return;

    let classData: any;
    try {
      classData = await this.callApi(auth.token, `classes/${cls.id}`);
    } catch {
      await this.sendMessage(chatId, '❌ Не удалось загрузить учеников.');
      return;
    }

    const students: any[] = (classData.students ?? []).slice(0, 50);
    state.classStudents = students.map((s: any) => ({ id: s.id, name: s.name }));

    if (!students.length) {
      await this.sendMessage(chatId, `❌ В классе ${cls.name} нет учеников.`);
      return;
    }

    const buttons: any[][] = students.map((s: any, i: number) => ([
      { type: 'callback', text: s.name.slice(0, 28), payload: `hw:s:${i}` },
    ]));
    buttons.push([{ type: 'callback', text: '❌ Отмена', payload: 'm:menu' }]);

    await this.sendMessageWithKeyboard(
      chatId,
      `Выберите ученика из ${cls.name}:`,
      [{ type: 'inline_keyboard', payload: { buttons } }],
    );
  }

  private buildDueDateAttachment(): any[] {
    const fmt = (days: number) => {
      const d = new Date(Date.now() + days * 86_400_000);
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    };
    return [{
      type: 'inline_keyboard',
      payload: {
        buttons: [
          [
            { type: 'callback', text: `Завтра, ${fmt(1)}`, payload: 'hw:d:1' },
            { type: 'callback', text: `${fmt(3)}`, payload: 'hw:d:3' },
          ],
          [
            { type: 'callback', text: `${fmt(7)}`, payload: 'hw:d:7' },
            { type: 'callback', text: `${fmt(14)}`, payload: 'hw:d:14' },
          ],
          [{ type: 'callback', text: 'Без срока', payload: 'hw:d:0' }],
        ],
      },
    }];
  }

  private async doAssignHomework(chatId: string, userId: string, daysUntilDue: number): Promise<void> {
    const state = this.getMaxPlatformState(userId);
    const { pendingHwGenId, pendingHwTarget, pendingHwClassIdx, pendingHwStudentIdx } = state;

    if (!pendingHwGenId || !pendingHwTarget || pendingHwClassIdx === null) {
      await this.sendMessage(chatId, '❌ Нет данных для назначения. Начните заново.');
      return;
    }

    const auth = await this.getAuthForUser(userId, chatId);
    if (!auth) return;

    const cls = state.classes[pendingHwClassIdx];
    if (!cls) { await this.sendMessage(chatId, '❌ Класс не найден.'); return; }

    let assignTarget: Record<string, string>;
    let targetLabel: string;

    if (pendingHwTarget === 'class') {
      assignTarget = { classId: cls.id };
      targetLabel = `класс ${cls.name}`;
    } else {
      if (pendingHwStudentIdx === null || !state.classStudents[pendingHwStudentIdx]) {
        await this.sendMessage(chatId, '❌ Ученик не найден.');
        return;
      }
      const student = state.classStudents[pendingHwStudentIdx];
      assignTarget = { studentId: student.id };
      targetLabel = student.name;
    }

    const dueDate = daysUntilDue > 0
      ? new Date(Date.now() + daysUntilDue * 86_400_000).toISOString()
      : undefined;

    const topicTitle = state.pendingHwGenTopic || 'Материал из MAX';

    try {
      // Создаём урок (backend требует lessonId в assignments)
      const lesson = await this.callApi(auth.token, 'lessons', 'POST', { topic: topicTitle });
      if (!lesson?.id) throw new Error('Lesson creation returned no id');

      await this.callApi(auth.token, 'assignments', 'POST', {
        lessonId: lesson.id,
        generationId: pendingHwGenId,
        ...assignTarget,
        ...(dueDate ? { dueDate } : {}),
      });

      // Сбрасываем состояние
      state.pendingHwGenId = null;
      state.pendingHwGenTopic = null;
      state.pendingHwTarget = null;
      state.pendingHwClassIdx = null;
      state.pendingHwStudentIdx = null;

      const dueDateStr = dueDate
        ? `\n📅 Срок: ${new Date(dueDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`
        : '\n📅 Без срока';

      await this.sendMessageWithKeyboard(
        chatId,
        `✅ Задание назначено!\n\n${pendingHwTarget === 'class' ? '👥' : '👤'} ${targetLabel}${dueDateStr}`,
        this.buildMainMenuAttachment(),
      );
    } catch (err: any) {
      this.logger.error(`[HW] Assignment failed for userId=${userId}: ${err?.message}`);
      await this.sendMessage(chatId, '❌ Не удалось назначить задание. Попробуйте позже.');
      await this.sendMessageWithKeyboard(chatId, '🏠 Главное меню:', this.buildMainMenuAttachment());
    }
  }

  // ── Analytics ─────────────────────────────────────────────────────────────
  private async showAnalytics(chatId: string, userId: string): Promise<void> {
    const auth = await this.getAuthForUser(userId, chatId);
    if (!auth) return;

    let overview: any;
    try {
      overview = await this.callApi(auth.token, 'analytics/teacher-overview');
    } catch {
      await this.sendMessage(chatId, '❌ Не удалось загрузить аналитику. Попробуйте позже.');
      return;
    }

    const pending = overview.pendingGrading?.total ?? 0;
    const pendingByClass: any[] = overview.pendingGrading?.byClass ?? [];
    const riskCount = overview.atRisk?.riskCount ?? 0;
    const watchCount = overview.atRisk?.watchCount ?? 0;
    const samples: any[] = overview.atRisk?.samples ?? [];
    const todayCount = overview.schedule?.todayCount ?? 0;
    const deadlines = overview.upcoming?.deadlinesIn7Days ?? 0;

    const lines: string[] = ['📊 Аналитика\n'];
    lines.push(`📝 Ждут проверки: ${pending}`);
    for (const p of pendingByClass.slice(0, 3)) {
      lines.push(`  • ${p.className}: ${p.pending}`);
    }
    lines.push(`\n👥 Под наблюдением: 🔴 ${riskCount} риск, 🟡 ${watchCount} внимание`);
    for (const s of samples.slice(0, 3)) {
      const icon = s.level === 'risk' ? '🔴' : '🟡';
      lines.push(`  ${icon} ${s.name} (${s.className})${s.avgGrade !== null ? ` — ср. ${s.avgGrade}` : ''}`);
    }
    lines.push(`\n📅 Уроков сегодня: ${todayCount}`);
    lines.push(`⏰ Дедлайны (7 дней): ${deadlines}`);

    await this.sendMessageWithKeyboard(chatId, lines.join('\n'), this.buildMainMenuAttachment());
  }

  // ── View generation content ───────────────────────────────────────────────
  private async showGenContent(chatId: string, userId: string): Promise<void> {
    const state = this.getMaxPlatformState(userId);
    const genId = state.pendingHwGenId;
    if (!genId) {
      await this.sendMessage(chatId, '❌ Нет выбранной генерации. Выберите из списка.');
      await this.showHistory(chatId, userId, 0);
      return;
    }

    const auth = await this.getAuthForUser(userId, chatId);
    if (!auth) return;

    const genType = state.pendingViewGenType || '';
    const caption = state.pendingHwGenTopic || genType || 'Материал';

    // Games — show cached link (cached in showGenDetail, avoids wrong-offset re-fetch)
    if (genType === 'game_generation') {
      const gameUrl = state.pendingGameUrl ?? null;
      if (gameUrl) {
        await this.sendMessageWithKeyboard(chatId, '🎮 Игра готова!', [{
          type: 'inline_keyboard',
          payload: { buttons: [[{ type: 'link', text: '🎮 Открыть игру', url: gameUrl }]] },
        }]);
      } else {
        await this.sendMessage(chatId, '❌ URL игры не найден. Попробуйте открыть на сайте prepodavai.ru');
      }
      return;
    }

    await this.sendMessage(chatId, '⏳ Готовлю файл...');
    const PDF_TIMEOUT = 90_000;

    // Images
    if (['image_generation', 'photosession', 'image'].includes(genType)) {
      try {
        const resp = await axios.get(
          `${this.internalApiUrl}/api/generate/${genId}/image`,
          { headers: { Authorization: `Bearer ${auth.token}` }, responseType: 'arraybuffer', timeout: 30_000 },
        );
        const ct = String(resp.headers['content-type'] ?? 'image/jpeg');
        const ext = ct.includes('png') ? 'png' : 'jpg';
        await this.uploadAndSendFile(chatId, Buffer.from(resp.data), `image.${ext}`, `✅ ${caption}`);
      } catch (err: any) {
        this.logger.error(`[View] Image download failed genId=${genId}: ${err?.message}`);
        await this.sendMessage(chatId, '❌ Не удалось получить изображение. Попробуйте позже.');
      }
      return;
    }

    // Presentations
    if (genType === 'presentation') {
      try {
        const resp = await axios.post(
          `${this.internalApiUrl}/api/generate/${genId}/presentation/pdf`,
          {},
          { headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' }, responseType: 'arraybuffer', timeout: PDF_TIMEOUT },
        );
        await this.uploadAndSendFile(chatId, Buffer.from(resp.data), `presentation_${Date.now()}.pdf`, `✅ ${caption}`);
      } catch (err: any) {
        this.logger.error(`[View] Presentation PDF failed genId=${genId}: ${err?.message}`);
        await this.sendMessage(chatId, '❌ Не удалось создать PDF презентации. Попробуйте позже.');
      }
      return;
    }

    // All text types — generic PDF
    try {
      const resp = await axios.post(
        `${this.internalApiUrl}/api/generate/${genId}/pdf`,
        {},
        { headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' }, responseType: 'arraybuffer', timeout: PDF_TIMEOUT },
      );
      const filename = `${genType || 'doc'}_${Date.now()}.pdf`;
      await this.uploadAndSendFile(chatId, Buffer.from(resp.data), filename, `✅ ${caption}`);
    } catch (err: any) {
      this.logger.error(`[View] PDF failed genId=${genId}: ${err?.message}`);
      await this.sendMessage(chatId, '❌ Не удалось создать файл. Откройте prepodavai.ru для просмотра.');
    }
  }

  // ── Direct message (for submission notifications) ─────────────────────────
  async sendDirectMessage(chatId: string, text: string, linkButton?: { label: string; url: string }): Promise<void> {
    const attachments = linkButton
      ? [{ type: 'inline_keyboard', payload: { buttons: [[{ type: 'link', text: linkButton.label, url: linkButton.url }]] } }]
      : undefined;
    await this.sendMessageWithMarkup(chatId, text, attachments).catch((err: any) =>
      this.logger.warn(`[sendDirectMessage] chatId=${chatId}: ${err?.message}`),
    );
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
    const cached = this.jwtCache.get(username);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    const maskedKey = apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : 'null';
    this.logger.log(`[Auth] login attempt: username=${username} apiKey=${maskedKey}`);
    try {
      const resp = await axios.post(
        `${this.internalApiUrl}/api/auth/login-with-api-key`,
        { username, apiKey },
        { headers: { 'Content-Type': 'application/json' } },
      );
      const token: string | null = resp.data?.token ?? null;
      if (token) {
        if (this.jwtCache.size > 1000) {
          const now = Date.now();
          for (const [k, v] of this.jwtCache) {
            if (v.expiresAt <= now) this.jwtCache.delete(k);
          }
        }
        this.jwtCache.set(username, { token, expiresAt: Date.now() + MaxService.JWT_CACHE_TTL_MS });
      }
      return token;
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
    // Never send to the subscription channel — it's for membership checks only
    const channelId = this.configService.get<string>('MAX_CHANNEL_ID');
    if (channelId && chatId === channelId) {
      this.logger.error(`[MAX] Blocked attempt to send message to channel ${channelId}`);
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
      if (error?.response?.data?.code === 'dialog.not.found') {
        throw error; // пробрасываем — caller может сделать retry
      }
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
      await axios.post(url, { notification: '' }, { headers: { Authorization: this.token } });
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
      `✅ Ваша презентация готова!${topic}\n\nПросмотр доступен в веб-версии Преподавай.`,
    );
  }

  private async sendImage(chatId: string, result: any) {
    // Извлекаем URL картинки из всех возможных форм результата (для
    // image/image_generation/image_edit/photosession).
    const imageUrl: string | null =
      (typeof result === 'string' && /^https?:\/\//.test(result) ? result : null) ||
      result?.imageUrl ||
      result?.imageUrls?.[0] ||
      result?.content?.imageUrl ||
      (typeof result?.content === 'string' && /^https?:\/\//.test(result.content)
        ? result.content
        : null) ||
      null;

    const head = `✅ Ваше изображение готово!${result?.prompt ? `\n\n📝 Промпт: ${result.prompt}` : ''}`;
    if (!imageUrl) {
      await this.sendMessage(chatId, `${head}\n\n[Изображение доступно в веб-версии]`);
      return;
    }

    // Пытаемся скачать буфер картинки и загрузить в MAX как attachment.
    // Это даёт настоящую картинку в чате, а не ссылку под auth-guard.
    try {
      let buffer: Buffer | null = null;
      let ext = '.png';

      // Наш собственный файл (/api/files/<hash>) — читаем напрямую с диска,
      // минуя HTTP (там JwtAuthGuard).
      const own = imageUrl.match(/\/api\/files\/([a-f0-9]{32})(?:[?#].*)?$/i);
      if (own) {
        const file = await this.filesService.getFile(own[1]);
        if (file) {
          buffer = file.buffer;
          ext = file.mimeType.includes('png') ? '.png'
              : file.mimeType.includes('webp') ? '.webp'
              : file.mimeType.includes('gif') ? '.gif'
              : '.jpg';
        }
      } else if (imageUrl.startsWith('data:image')) {
        const m = imageUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.*)$/);
        if (m) {
          buffer = Buffer.from(m[2], 'base64');
          ext = m[1].includes('png') ? '.png' : m[1].includes('webp') ? '.webp' : '.jpg';
        }
      } else if (/^https?:\/\//.test(imageUrl)) {
        const resp = await axios.get<ArrayBuffer>(imageUrl, { responseType: 'arraybuffer', timeout: 30_000 });
        buffer = Buffer.from(resp.data);
        const ct = String(resp.headers['content-type'] ?? '');
        ext = ct.includes('png') ? '.png' : ct.includes('webp') ? '.webp' : '.jpg';
      }

      if (buffer && buffer.length > 0) {
        await this.uploadAndSendFile(chatId, buffer, `image${ext}`, head);
        return;
      }
    } catch (err: any) {
      this.logger.error(`[MAX] sendImage: failed to deliver as attachment: ${err?.message}`);
    }

    // Фолбэк — текст со ссылкой (для отладки/если MAX upload временно недоступен).
    await this.sendMessage(chatId, `${head}\n\n🖼️ ${imageUrl}`);
  }

  private async sendTextResult(chatId: string, generationType: string, result: any, isBotOnlyUser = false) {
    const content = result?.htmlResult || result?.content || result;
    const filename = `${generationType}_${new Date().toISOString().split('T')[0]}.pdf`;

    try {
      const htmlContent = this.htmlExportService.normalizeIncomingHtml(content);
      const pdfBuffer = await this.htmlExportService.htmlToPdf(htmlContent);
      await this.uploadAndSendFile(chatId, pdfBuffer, filename, '✅ Ваш материал готов!');
      return;
    } catch (error) {
      this.logger.error(`[MAX] PDF generation failed for ${generationType}:`, error);
    }

    const fallbackText = isBotOnlyUser
      ? `✅ Ваш материал готов!\n\n⚠️ Не удалось создать PDF. Попробуйте сгенерировать ещё раз.`
      : `✅ Ваш материал готов!\n\nПросмотр доступен в веб-версии Преподавай.`;

    await this.sendMessage(chatId, fallbackText);
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

  private async deductTokens(
    userId: string,
    appUserId: string,
  ): Promise<{ success: boolean; remaining: number; source: 'subscription' | 'bot' }> {
    const subscription = await this.prisma.userSubscription.findUnique({ where: { userId: appUserId } });

    if (subscription && subscription.status === 'active') {
      const updated = await this.prisma.$transaction(async (tx) => {
        const sub = await tx.userSubscription.findUnique({ where: { userId: appUserId } });
        if (!sub || sub.creditsBalance + sub.extraCredits < 3) return null;
        let newExtra = sub.extraCredits;
        let newBalance = sub.creditsBalance;
        if (newExtra >= 3) {
          newExtra -= 3;
        } else {
          const remainder = 3 - newExtra;
          newExtra = 0;
          newBalance -= remainder;
        }
        return tx.userSubscription.update({ where: { id: sub.id }, data: { creditsBalance: newBalance, extraCredits: newExtra } });
      });
      if (!updated) {
        const sub = await this.prisma.userSubscription.findUnique({ where: { userId: appUserId } });
        return { success: false, remaining: (sub?.creditsBalance ?? 0) + (sub?.extraCredits ?? 0), source: 'subscription' };
      }
      return { success: true, remaining: updated.creditsBalance + updated.extraCredits, source: 'subscription' };
    }

    const deducted = await (this.prisma as any).botUser.updateMany({
      where: { maxId: userId, botCredits: { gte: 3 } },
      data: { botCredits: { decrement: 3 } },
    });
    if (deducted.count === 0) {
      const bu = await (this.prisma as any).botUser.findUnique({ where: { maxId: userId }, select: { botCredits: true } });
      return { success: false, remaining: bu?.botCredits ?? 0, source: 'bot' };
    }
    const bu = await (this.prisma as any).botUser.findUnique({ where: { maxId: userId }, select: { botCredits: true } });
    return { success: true, remaining: bu?.botCredits ?? 0, source: 'bot' };
  }

  private async refundTokens(userId: string, appUserId: string, source: 'subscription' | 'bot'): Promise<void> {
    if (source === 'subscription') {
      await this.prisma.userSubscription.updateMany({ where: { userId: appUserId }, data: { extraCredits: { increment: 3 } } });
    } else {
      await (this.prisma as any).botUser.update({ where: { maxId: userId }, data: { botCredits: { increment: 3 } } }).catch(() => null);
    }
  }

  private getWelcomeMessage(_appUser: any, balance: number | null = null): string {
    const balanceLine = balance !== null ? `\n\n💳 Токенов на балансе: ${balance}` : '';
    return (
      `Добро пожаловать в Преподавай 🎓\n\n` +
      `Я Ваш интеллектуальный помощник для:\n` +
      `— Создания учебных материалов\n` +
      `— Планирования уроков\n` +
      `— Создания красочных презентаций\n` +
      `— Методической поддержки\n` +
      `— Создания интерактивных игр` +
      balanceLine
    );
  }

  // ── Registration flow ─────────────────────────────────────────────────────

  private async startMaxRegistration(userId: string, chatId: string, maxUsername?: string) {
    if (this.regStates.size >= MaxService.MAX_CONCURRENT_REG_SESSIONS) {
      await this.sendMessage(chatId, '⚠️ Сервис временно недоступен. Попробуйте позже.');
      return;
    }
    this.regStates.set(userId, { step: 'awaiting_email', maxUsername });
    await this.sendMessage(
      chatId,
      `👋 Добро пожаловать в Преподавай 🎓\n\nДавайте создадим ваш аккаунт — это займёт меньше минуты.\n\nВведите вашу электронную почту:`,
    );
  }

  private async handleMaxEmailInput(
    userId: string,
    chatId: string,
    state: { step: string; email?: string; locked?: boolean },
    text: string,
  ) {
    if (state.locked) return;

    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(text) || text.length > 254) {
      await this.sendMessage(chatId, '❌ Некорректный формат email.\n\nВведите действительный адрес, например: ivan@example.com');
      return;
    }

    state.locked = true;
    state.email = text.toLowerCase();
    this.regStates.set(userId, state as any);

    try {
      await this.completeMaxRegistration(userId, chatId, state.email);
    } catch (err: any) {
      state.locked = false;
      this.logger.error(`[RegBot MAX] Registration error for maxId=${userId}:`, err);
      if (err?.code === 'P2002') {
        this.regStates.delete(userId);
        await this.sendMessage(chatId, '⚠️ Аккаунт с таким email уже существует.\n\nЕсли это ваш аккаунт — войдите на сайте prepodavai.ru');
      } else {
        await this.sendMessage(chatId, '❌ Внутренняя ошибка. Попробуйте позже.');
      }
    }
  }

  private async completeMaxRegistration(userId: string, chatId: string, email: string) {
    const emailTaken = await this.prisma.appUser.findFirst({ where: { email } });
    if (emailTaken) {
      this.regStates.delete(userId);
      await this.sendMessage(chatId, '⚠️ Аккаунт с таким email уже существует.\n\nЕсли это ваш аккаунт — войдите на сайте prepodavai.ru');
      return;
    }

    const password = crypto.randomBytes(9).toString('base64').slice(0, 12).replace(/[^a-zA-Z0-9]/g, 'x');
    const passwordHash = require('bcryptjs').hashSync(password, 12);
    const storedRegState = this.regStates.get(userId);
    const rawUsername = storedRegState?.maxUsername
      ? storedRegState.maxUsername.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30) || `user${userId}`
      : `user${userId}`;
    const username = await this.ensureUniqueMaxUsername(rawUsername);
    const apiKey = crypto.randomBytes(16).toString('hex');

    const newUser = await this.prisma.$transaction(async (tx) => {
      // Move maxId from shadow to web AppUser so mini-app auto-login works via validate-init-data
      await tx.appUser.updateMany({ where: { maxId: userId }, data: { maxId: null, maxChatId: null } as any });

      const appUser = await tx.appUser.create({
        data: {
          username, userHash: username, email,
          passwordHash, apiKey, chatId,
          maxId: userId, maxChatId: chatId,
          firstName: '', lastName: '',
          source: 'max_bot', lastAccessAt: new Date(), lastMaxAppAccess: new Date(),
        } as any,
      });

      // New web users get business plan with 1500 credits + remaining botCredits
      const businessPlan = await tx.subscriptionPlan.findUnique({ where: { planKey: 'business' } });
      if (businessPlan) {
        const existingBot = await (tx as any).botUser.findUnique({ where: { maxId: userId }, select: { botCredits: true } });
        const bonusCredits = existingBot?.botCredits ?? 0;
        const now = new Date();
        const endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 1);
        await tx.userSubscription.create({
          data: {
            userId: appUser.id, planId: businessPlan.id, status: 'active',
            creditsBalance: 1500 + bonusCredits, extraCredits: 0, creditsUsed: 0,
            overageCreditsUsed: 0, startDate: now, endDate, autoRenew: true,
          },
        });
      }

      await (tx as any).botUser.upsert({
        where: { maxId: userId },
        update: { appUserId: appUser.id, email, registrationStatus: 'registered' },
        create: {
          maxId: userId, appUserId: appUser.id,
          firstName: '', lastName: '', username: `user${userId}`,
          email, registrationStatus: 'registered', source: 'max_bot',
          lastActiveAt: new Date(),
        },
      });

      return appUser;
    });

    this.regStates.delete(userId);
    this.logger.log(`[RegBot MAX] New user registered: id=${newUser.id} username=${username}`);

    // Глубокая цель: регистрация (fire-and-forget)
    this.tgtrack('send_reach_goal', { user_id: userId, target: 'registration_completed' });

    this.emailService.sendWelcomeEmail(username, password, email).catch((err) => {
      this.logger.error(`[RegBot MAX] Failed to send welcome email for ${email}:`, err);
    });

    await this.sendMessage(
      chatId,
      `✅ Аккаунт создан!\n\n👤 Логин: ${username}\n🔑 Пароль: ${password}\n\n💳 Токенов на платформе: 1500\n\n⚠️ Сохраните пароль — он больше не будет показан.`,
    );
    await this.sendMessageWithKeyboard(chatId, '🏠 Главное меню:', this.buildMainMenuAttachment());
  }

  private async ensureUniqueMaxUsername(base: string): Promise<string> {
    const safe = base.replace(/[^a-z0-9_]/gi, '').slice(0, 20) || 'user';
    const exists = await this.prisma.appUser.findFirst({ where: { username: safe } });
    if (!exists) return safe;
    const suffix = crypto.randomInt(1000, 9999).toString();
    const candidate = `${safe}_${suffix}`.slice(0, 25);
    const exists2 = await this.prisma.appUser.findFirst({ where: { username: candidate } });
    return exists2 ? `${safe}_${crypto.randomInt(10_000, 99_999)}` : candidate;
  }
}
