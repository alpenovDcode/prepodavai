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
import { SmartLinkTokensService } from '../smart-links/smart-link-tokens.service';

// ── Типы состояний диалога регистрации ──────────────────────────────────────
type RegStep = 'awaiting_email';

interface RegistrationState {
  step: RegStep;
  email?: string;
  locked?: boolean;
}

const MINI_APP_BTN = '📱 Открыть мини-приложение';

// ── Дефолтное приветствие + проверка подписки ──────────────────────────────
// Это fallback для всех новых юзеров, у которых нет smart-link-воронки.
// 1:1 с текстом из /telegram-bot/main.ts и max.service.ts (бренд «Прорыв в
// репетиторстве»). Канал и ссылка читаются из ENV — настраивается на проде
// без правок кода.
const DEFAULT_SUBSCRIPTION_TEXT =
  'Преподавай — бесплатный ИИ-сервис для репетиторов.\n\n' +
  'Он помогает быстрее готовиться к урокам:\n' +
  '— составлять планы занятий\n' +
  '— генерировать рабочие листы\n' +
  '— подбирать упражнения\n' +
  '— делать домашку\n' +
  '— объяснять темы простым языком\n\n' +
  'Чтобы пользоваться сервисом бесплатно, надо быть подписанным на канал «Прорыв в репетиторстве».\n' +
  'После подписки нажмите «Я подписался» — и бот откроет доступ.';
const DEFAULT_NOT_SUBSCRIBED_TEXT =
  'Пока не вижу подписку на канал.\n\n' +
  'Чтобы открыть бесплатный доступ к Преподавай, подпишитесь на канал «Прорыв в репетиторстве», ' +
  'а потом нажмите «Я подписался».';
const DEFAULT_SUBSCRIBED_TEXT =
  'Готово, доступ открыт ✅\n\n' +
  'Теперь можете пользоваться Преподавай бесплатно, пока подписаны на канал «Прорыв в репетиторстве».';

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
    private readonly smartLinkTokens: SmartLinkTokensService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (token) {
      this.logger.log(
        `[INIT] TELEGRAM_BOT_TOKEN set (len=${token.length}, prefix=${token.slice(0, 8)}***), creating bot...`,
      );
      this.bot = new Bot(token);
      this.registerCommandHandlers();
      this.logger.log(`[INIT] Bot created & handlers registered (start, sub:check)`);
    } else {
      this.logger.error('[INIT] TELEGRAM_BOT_TOKEN is NOT set. Telegram bot will not work!');
    }
  }

  /**
   * Регистрирует обработчики команд бота. Сейчас — только /start, для
   * атрибуции UTM-кликов через smart-link токены.
   *
   * Поток: юзер кликает prepodavai.ru/g/<slug>?utm_source=... → редиректор
   * кладёт UTM в Redis под токеном, шлёт в t.me/bot?start=<token>. Здесь
   * бот читает токен, привязывает UTM к пользователю (если уже в БД) или
   * откладывает атрибуцию по tgId на 30 дней (если ещё не зареган).
   */
  private registerCommandHandlers() {
    this.bot.command('start', async (ctx) => {
      try {
        const payload = (ctx.match || '').trim();
        const tgId = ctx.from?.id;
        this.logger.log(
          `[START] tgId=${tgId} payload=${JSON.stringify(payload)} ` +
          `payloadLen=${payload.length}`,
        );
        if (!tgId) return;

        // 1) Smart-link токен → атрибуция через воронку.
        //    Воронка с welcomeText сама отрисует своё приветствие
        //    (в handleStartPayload → sendFunnelWelcome).
        const isToken = /^[A-Za-z0-9_-]{10,32}$/.test(payload);
        this.logger.log(`[START] isSmartLinkToken=${isToken}`);

        if (payload && isToken) {
          const attribution = await this.handleStartPayload(String(tgId), payload, ctx);
          this.logger.log(
            `[START] handleStartPayload result: ${JSON.stringify(attribution)}`,
          );
          if (attribution?.funnelId) {
            this.logger.log(`[START] funnel welcome sent, skipping default flow`);
            return;
          }
        }

        // 2) Иначе — дефолтное приветствие с проверкой подписки на канал
        this.logger.log(`[START] falling through to default activation flow`);
        await this.sendDefaultActivationFlow(ctx);
      } catch (e: any) {
        this.logger.error(`/start handler failed: ${e?.message}`, e?.stack);
      }
    });

    // Дефолтный callback «Я подписался» (sub:check) — для пользователей вне
    // воронок. Воронки используют свой callback `check_sub:<funnelId>` ниже.
    this.bot.callbackQuery('sub:check', async (ctx) => {
      try {
        const tgId = ctx.from?.id ? String(ctx.from.id) : null;
        if (!tgId) return;
        await this.handleDefaultSubscriptionCheck(ctx, tgId);
      } catch (e: any) {
        this.logger.warn(`sub:check handler failed: ${e?.message}`);
      }
    });

    // Callback-query «Я подписался» — проверяет подписку на канал и шлёт
    // следующий шаг. Callback-data формата: check_sub:<funnelId>
    this.bot.callbackQuery(/^check_sub:(.+)$/, async (ctx) => {
      try {
        const funnelId = (ctx.match?.[1] || '').trim();
        const tgId = ctx.from?.id ? String(ctx.from.id) : null;
        if (!funnelId || !tgId) return;

        const funnel = await this.prisma.funnel.findUnique({
          where: { id: funnelId },
          select: {
            subscriptionChannelId: true,
            subscriptionChannelName: true,
            subscriptionPromptText: true,
            subscriptionSuccessText: true,
          },
        }).catch(() => null);

        if (!funnel?.subscriptionChannelId) {
          await ctx.answerCallbackQuery({ text: 'Канал не настроен', show_alert: false });
          return;
        }

        const isSubscribed = await this.checkChannelSubscription(
          funnel.subscriptionChannelId,
          tgId,
        );

        if (isSubscribed) {
          this.analyticsEvents.track({
            userId: tgId, // используется как anonId для бот-юзеров
            eventType: 'channel_subscribed' as any,
            eventName: funnel.subscriptionChannelId,
            payload: { funnelId, via: 'check_sub_button' },
          }).catch(() => {});

          const successText =
            funnel.subscriptionSuccessText?.trim() ||
            '✅ Спасибо за подписку! Открываем сервис.';
          await ctx.answerCallbackQuery({ text: 'Подписка подтверждена!', show_alert: false });
          const webAppUrl = this.configService.get<string>('WEB_APP_URL', 'https://prepodavai.ru');
          await ctx.reply(successText, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '🚀 Открыть ПреподаваИИ', web_app: { url: `${webAppUrl}/dashboard` } },
              ]],
            },
          });
        } else {
          const promptText =
            funnel.subscriptionPromptText?.trim() ||
            `Похоже, вы ещё не подписались на ${funnel.subscriptionChannelName || 'канал'}. Подпишитесь и нажмите ещё раз.`;
          await ctx.answerCallbackQuery({ text: 'Подписка не найдена', show_alert: true });
          await ctx.reply(promptText, { parse_mode: 'Markdown' });
        }
      } catch (e: any) {
        this.logger.warn(`check_sub callback failed: ${e?.message}`);
      }
    });
  }

  /**
   * Проверяет, подписан ли пользователь на канал. Бот должен быть
   * администратором канала, иначе getChatMember вернёт ошибку.
   */
  private async checkChannelSubscription(channelId: string, tgUserId: string): Promise<boolean> {
    try {
      const member = await this.bot.api.getChatMember(channelId, parseInt(tgUserId, 10));
      // member / administrator / creator — подписан
      // left / kicked / restricted — не подписан
      return ['member', 'administrator', 'creator'].includes(member.status);
    } catch (e: any) {
      this.logger.warn(`getChatMember failed for ${channelId}/${tgUserId}: ${e?.message}`);
      return false;
    }
  }

  private async handleStartPayload(
    tgId: string,
    payload: string,
    ctx: Context,
  ): Promise<{ funnelId?: string } | null> {
    // Токен smart-link имеет вид base64url из 10 байт → 14 символов
    // [A-Za-z0-9_-]. Если получили что-то другое — это legacy-payload,
    // игнорируем (registration-flow всё ещё может ловить его отдельно).
    if (!/^[A-Za-z0-9_-]{10,32}$/.test(payload)) return null;

    const attr = await this.smartLinkTokens.consume(payload);
    if (!attr) {
      this.logger.warn(
        `[START] token=${payload} НЕ НАЙДЕН в Redis ` +
        `(либо истёк >30мин, либо Redis недоступен, либо токен повторно использован)`,
      );
      return null;
    }
    this.logger.log(
      `[START] attribution: funnelId=${attr.funnelId || 'NONE'}, ` +
      `slug=${attr.slug}, age=${Math.round((Date.now() - attr.createdAt) / 1000)}s`,
    );

    this.logger.log(
      `/start smart-link: tgId=${tgId}, slug=${attr.slug}, ` +
      `utm=${attr.utmSource || '-'}/${attr.utmMedium || '-'}/${attr.utmCampaign || '-'}`,
    );

    // Если пользователь уже зарегистрирован на платформе и связал
    // Telegram — записываем UTM прямо в его профиль и шлём событие.
    const appUser = await this.prisma.appUser.findUnique({
      where: { telegramId: tgId },
      select: { id: true },
    }).catch(() => null);

    if (appUser) {
      await this.prisma.appUser.update({
        where: { id: appUser.id },
        data: {
          ...(attr.utmSource && { utmSource: attr.utmSource }),
          ...(attr.utmMedium && { utmMedium: attr.utmMedium }),
          ...(attr.utmCampaign && { utmCampaign: attr.utmCampaign }),
          ...(attr.utmContent && { utmContent: attr.utmContent }),
          ...(attr.utmTerm && { utmTerm: attr.utmTerm }),
        },
      }).catch((e) => this.logger.warn(`Apply UTM to AppUser failed: ${e?.message}`));

      this.analyticsEvents.track({
        userId: appUser.id,
        eventType: 'smart_link_click' as any,
        eventName: attr.slug,
        payload: { linkId: attr.linkId, autoTags: attr.autoTags },
        utmSource: attr.utmSource,
        utmMedium: attr.utmMedium,
        utmCampaign: attr.utmCampaign,
        utmContent: attr.utmContent,
        utmTerm: attr.utmTerm,
      }).catch(() => {});
    } else {
      // Новый юзер из бота. Откладываем атрибуцию на 30 дней — при
      // регистрации (verifyEmailCode) auth.service подхватит её из Redis
      // и проставит UTM на свежесозданный AppUser.
      await this.smartLinkTokens.storeForTgUser(tgId, attr);
    }

    // Если ссылка привязана к воронке — шлём кастомное welcome из неё.
    // Возвращаем funnelId наверх, чтобы /start handler не запустил
    // дефолтный subscription flow поверх воронки.
    if (attr.funnelId) {
      await this.sendFunnelWelcome(ctx, attr.funnelId);
      return { funnelId: attr.funnelId };
    }
    return {};
  }

  /**
   * Шлёт настроенное приветствие из конкретной воронки. Текст, кнопка и
   * (опционально) проверка подписки на канал берутся из БД, не из кода.
   */
  private async sendFunnelWelcome(ctx: Context, funnelId: string) {
    const funnel = await this.prisma.funnel.findUnique({
      where: { id: funnelId },
      select: {
        welcomeText: true,
        welcomeButtonLabel: true,
        welcomeButtonAction: true,
        welcomeButtonUrl: true,
        subscriptionChannelId: true,
        subscriptionChannelName: true,
      },
    }).catch((e) => {
      this.logger.error(`[FUNNEL_WELCOME] DB lookup failed for ${funnelId}: ${e?.message}`);
      return null;
    });

    this.logger.log(
      `[FUNNEL_WELCOME] funnelId=${funnelId}, ` +
      `welcomeText=${funnel?.welcomeText ? `"${funnel.welcomeText.slice(0, 30)}..."` : 'EMPTY'}, ` +
      `action=${funnel?.welcomeButtonAction}, ` +
      `url=${funnel?.welcomeButtonUrl || 'EMPTY'}`,
    );

    if (!funnel || !funnel.welcomeText?.trim()) {
      this.logger.warn(
        `[FUNNEL_WELCOME] welcomeText пустой → fallback на дефолтное приветствие`,
      );
      // Воронка без welcome-конфига — fallback на дефолт (web_app кнопка).
      const webAppUrl = this.configService.get<string>('WEB_APP_URL', 'https://prepodavai.ru');
      await ctx.reply('👋 Добро пожаловать в *ПреподаваИИ*!', {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🚀 Открыть ПреподаваИИ', web_app: { url: `${webAppUrl}/dashboard` } },
          ]],
        },
      });
      return;
    }

    const action = funnel.welcomeButtonAction || 'url';
    const label = funnel.welcomeButtonLabel?.trim() || 'Начать';
    let inlineKeyboard: any[][] = [];

    if (action === 'check_subscription' && funnel.subscriptionChannelId) {
      // Кнопка-перенаправление на канал + отдельная кнопка «Проверить подписку»
      const channel = funnel.subscriptionChannelId.startsWith('@')
        ? funnel.subscriptionChannelId.slice(1)
        : funnel.subscriptionChannelName?.replace(/^@/, '');
      const channelUrl = channel
        ? `https://t.me/${channel}`
        : funnel.welcomeButtonUrl || 'https://t.me';
      inlineKeyboard = [
        [{ text: `📢 ${label}`, url: channelUrl }],
        [{ text: '✅ Я подписался', callback_data: `check_sub:${funnelId}` }],
      ];
    } else if (action === 'mini_app') {
      const webAppUrl = funnel.welcomeButtonUrl?.trim() ||
        this.configService.get<string>('WEB_APP_URL', 'https://prepodavai.ru') + '/dashboard';
      inlineKeyboard = [[{ text: label, web_app: { url: webAppUrl } }]];
    } else {
      // 'url' (default)
      inlineKeyboard = [[
        { text: label, url: funnel.welcomeButtonUrl?.trim() || 'https://prepodavai.ru' },
      ]];
    }

    try {
      await ctx.reply(funnel.welcomeText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: inlineKeyboard },
      });
    } catch (e: any) {
      // Если Markdown сломался (текст с непарными *) — пробуем без parse_mode
      this.logger.warn(`sendFunnelWelcome markdown failed: ${e?.message}, retrying plain`);
      await ctx.reply(funnel.welcomeText, {
        reply_markup: { inline_keyboard: inlineKeyboard },
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Дефолтное приветствие + проверка подписки на канал
  // Используется для юзеров БЕЗ smart-link-воронки. Поведение 1:1 с
  // отдельным проектом /telegram-bot/main.ts и max.service.ts —
  // «Прорыв в репетиторстве». Канал и кнопка-ссылка из ENV.
  // ──────────────────────────────────────────────────────────────────────

  private getDefaultSubscriptionKeyboard(): any[][] {
    const channelUrl =
      this.configService.get<string>('TELEGRAM_CHANNEL_URL') ||
      'https://t.me/gotoChannelBot?startapp=TLc4259d96973fc7';
    return [
      [{ text: 'ПОДПИСАТЬСЯ НА КАНАЛ', url: channelUrl }],
      [{ text: 'Я ПОДПИСАЛСЯ', callback_data: 'sub:check' }],
    ];
  }

  private async sendDefaultActivationFlow(ctx: Context) {
    try {
      // Убираем reply-клавиатуру, если осталась от старого диалога
      await ctx.reply('Коллега, рада вас видеть 👋', {
        reply_markup: { remove_keyboard: true },
      });

      // Опционально — интро-видео (нужен file_id уже загруженного на серверы ТГ)
      const introVideoId = this.configService.get<string>('TELEGRAM_INTRO_VIDEO_ID');
      if (introVideoId && ctx.chat?.id) {
        await this.bot.api
          .sendVideoNote(ctx.chat.id, introVideoId)
          .catch((err: any) => this.logger.warn(`Intro video failed: ${err?.message}`));
      }

      await ctx.reply(DEFAULT_SUBSCRIPTION_TEXT, {
        reply_markup: { inline_keyboard: this.getDefaultSubscriptionKeyboard() },
      });
    } catch (e: any) {
      this.logger.warn(`sendDefaultActivationFlow failed: ${e?.message}`);
    }
  }

  private async handleDefaultSubscriptionCheck(ctx: Context, tgId: string) {
    const channelId = this.configService.get<string>('TELEGRAM_CHANNEL_ID');

    // Если канал не настроен в ENV — пропускаем проверку, даём доступ
    // (полезно на dev/staging без боевого канала).
    let isSubscribed = true;
    if (channelId) {
      isSubscribed = await this.checkChannelSubscription(channelId, tgId);
    } else {
      this.logger.warn(
        '[Sub] TELEGRAM_CHANNEL_ID not configured — skipping subscription check, granting access',
      );
    }

    if (!isSubscribed) {
      await ctx
        .answerCallbackQuery({ text: 'Подписка не найдена', show_alert: false })
        .catch(() => {});
      await ctx.reply(DEFAULT_NOT_SUBSCRIBED_TEXT, {
        reply_markup: { inline_keyboard: this.getDefaultSubscriptionKeyboard() },
      });
      return;
    }

    await ctx
      .answerCallbackQuery({ text: 'Доступ открыт ✅' })
      .catch(() => {});
    await ctx.reply(DEFAULT_SUBSCRIBED_TEXT);

    // Создаём shadow AppUser (как в /telegram-bot/main.ts), чтобы юзер
    // мог сразу пользоваться сервисом без полного email-онбординга.
    try {
      const shadowApiKey = crypto.randomBytes(16).toString('hex');
      const chatId = ctx.chat?.id ? String(ctx.chat.id) : null;
      await this.prisma.appUser.upsert({
        where: { telegramId: tgId },
        update: { lastAccessAt: new Date() },
        create: {
          telegramId: tgId,
          telegramChatId: chatId,
          chatId,
          username: `tg_${tgId}`,
          apiKey: shadowApiKey,
          source: 'telegram_bot',
        } as any,
      });

      this.analyticsEvents.track({
        userId: tgId, // anonId-режим для бот-юзеров без AppUser
        eventType: 'channel_subscribed' as any,
        eventName: channelId || 'default',
        payload: { via: 'default_sub_check' },
      }).catch(() => {});

      // Mini App кнопка — главный entry point после активации
      const webAppUrl = this.configService.get<string>('WEB_APP_URL', 'https://prepodavai.ru');
      await ctx.reply('🚀 Откройте сервис прямо здесь:', {
        reply_markup: {
          inline_keyboard: [[
            { text: '🚀 Открыть ПреподаваИИ', web_app: { url: `${webAppUrl}/dashboard` } },
          ]],
        },
      });
    } catch (e: any) {
      this.logger.warn(`Shadow user creation failed: ${e?.message}`);
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
   * Отправка сообщения AppUser'у по его id, если он привязал Telegram.
   * Тихо no-op, если у пользователя нет BotUser с telegramId.
   * Не бросает ошибки — только логирует.
   */
  async sendToAppUser(
    appUserId: string,
    text: string,
    opts?: { parseMode?: 'Markdown' | 'HTML' },
  ): Promise<boolean> {
    if (!this.bot) return false;
    try {
      const botUser = await (this.prisma as any).botUser.findFirst({
        where: { appUserId, telegramId: { not: null } },
        select: { telegramId: true },
      });
      if (!botUser?.telegramId) return false;
      await this.bot.api.sendMessage(botUser.telegramId, text, {
        parse_mode: opts?.parseMode,
      });
      return true;
    } catch (err) {
      this.logger.warn(
        `sendToAppUser failed for ${appUserId}: ${(err as Error).message}`,
      );
      return false;
    }
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
      // Для funnel-пользователей после 1-й и 3-й генерации — особое сообщение перед меню
      // (отправляем здесь, ПОСЛЕ PDF, а не из бота, который шлёт раньше PDF)
      //
      // Счётчик генераций инкрементим АТОМАРНО ровно здесь, в момент доставки результата:
      // это единственный источник истины (бот больше не инкрементит обычные генерации),
      // поэтому totalGenerations гарантированно равен порядковому номеру текущей генерации
      // без гонки между ботом и процессором доставки. Доставка идёт один раз на генерацию
      // (idempotency через флаг sentToTelegram в процессоре), так что двойного учёта нет.
      try {
        const botUser = await (this.prisma as any).botUser.update({
          where: { telegramId: appUser.telegramId },
          data: {
            totalGenerations: { increment: 1 },
            generationsThisMonth: { increment: 1 },
            lastGenerationAt: new Date(),
          },
          select: { source: true, totalGenerations: true },
        }).catch(() => null);
        if (botUser?.source === 'funnel_bot' && botUser?.totalGenerations === 1) {
          await this.bot.api.sendMessage(
            chatId,
            `Готово — ваш первый материал собран.\n👆 PDF выше.\n\nПара минут вместо вечера — и так с каждым материалом.\n\nЗавтра нужен тест для девятого класса? — собрали за минуту\nК выходным презентация для малышей? — собрали\nКто-то поплыл в теме? — за пять минут готов рабочий лист именно под его пробел.\n\nСоберём следующий?\nВыбирайте инструмент:`,
          ).catch(() => {});
        } else if (botUser?.source === 'funnel_bot' && botUser?.totalGenerations === 3) {
          const webAppUrl = process.env.WEBAPP_URL || 'https://prepodavai.ru';
          await this.bot.api.sendMessage(
            chatId,
            `А с платформой ПреподаваИИ вы уже знакомы? 👀\n\nБот — это только часть нашей платформы. Им удобно быстро собрать материал, и вы это уже распробовали.\n\nНо ПреподаваИИ — это ещё и целая платформа, и там вы ведёте ученика целиком до результата.\n\nКак это выглядит на одном ученике:\n— заводите его (или сразу всю группу) — листы и тесты ученика лежат у него, а не в общей куче «Загрузок»;\n— генерируете материал и тут же выдаёте ему как домашку — прямо на платформе, без «скинул в телеграме»;\n— ученик решает и отправляет работу обратно туда же;\n— ИИ может проверить её сам — вы не сидите вечером над пачкой тетрадей;\n— а в аналитике видно: причастия он третью неделю валит — и следующий лист вы собираете ровно под это.\n\nИ всё это абсолютно бесплатно — так же, как бот. Без пробного периода, который однажды кончится, и без тарифа, который ждёт за углом.\nБот под рукой для быстрой задачи, платформа — чтобы вести учеников целиком.`,
            {
              reply_markup: {
                inline_keyboard: [[{ text: '🚀 Перейти на платформу', url: webAppUrl }]],
              },
            },
          ).catch(() => {});
        }
      } catch {}

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
      // Если URL пришёл из pptxUrl — это PPTX независимо от того, есть ли .pptx в пути
      const isPptx =
        result?.pptxUrl === exportUrl ||
        exportUrl.toLowerCase().includes('.pptx') ||
        exportUrl.toLowerCase().includes('pptx');
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
    let content: any;
    if (result?.format === 'json-blocks-v1' && result?.outputDoc) {
      try {
        const { renderDocumentToHtml } = await import('../generations/v2/json-to-html');
        const { GenerationDocument } = await import('../generations/v2/blocks-schema');
        const parsed = GenerationDocument.safeParse(result.outputDoc);
        content = parsed.success
          ? renderDocumentToHtml(parsed.data, { showAnswers: false })
          : result?.content || result;
      } catch {
        content = result?.content || result;
      }
    } else {
      content = result?.htmlResult || result?.content || result;
    }
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
