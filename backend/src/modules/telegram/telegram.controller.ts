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
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { TelegramService } from './telegram.service';
import { WebhookAuthGuard } from '../webhooks/guards/webhook-auth.guard';

@Controller('webhook/telegram')
export class TelegramController {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly configService: ConfigService,
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
}
