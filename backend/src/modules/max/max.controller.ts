import { Controller, Post, Body, HttpCode, Get, Query, BadRequestException, UseGuards } from '@nestjs/common';
import { MaxService } from './max.service';
import { WebhookAuthGuard } from '../webhooks/guards/webhook-auth.guard';

@Controller('webhook/max')
export class MaxController {
  constructor(private readonly maxService: MaxService) {}

  @Get('setup')
  @UseGuards(WebhookAuthGuard)
  async setupWebhook(@Query('url') url: string) {
    if (!url) {
      throw new BadRequestException('URL query parameter is required. Example: ?url=https://api.prepodavai.ru/api/webhook/max');
    }

    // Валидация URL: разрешаем только наш домен
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

  @Post()
  @HttpCode(200)
  @UseGuards(WebhookAuthGuard)
  async handleWebhook(@Body() body: any) {
    await this.maxService.handleWebhook(body);
    return { ok: true };
  }
}
