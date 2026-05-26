import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Bot, Context, InlineKeyboard, NextFunction } from 'grammy';
import axios from 'axios';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { BotSessionService } from './bot-session.service';
import { BotWizardService } from './bot-wizard.service';
import { TOOL_CONFIGS, ToolConfig, FieldConfig, getToolConfig } from './tool-configs';

// ── Безопасность ─────────────────────────────────────────────────────────────
/** Минимальный интервал между генерациями одного пользователя (сек) */
const RATE_LIMIT_MS = 15_000;
/** Максимальная длина callback_data для g:v: (защита от аномально длинных данных) */
const MAX_CALLBACK_DATA_LEN = 32;

@Injectable()
export class BotGenerationHandler implements OnModuleInit {
  private readonly logger = new Logger(BotGenerationHandler.name);

  // Загружаются лениво через ModuleRef, чтобы не создавать круговую зависимость
  private generationsService: any;
  private gamesService: any;
  private filesService: any;

  // Экземпляр бота — нужен для получения токена при скачивании файлов
  private bot: Bot;

  // Хранит timestamp последней генерации по telegramId
  private readonly lastGenAt = new Map<string, number>();

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly prisma: PrismaService,
    private readonly sessions: BotSessionService,
    private readonly wizard: BotWizardService,
  ) {}

  async onModuleInit() {
    try {
      const { GenerationsService } = await import('../../generations/generations.service');
      this.generationsService = this.moduleRef.get(GenerationsService, { strict: false });
      this.logger.log('GenerationsService loaded via ModuleRef');
    } catch (e) {
      this.logger.error('Failed to load GenerationsService', e);
    }

    try {
      const { GamesService } = await import('../../games/games.service');
      this.gamesService = this.moduleRef.get(GamesService, { strict: false });
      this.logger.log('GamesService loaded via ModuleRef');
    } catch (e) {
      this.logger.error('Failed to load GamesService', e);
    }

    try {
      const { FilesService } = await import('../../files/files.service');
      this.filesService = this.moduleRef.get(FilesService, { strict: false });
      this.logger.log('FilesService loaded via ModuleRef');
    } catch (e) {
      this.logger.error('Failed to load FilesService', e);
    }
  }

  /**
   * Регистрирует хэндлеры на экземпляре бота.
   * Вызывается из TelegramService.setupHandlers() ДО регистрации хэндлеров регистрации,
   * чтобы text-хэндлер генерации мог вызвать next() и уступить регистрационному.
   */
  setup(bot: Bot): void {
    this.bot = bot;

    bot.command('generate', (ctx) => this.onGenerate(ctx));

    // callback_query: фильтруем только «наши» данные с префиксом g:
    bot.on('callback_query:data', (ctx) => this.onCallbackQuery(ctx));

    // text: обрабатываем только если пользователь в сессии генерации;
    // иначе вызываем next() чтобы регистрационный хэндлер мог продолжить.
    bot.on('message:text', (ctx, next) => this.onTextMessage(ctx, next));

    // Файлы: фото (для фотосессии) и документы (для транскрибации)
    bot.on('message:photo', (ctx) => this.onFileMessage(ctx, 'photo'));
    bot.on('message:document', (ctx) => this.onFileMessage(ctx, 'document'));
    bot.on('message:audio', (ctx) => this.onFileMessage(ctx, 'document'));
    bot.on('message:voice', (ctx) => this.onFileMessage(ctx, 'document'));
    bot.on('message:video', (ctx) => this.onFileMessage(ctx, 'document'));
  }

  // ── Команда /generate ────────────────────────────────────────────────────────

  private async onGenerate(ctx: Context) {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const user = await this.findRegisteredUser(telegramId);
    if (!user) {
      await ctx.reply('❌ Аккаунт не найден.\n\nЗарегистрируйтесь через /start и попробуйте снова.');
      return;
    }

    // Очищаем предыдущую сессию если была
    this.sessions.delete(telegramId);

    const kb = this.wizard.buildToolSelectionKeyboard();
    await ctx.reply(
      '🛠️ *Выберите инструмент:*',
      { parse_mode: 'Markdown', reply_markup: kb },
    );
  }

  // ── Callback queries (нажатия кнопок) ───────────────────────────────────────

  private async onCallbackQuery(ctx: Context) {
    const data = ctx.callbackQuery?.data ?? '';
    const telegramId = ctx.from?.id.toString();
    if (!telegramId || !data.startsWith('g:')) return;

    // Защита: отвечаем на callback сразу чтобы убрать «часики»
    await ctx.answerCallbackQuery().catch(() => null);

    // Базовая санитизация длины
    if (data.length > MAX_CALLBACK_DATA_LEN) {
      this.logger.warn(`[BotGen] Suspiciously long callback data from ${telegramId}: ${data.length} bytes`);
      return;
    }

    if (data.startsWith('g:t:')) {
      await this.onToolSelected(ctx, telegramId, data.slice(4));
    } else if (data.startsWith('g:v:')) {
      const idx = parseInt(data.slice(4), 10);
      if (!Number.isFinite(idx) || idx < 0 || idx > 50) return; // защита
      await this.onOptionSelected(ctx, telegramId, idx);
    } else if (data === 'g:skip') {
      await this.onSkip(ctx, telegramId);
    } else if (data === 'g:ok') {
      await this.onConfirm(ctx, telegramId);
    } else if (data === 'g:no') {
      await this.onCancel(ctx, telegramId);
    }
  }

  // ── Текстовые сообщения ──────────────────────────────────────────────────────

  private async onTextMessage(ctx: Context, next: NextFunction) {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return next();

    const session = this.sessions.get(telegramId);
    if (!session) return next(); // не в сессии — передаём дальше (регистрация и т.д.)

    const raw = (ctx.message as any)?.text ?? '';
    const tool = getToolConfig(session.toolKey);
    if (!tool) return;

    const field = tool.fields[session.fieldIndex];
    if (!field) return;

    // Поле ожидает файл — напоминаем пользователю
    if (field.type === 'file') {
      await ctx.reply('📎 Нужно отправить файл, а не текст. Прикрепите файл или нажмите «Отмена».');
      return;
    }

    if (field.type !== 'text') return;

    const sanitized = this.wizard.sanitize(raw);
    const error = this.wizard.validateText(sanitized, field);
    if (error) {
      await ctx.reply(error);
      return; // не вызываем next — сессия активна, ждём корректного ввода
    }

    session.params[field.key] = sanitized;
    session.fieldIndex++;
    await this.nextStep(ctx, telegramId, session, tool);
  }

  // ── Шаги wizard ─────────────────────────────────────────────────────────────

  private async onToolSelected(ctx: Context, telegramId: string, toolKey: string) {
    const tool = getToolConfig(toolKey);
    if (!tool) return; // неизвестный ключ — игнорируем

    const user = await this.findRegisteredUser(telegramId);
    if (!user) {
      await ctx.reply('❌ Аккаунт не найден. Используйте /start.');
      return;
    }

    let session: ReturnType<BotSessionService['create']>;
    try {
      session = this.sessions.create(telegramId, toolKey);
    } catch (e: any) {
      await ctx.reply(`⚠️ ${e.message}`);
      return;
    }

    await this.askField(ctx, tool, session);
  }

  private async onOptionSelected(ctx: Context, telegramId: string, optionIndex: number) {
    const session = this.sessions.get(telegramId);
    if (!session) {
      await ctx.reply('⏰ Сессия истекла. Начните заново: /generate');
      return;
    }

    const tool = getToolConfig(session.toolKey);
    if (!tool) return;

    const field = tool.fields[session.fieldIndex];
    if (!field) return;

    // Резолвим значение по индексу — пользователь не может подставить произвольную строку
    const value = this.wizard.resolveOptionByIndex(field, optionIndex, session.params);
    if (value === null) {
      await ctx.reply('❌ Недопустимый выбор. Нажмите одну из кнопок выше.');
      return;
    }

    session.params[field.key] = value;
    session.fieldIndex++;
    await this.nextStep(ctx, telegramId, session, tool);
  }

  private async onSkip(ctx: Context, telegramId: string) {
    const session = this.sessions.get(telegramId);
    if (!session) return;

    const tool = getToolConfig(session.toolKey);
    if (!tool) return;

    const field = tool.fields[session.fieldIndex];
    if (!field) return;

    if (field.required) {
      await ctx.reply('❌ Это поле обязательно — пропустить нельзя.');
      return;
    }

    // Применяем default если есть
    if (field.default !== undefined) {
      session.params[field.key] = field.default;
    }
    session.fieldIndex++;
    await this.nextStep(ctx, telegramId, session, tool);
  }

  private async onConfirm(ctx: Context, telegramId: string) {
    const session = this.sessions.get(telegramId);
    if (!session) {
      await ctx.reply('⏰ Сессия истекла. Начните заново: /generate');
      return;
    }

    // Rate limiting
    const lastGen = this.lastGenAt.get(telegramId) ?? 0;
    const waitMs = RATE_LIMIT_MS - (Date.now() - lastGen);
    if (waitMs > 0) {
      await ctx.reply(`⏳ Подождите ещё ${Math.ceil(waitMs / 1000)} сек. перед следующей генерацией.`);
      return;
    }

    const tool = getToolConfig(session.toolKey);
    if (!tool) return;

    const user = await this.findRegisteredUser(telegramId);
    if (!user) {
      await ctx.reply('❌ Аккаунт не найден.');
      this.sessions.delete(telegramId);
      return;
    }

    // Очищаем сессию до генерации — чтобы не было дублей при повторном нажатии
    this.sessions.delete(telegramId);
    this.lastGenAt.set(telegramId, Date.now());

    await ctx.reply(
      `⏳ Генерирую ${tool.emoji} *${tool.label}*...\n_${tool.estimatedTime}_`,
      { parse_mode: 'Markdown' },
    );

    try {
      if (tool.serviceType === 'games') {
        await this.runGameGeneration(ctx, user, tool, session.params);
      } else {
        await this.runGeneration(ctx, user, tool, session.params);
      }
    } catch (err: any) {
      this.logger.error(`Generation failed for user ${user.id} (${tool.generationType}):`, err);
      const userMsg = this.humanizeError(err);
      await ctx.reply(userMsg);
    }
  }

  private async onCancel(ctx: Context, telegramId: string) {
    this.sessions.delete(telegramId);
    await ctx.reply('❌ Генерация отменена.');
  }

  // ── Основная логика генерации ────────────────────────────────────────────────

  private async runGeneration(
    ctx: Context,
    user: any,
    tool: ToolConfig,
    params: Record<string, string>,
  ) {
    if (!this.generationsService) {
      throw new Error('Сервис генерации не инициализирован. Обратитесь к администратору.');
    }

    const inputParams = {
      ...params,
      // Флаг платформы — TelegramSenderProcessor увидит его и отправит результат в чат
      _miniAppPlatform: 'telegram',
    };

    const result = await this.generationsService.createGeneration({
      userId: user.id,
      generationType: tool.generationType,
      inputParams,
    });

    if (result.status === 'completed') {
      await ctx.reply(
        `✅ Готово! Отправляю ${tool.emoji} *${tool.label}* в чат...\n\n` +
        `💳 Осталось токенов: *${result.remainingCredits ?? '—'}*`,
        { parse_mode: 'Markdown' },
      );
    } else {
      // Асинхронная генерация (например, изображения через webhook) —
      // результат придёт позже через TelegramSenderProcessor
      await ctx.reply(
        `✅ Задача принята! Результат придёт в этот чат, как только будет готов.\n\n` +
        `💳 Осталось токенов: *${result.remainingCredits ?? '—'}*`,
        { parse_mode: 'Markdown' },
      );
    }
  }

  private async runGameGeneration(
    ctx: Context,
    user: any,
    tool: ToolConfig,
    params: Record<string, string>,
  ) {
    if (!this.gamesService) {
      throw new Error('Сервис игр не инициализирован. Обратитесь к администратору.');
    }

    const result = await this.gamesService.generateGame(
      { type: params.type, topic: params.topic },
      user.id,
    );

    // Игра возвращает URL — отправляем кнопкой
    const kb = new InlineKeyboard().url('🎮 Открыть игру', result.url);
    await ctx.reply(
      `🎮 *Игра готова!*\n\nТема: _${params.topic}_\n\nНажмите кнопку, чтобы открыть:`,
      { parse_mode: 'Markdown', reply_markup: kb },
    );
  }

  // ── Обработка файлов (фото / документ / аудио / видео) ──────────────────────

  private async onFileMessage(ctx: Context, receivedAs: 'photo' | 'document') {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const session = this.sessions.get(telegramId);
    if (!session) return; // не в сессии — игнорируем

    const tool = getToolConfig(session.toolKey);
    if (!tool) return;

    const field = tool.fields[session.fieldIndex];
    if (!field || field.type !== 'file') {
      // Пользователь прислал файл не вовремя
      await ctx.reply('⚠️ Сейчас файл не ожидается. Ответьте на текущий вопрос или нажмите «Отмена».');
      return;
    }

    // Проверяем совпадение типа файла с ожидаемым
    const msg = ctx.message as any;
    if (field.accept === 'photo' && receivedAs !== 'photo') {
      await ctx.reply('❌ Нужна фотография (не документ). Отправьте фото через иконку 📷.');
      return;
    }

    const user = await this.findRegisteredUser(telegramId);
    if (!user) {
      await ctx.reply('❌ Аккаунт не найден.');
      this.sessions.delete(telegramId);
      return;
    }

    // Извлекаем file_id из сообщения
    let fileId: string;
    let mimeType: string;
    let originalName: string;
    let fileSizeBytes: number | undefined;

    if (receivedAs === 'photo') {
      // Берём фото наибольшего размера из массива
      const photos: any[] = msg.photo ?? [];
      if (!photos.length) return;
      const largest = photos[photos.length - 1];
      fileId = largest.file_id;
      mimeType = 'image/jpeg';
      originalName = 'photo.jpg';
      fileSizeBytes = largest.file_size;
    } else {
      // document / audio / voice / video
      const doc = msg.document ?? msg.audio ?? msg.voice ?? msg.video;
      if (!doc) return;
      fileId = doc.file_id;
      mimeType = doc.mime_type ?? 'application/octet-stream';
      originalName = doc.file_name ?? `file_${Date.now()}`;
      fileSizeBytes = doc.file_size;
    }

    // Проверка размера (Telegram Bot API лимит — 20 МБ для getFile)
    const maxBytes = (field.maxSizeMb ?? 20) * 1024 * 1024;
    if (fileSizeBytes && fileSizeBytes > maxBytes) {
      await ctx.reply(
        `❌ Файл слишком большой (${Math.round(fileSizeBytes / 1024 / 1024)} МБ).\n` +
        `Максимальный размер — ${field.maxSizeMb ?? 20} МБ.`,
      );
      return;
    }

    await ctx.reply('⏳ Загружаю файл...');

    try {
      const result = await this.uploadTelegramFile(fileId, mimeType, originalName, user.id);

      // Сохраняем hash или url в зависимости от конфига поля
      session.params[field.key] = field.storeAs === 'url' ? result.url : result.hash;
      session.fieldIndex++;

      await this.nextStep(ctx, telegramId, session, tool);
    } catch (err: any) {
      this.logger.error(`File upload failed for user ${user.id}:`, err);
      await ctx.reply('❌ Не удалось загрузить файл. Попробуйте ещё раз или отправьте другой файл.');
    }
  }

  /**
   * Скачивает файл из Telegram и загружает в FilesService.
   * Возвращает { hash, url } для дальнейшего использования в генерации.
   */
  private async uploadTelegramFile(
    fileId: string,
    mimeType: string,
    originalName: string,
    userId: string,
  ): Promise<{ hash: string; url: string }> {
    if (!this.filesService) {
      throw new Error('FilesService не инициализирован');
    }

    // 1. Получаем file_path через Telegram API
    const fileInfo = await this.bot.api.getFile(fileId);
    const filePath = fileInfo.file_path;
    if (!filePath) throw new Error('Telegram не вернул путь к файлу');

    // 2. Скачиваем файл
    const downloadUrl = `https://api.telegram.org/file/bot${this.bot.token}/${filePath}`;
    const response = await axios.get<Buffer>(downloadUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    // 3. Конструируем объект совместимый с Express.Multer.File
    const multerFile = {
      fieldname: 'file',
      originalname: originalName,
      encoding: '7bit',
      mimetype: mimeType,
      buffer,
      size: buffer.length,
    };

    // 4. Загружаем через FilesService (тот же путь, что и веб-клиент)
    return this.filesService.saveFile(multerFile, userId);
  }

  // ── Вспомогательные ─────────────────────────────────────────────────────────

  private async nextStep(
    ctx: Context,
    _telegramId: string,
    session: ReturnType<BotSessionService['create']>,
    tool: ToolConfig,
  ) {
    if (session.fieldIndex >= tool.fields.length) {
      // Все поля собраны — показываем подтверждение
      const msg = this.wizard.buildConfirmMessage(tool, session.params);
      const kb = this.wizard.buildConfirmKeyboard();
      await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: kb });
    } else {
      await this.askField(ctx, tool, session);
    }
  }

  private async askField(
    ctx: Context,
    tool: ToolConfig,
    session: ReturnType<BotSessionService['create']>,
  ) {
    const field = tool.fields[session.fieldIndex];
    const kb = this.wizard.buildFieldKeyboard(field, session);

    if (kb) {
      await ctx.reply(field.label, { parse_mode: 'Markdown', reply_markup: kb });
    } else {
      await ctx.reply(field.label, { parse_mode: 'Markdown' });
    }
  }

  /**
   * Ищем пользователя по telegramId.
   * Незарегистрированные/несвязанные пользователи не могут генерировать.
   */
  private async findRegisteredUser(telegramId: string) {
    return this.prisma.appUser.findUnique({ where: { telegramId } });
  }

  /**
   * Переводит технические ошибки в понятные пользователю сообщения.
   */
  private humanizeError(err: any): string {
    const msg: string = err?.message ?? err?.response?.data?.message ?? '';
    if (msg.toLowerCase().includes('токен') || msg.toLowerCase().includes('кредит')) {
      return '💳 Недостаточно токенов. Пополните баланс на сайте prepodavai.ru';
    }
    if (msg.toLowerCase().includes('не найден')) {
      return '❌ Аккаунт не найден. Используйте /start.';
    }
    this.logger.error(`Unhandled bot generation error: ${msg}`);
    return '❌ Произошла ошибка при генерации. Попробуйте ещё раз или обратитесь в поддержку.';
  }

  /** Публичный метод для TelegramService: проверить наличие сессии */
  hasSession(telegramId: string): boolean {
    return this.sessions.has(telegramId);
  }

  /** Публичный метод для TelegramService: отменить сессию через /cancel */
  cancelSession(telegramId: string): void {
    this.sessions.delete(telegramId);
  }
}
