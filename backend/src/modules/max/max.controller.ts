import { Controller, Post, Body, HttpCode, Get, Query, BadRequestException } from '@nestjs/common';
import { MaxService } from './max.service';

@Controller('webhook/max')
export class MaxController {
  constructor(private readonly maxService: MaxService) {}

  @Get('setup')
  async setupWebhook(@Query('url') url: string) {
    if (!url) {
      throw new BadRequestException('URL query parameter is required. Example: ?url=https://api.prepodavai.ru/api/webhook/max');
    }
    return await this.maxService.subscribeWebhook(url);
  }

  @Post()
  @HttpCode(200)
  async handleWebhook(@Body() body: any) {
    console.log('\n================ MAX WEBHOOK RECEIVED ================')
    console.log(JSON.stringify(body, null, 2))
    console.log('========================================================\n')
    
    // В зависимости от конфигурации MAX мессенджера можно добавить
    // проверку заголовка авторизации или подписи.
    await this.maxService.handleWebhook(body);
    return { ok: true };
  }
}
