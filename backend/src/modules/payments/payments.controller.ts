import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
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
    @Body() body: { planKey: string; consentGiven: boolean },
  ) {
    if (!body.planKey) {
      throw new BadRequestException('planKey обязателен');
    }
    if (!body.consentGiven) {
      throw new BadRequestException('Необходимо согласие на автоматические списания');
    }
    const ip: string = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
    const userAgent: string = req.headers['user-agent'] || '';
    return this.paymentsService.createOrder(req.user.id, body.planKey, ip, userAgent);
  }

  /**
   * Проверяет HMAC-подпись CloudPayments.
   * Подпись обязательна — отсутствие заголовка или rawBody отклоняется.
   */
  private assertHmac(req: any, label: string): void {
    const signature = req.headers['content-hmac'] as string | undefined;
    if (!signature) {
      this.logger.warn(`${label}: отсутствует заголовок Content-HMAC`);
      throw new UnauthorizedException('Missing HMAC signature');
    }
    const rawBody: Buffer | undefined = req.rawBody;
    if (!rawBody) {
      this.logger.warn(`${label}: rawBody не захвачен`);
      throw new UnauthorizedException('Raw body unavailable');
    }
    if (!this.paymentsService.verifyHmac(rawBody, signature)) {
      this.logger.warn(`${label}: неверная HMAC подпись`);
      throw new UnauthorizedException('Invalid HMAC signature');
    }
  }

  /**
   * Webhook Pay — CloudPayments уведомляет об успешной оплате.
   * Аутентификация через обязательную HMAC-SHA256 подпись.
   */
  @Post('webhook/pay')
  @SkipThrottle()
  async webhookPay(@Req() req: any, @Body() body: Record<string, any>) {
    this.assertHmac(req, 'Pay webhook');
    return this.paymentsService.handlePayWebhook(body);
  }

  /**
   * Webhook Fail — CloudPayments уведомляет о неудачной оплате.
   */
  @Post('webhook/fail')
  @SkipThrottle()
  async webhookFail(@Req() req: any, @Body() body: Record<string, any>) {
    this.assertHmac(req, 'Fail webhook');
    return this.paymentsService.handleFailWebhook(body);
  }

  /**
   * Webhook Recurrent — CloudPayments уведомляет об изменении статуса подписки.
   */
  @Post('webhook/recurrent')
  @SkipThrottle()
  async webhookRecurrent(@Req() req: any, @Body() body: Record<string, any>) {
    this.assertHmac(req, 'Recurrent webhook');
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
