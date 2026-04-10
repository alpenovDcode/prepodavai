import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  BadRequestException,
  Logger,
  Delete,
  Get,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Создать заказ — вызывается перед открытием виджета CloudPayments.
   * Возвращает параметры для инициализации виджета.
   */
  @Post('create-order')
  @UseGuards(JwtAuthGuard)
  async createOrder(
    @Req() req: any,
    @Body() body: { planKey: string },
  ) {
    if (!body.planKey) {
      throw new BadRequestException('planKey обязателен');
    }
    return this.paymentsService.createOrder(req.user.id, body.planKey);
  }

  /**
   * Webhook Pay — CloudPayments уведомляет об успешной оплате.
   * Не требует JWT — аутентификация через HMAC-SHA256 подпись.
   */
  @Post('webhook/pay')
  @SkipThrottle()
  async webhookPay(@Req() req: any, @Body() body: Record<string, any>) {
    const signature = req.headers['content-hmac'] as string;

    if (signature) {
      const rawBody: Buffer | undefined = req.rawBody;
      if (rawBody && !this.paymentsService.verifyHmac(rawBody, signature)) {
        this.logger.warn('Pay webhook: неверная HMAC подпись');
        return { code: 13 }; // ошибка авторизации
      }
    }

    return this.paymentsService.handlePayWebhook(body);
  }

  /**
   * Webhook Fail — CloudPayments уведомляет о неудачной оплате.
   */
  @Post('webhook/fail')
  @SkipThrottle()
  async webhookFail(@Req() req: any, @Body() body: Record<string, any>) {
    const signature = req.headers['content-hmac'] as string;

    if (signature) {
      const rawBody: Buffer | undefined = req.rawBody;
      if (rawBody && !this.paymentsService.verifyHmac(rawBody, signature)) {
        this.logger.warn('Fail webhook: неверная HMAC подпись');
        return { code: 13 };
      }
    }

    return this.paymentsService.handleFailWebhook(body);
  }

  /**
   * Webhook Recurrent — CloudPayments уведомляет об изменении статуса подписки.
   */
  @Post('webhook/recurrent')
  @SkipThrottle()
  async webhookRecurrent(@Req() req: any, @Body() body: Record<string, any>) {
    const signature = req.headers['content-hmac'] as string;

    if (signature) {
      const rawBody: Buffer | undefined = req.rawBody;
      if (rawBody && !this.paymentsService.verifyHmac(rawBody, signature)) {
        this.logger.warn('Recurrent webhook: неверная HMAC подпись');
        return { code: 13 };
      }
    }

    return this.paymentsService.handleRecurrentWebhook(body);
  }

  /**
   * Отменить рекуррентную подписку в CloudPayments.
   */
  @Delete('subscription')
  @UseGuards(JwtAuthGuard)
  async cancelSubscription(@Req() req: any) {
    return this.paymentsService.cancelCloudSubscription(req.user.id);
  }

  /**
   * Статус рекуррентной подписки в CloudPayments (для отладки/поддержки).
   */
  @Get('subscription/status')
  @UseGuards(JwtAuthGuard)
  async getSubscriptionStatus(@Req() req: any) {
    return this.paymentsService.getCloudSubscriptionStatus(req.user.id);
  }
}
