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
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { TelegramService } from './telegram.service';
import { WebhookAuthGuard } from '../webhooks/guards/webhook-auth.guard';
import { EmailService } from '../../common/services/email.service';
import { AnalyticsEventsService } from '../analytics-events/analytics-events.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('webhook/telegram')
export class TelegramController {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly analyticsEvents: AnalyticsEventsService,
    private readonly prisma: PrismaService,
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
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
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
}
