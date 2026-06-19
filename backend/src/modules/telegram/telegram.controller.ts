import {
  Controller,
  Post,
  Body,
  HttpCode,
  Get,
  Query,
  BadRequestException,
  UnauthorizedException,
  UseGuards,
  Headers,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { TelegramService } from './telegram.service';
import { WebhookAuthGuard } from '../webhooks/guards/webhook-auth.guard';
import { EmailService } from '../../common/services/email.service';
import { AnalyticsEventsService } from '../analytics-events/analytics-events.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SmartLinkTokensService } from '../smart-links/smart-link-tokens.service';

@Controller('webhook/telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly telegramService: TelegramService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly analyticsEvents: AnalyticsEventsService,
    private readonly prisma: PrismaService,
    private readonly smartLinkTokens: SmartLinkTokensService,
  ) {}

  /**
   * Настройка вебхука — защищена WebhookAuthGuard.
   * Вызывается вручную один раз: GET /api/webhook/telegram/setup?url=https://api.prepodavai.ru/api/webhook/telegram
   */
  @Get('setup')
  @UseGuards(WebhookAuthGuard)
  async setupWebhook(@Query('url') url: string) {
    if (!url) {
      throw new BadRequestException(
        'URL query parameter is required. Example: ?url=https://api.prepodavai.ru/api/webhook/telegram',
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL format');
    }

    const ALLOWED_WEBHOOK_HOSTS = ['api.prepodavai.ru', 'prepodavai.ru', 'localhost'];

    if (!ALLOWED_WEBHOOK_HOSTS.includes(parsedUrl.hostname)) {
      throw new BadRequestException('Only trusted domains are allowed as webhook URL');
    }

    return await this.telegramService.setupWebhook(url);
  }

  /**
   * Входящие обновления от Telegram.
   * Telegram отправляет POST на этот URL для каждого сообщения.
   */
  @Post()
  @HttpCode(200)
  @SkipThrottle()
  async handleWebhook(@Body() body: any) {
    // Логируем САМЫЙ ВЕРХ webhook'а, чтобы понять — приходят ли вообще
    // запросы от Telegram. Если этих логов нет — проблема в webhook URL
    // (BotFather → не туда указано), либо токен не от того бота.
    const updateType = body?.message ? 'message' :
                       body?.callback_query ? 'callback_query' :
                       body?.edited_message ? 'edited_message' :
                       Object.keys(body || {}).filter(k => k !== 'update_id').join(',') || 'unknown';
    const fromId = body?.message?.from?.id || body?.callback_query?.from?.id;
    const text = body?.message?.text || body?.callback_query?.data;
    this.logger.log(
      `[WEBHOOK] type=${updateType} fromId=${fromId} text=${JSON.stringify(text)}`,
    );

    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      this.logger.error(`[WEBHOOK] TELEGRAM_BOT_TOKEN not set — bot disabled!`);
      throw new UnauthorizedException('Telegram bot not configured');
    }

    await this.telegramService.handleWebhook(body);
    return { ok: true };
  }

  /**
   * Внутренний endpoint: отправка welcome email после регистрации через бот.
   * Защищён токеном бота (x-bot-secret header).
   */
  @Post('internal/send-welcome-email')
  @HttpCode(200)
  @SkipThrottle()
  async sendWelcomeEmailInternal(
    @Body() body: { username: string; password: string; email: string },
    @Headers('x-bot-secret') secret: string,
  ) {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken || secret !== botToken) {
      throw new UnauthorizedException('Invalid secret');
    }
    if (!body.username || !body.password || !body.email) {
      throw new BadRequestException('username, password and email are required');
    }
    await this.emailService.sendWelcomeEmail(body.username, body.password, body.email);
    return { ok: true };
  }

  /**
   * Внутренний endpoint: бот сообщает о подписке/отписке от ТГ-канала.
   * Используется в воронке «клик → подписка на канал → первая генерация».
   * Защищён x-bot-secret header (как и send-welcome-email).
   */
  @Post('internal/channel-event')
  @HttpCode(200)
  @SkipThrottle()
  async channelEventInternal(
    @Body() body: {
      telegramId: string;
      channelId: string;
      eventType: 'channel_subscribed' | 'channel_unsubscribed';
      username?: string | null;
      firstName?: string | null;
    },
    @Headers('x-bot-secret') secret: string,
  ) {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken || secret !== botToken) {
      throw new UnauthorizedException('Invalid secret');
    }
    if (!body?.telegramId || !body?.eventType) {
      throw new BadRequestException('telegramId and eventType required');
    }

    // Если этот ТГ-юзер уже привязан к веб-аккаунту — фиксируем userId.
    // Если нет — пишем событие с anonId=telegramId, чтобы потом склеить
    // при привязке (claimAnonEvents в auth flow).
    let userId: string | null = null;
    try {
      const appUser = await this.prisma.appUser.findFirst({
        where: { telegramId: body.telegramId },
        select: { id: true },
      });
      userId = appUser?.id ?? null;
    } catch { /* ignore */ }

    await this.analyticsEvents.track({
      userId,
      anonId: userId ? null : `tg:${body.telegramId}`,
      eventType: body.eventType,
      payload: {
        telegramId: body.telegramId,
        channelId: body.channelId,
        username: body.username || null,
        firstName: body.firstName || null,
        source: 'bot_webhook',
      },
    });

    return { ok: true };
  }

  /**
   * Внутренний endpoint: TG-бот (отдельный сервис telegram-bot/main.ts)
   * проверяет, прислан ли в /start <payload> smart-link токен и получает
   * полный welcome-конфиг привязанной воронки. Защищён x-bot-secret.
   *
   * Поток:
   *   юзер кликает prepodavai.ru/g/<slug>
   *   → middleware → редирект → бэк ставит токен в Redis (TTL 30мин),
   *     302 на t.me/<bot>?start=<token>
   *   → TG-бот ловит /start <token>
   *   → шлёт сюда POST {token, telegramId}
   *   → возвращаем atribution + funnel welcome (если есть)
   */
  @Post('internal/smart-link/consume')
  @HttpCode(200)
  @SkipThrottle()
  async consumeSmartLink(
    @Body() body: { token: string; telegramId?: string },
    @Headers('x-bot-secret') secret: string,
  ) {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken || secret !== botToken) {
      throw new UnauthorizedException('Invalid secret');
    }
    if (!body?.token) throw new BadRequestException('token required');

    const attr = await this.smartLinkTokens.consume(body.token);
    if (!attr) {
      this.logger.warn(`[SMART_LINK_CONSUME] token=${body.token} not found / expired`);
      return { found: false };
    }
    this.logger.log(
      `[SMART_LINK_CONSUME] token=${body.token} slug=${attr.slug} ` +
      `funnelId=${attr.funnelId || 'NONE'} tgId=${body.telegramId}`,
    );

    // Если есть funnelId — резолвим welcome-конфиг и UTM сразу здесь, чтобы
    // боту не нужны были отдельные запросы.
    let welcome: any = null;
    if (attr.funnelId) {
      const funnel = await this.prisma.funnel.findUnique({
        where: { id: attr.funnelId },
        select: {
          welcomeText: true,
          welcomeButtonLabel: true,
          welcomeButtonAction: true,
          welcomeButtonUrl: true,
          subscriptionChannelId: true,
          subscriptionChannelName: true,
          subscriptionPromptText: true,
          subscriptionSuccessText: true,
        },
      }).catch(() => null);
      if (funnel?.welcomeText?.trim()) welcome = funnel;
    }

    // Сохраняем отложенную атрибуцию по telegramId — нужно для случая,
    // когда AppUser ещё не создан (бот сам сделает upsert), а UTM хотим
    // потом подхватить при регистрации.
    if (body.telegramId) {
      await this.smartLinkTokens.storeForTgUser(body.telegramId, attr);
    }

    // Если AppUser уже существует — сразу обновляем UTM на нём.
    if (body.telegramId) {
      const appUser = await this.prisma.appUser.findUnique({
        where: { telegramId: body.telegramId },
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
        }).catch(() => {});
      }
    }

    return {
      found: true,
      slug: attr.slug,
      utm: {
        source: attr.utmSource,
        medium: attr.utmMedium,
        campaign: attr.utmCampaign,
        content: attr.utmContent,
        term: attr.utmTerm,
      },
      autoTags: attr.autoTags || [],
      funnelId: attr.funnelId || null,
      welcome,
    };
  }

  /**
   * Внутренний endpoint: TG-бот запрашивает welcome-конфиг воронки по ID.
   * Используется при callback `funnel_sub:<funnelId>` — бот хочет узнать
   * channelId и тексты, чтобы проверить подписку.
   */
  @Get('internal/funnel-welcome')
  @SkipThrottle()
  async getFunnelWelcome(
    @Query('id') id: string,
    @Headers('x-bot-secret') secret: string,
  ) {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken || secret !== botToken) {
      throw new UnauthorizedException('Invalid secret');
    }
    if (!id) throw new BadRequestException('id required');

    const funnel = await this.prisma.funnel.findUnique({
      where: { id },
      select: {
        welcomeText: true,
        welcomeButtonLabel: true,
        welcomeButtonAction: true,
        welcomeButtonUrl: true,
        subscriptionChannelId: true,
        subscriptionChannelName: true,
        subscriptionPromptText: true,
        subscriptionSuccessText: true,
      },
    }).catch(() => null);
    return funnel || {};
  }
}
