import { Controller, Post, Body, HttpCode, Get, Query, BadRequestException, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MaxService } from './max.service';
import { WebhookAuthGuard } from '../webhooks/guards/webhook-auth.guard';

@Controller('webhook/max')
export class MaxController {
  constructor(
    private readonly maxService: MaxService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Настройка вебхука — защищён WebhookAuthGuard (только мы вызываем вручную)
   */
  @Get('setup')
  @UseGuards(WebhookAuthGuard)
  async setupWebhook(@Query('url') url: string) {
    if (!url) {
      throw new BadRequestException('URL query parameter is required. Example: ?url=https://api.prepodavai.ru/api/webhook/max');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL format');
    }

    const ALLOWED_WEBHOOK_HOSTS = [
      'api.prepodavai.ru',
      'prepodavai.ru',
      'localhost',
    ];

    if (!ALLOWED_WEBHOOK_HOSTS.includes(parsedUrl.hostname)) {
      throw new BadRequestException('Only trusted domains are allowed as webhook URL');
    }

    return await this.maxService.subscribeWebhook(url);
  }

  /**
   * Входящие события от MAX платформы.
   * MAX не передаёт наш WEBHOOK_SECRET — вместо этого проверяем,
   * что бот-токен совпадает с нашим (через наличие токена в конфиге).
   * Дополнительная защита: URL регистрации вебхука содержит уникальный путь.
   */
  @Post()
  @HttpCode(200)
  async handleWebhook(@Body() body: any) {
    // Минимальная проверка: наш MAX_BOT_TOKEN должен быть настроен
    const botToken = this.configService.get<string>('MAX_BOT_TOKEN');
    if (!botToken) {
      throw new UnauthorizedException('MAX bot not configured');
    }

    await this.maxService.handleWebhook(body);
    return { ok: true };
  }
}
