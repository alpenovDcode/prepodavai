import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly CP_API_URL = 'https://api.cloudpayments.ru';

  private get apiSecret(): string {
    return this.configService.get<string>('CLOUDPAYMENTS_API_SECRET', '');
  }

  private get publicId(): string {
    return this.configService.get<string>('CLOUDPAYMENTS_PUBLIC_ID', '');
  }

  constructor(
    private prisma: PrismaService,
    private subscriptionsService: SubscriptionsService,
    private configService: ConfigService,
  ) {}

  /**
   * Создать заказ перед открытием виджета.
   * Возвращает данные для инициализации виджета CloudPayments.
   */
  async createOrder(userId: string, planKey: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { planKey },
    });

    if (!plan || !plan.isActive) {
      throw new Error(`Тариф "${planKey}" не найден`);
    }

    const price = plan.price.toNumber();
    if (price === 0) {
      throw new Error('Бесплатный тариф не требует оплаты');
    }

    const invoiceId = crypto.randomUUID();

    await this.prisma.payment.create({
      data: {
        userId,
        planKey,
        amount: plan.price,
        currency: 'RUB',
        status: 'pending',
        invoiceId,
        isRecurrent: true,
      },
    });

    return {
      invoiceId,
      publicId: this.publicId,
      amount: price,
      currency: 'RUB',
      description: `Тариф ${plan.planName} — Преподавай`,
      accountId: userId,
      planKey,
      planName: plan.planName,
    };
  }

  /**
   * Проверка HMAC-SHA256 подписи от CloudPayments.
   * CloudPayments подписывает raw body запроса ключом API Secret,
   * результат (Base64) передаёт в заголовке Content-HMAC.
   */
  verifyHmac(rawBody: Buffer | string, signature: string): boolean {
    if (!this.apiSecret) {
      this.logger.warn('CLOUDPAYMENTS_API_SECRET не задан — пропускаем проверку HMAC');
      return true;
    }
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    const expected = crypto
      .createHmac('sha256', this.apiSecret)
      .update(body)
      .digest('base64');
    return expected === signature;
  }

  /**
   * Обработка Pay-уведомления (успешная оплата).
   * Вызывается и при первом платеже, и при каждом рекуррентном списании.
   */
  async handlePayWebhook(body: Record<string, any>) {
    const {
      TransactionId,
      Amount,
      InvoiceId,
      AccountId,
      Status,
      Token,
      SubscriptionId,
      JsonData,
    } = body;

    this.logger.log(
      `Pay webhook: TxId=${TransactionId}, InvoiceId=${InvoiceId}, Status=${Status}, AccountId=${AccountId}, SubId=${SubscriptionId}`,
    );

    if (Status !== 'Completed') {
      return { code: 0 };
    }

    try {
      // Найти ожидающий платёж по invoiceId
      const payment = InvoiceId
        ? await this.prisma.payment.findUnique({ where: { invoiceId: InvoiceId } })
        : null;

      const userId: string = payment?.userId || AccountId;
      if (!userId) {
        this.logger.warn(`Pay webhook: userId не определён, TxId=${TransactionId}`);
        return { code: 0 };
      }

      // Идемпотентность: уже обработан
      if (payment?.status === 'completed') {
        return { code: 0 };
      }

      const planKey: string | null =
        payment?.planKey || this.extractPlanKey(JsonData) || null;

      if (!planKey) {
        this.logger.warn(`Pay webhook: planKey не найден, TxId=${TransactionId}`);
        return { code: 0 };
      }

      // Обновить запись Payment
      if (payment) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'completed',
            cpTransactionId: String(TransactionId),
            cpSubscriptionId: SubscriptionId ?? null,
            cpToken: Token ?? null,
          },
        });
      } else {
        // Рекуррентный платёж без InvoiceId — новая строка
        await this.prisma.payment.create({
          data: {
            userId,
            planKey,
            amount: Amount,
            currency: 'RUB',
            status: 'completed',
            invoiceId: `recurrent_${TransactionId}`,
            cpTransactionId: String(TransactionId),
            cpSubscriptionId: SubscriptionId ?? null,
            cpToken: Token ?? null,
            isRecurrent: true,
          },
        });
      }

      // Активировать или продлить подписку
      const currentSub = await this.prisma.userSubscription.findUnique({
        where: { userId },
        include: { plan: true },
      });

      const isSamePlan = currentSub?.plan?.planKey === planKey;

      if (isSamePlan) {
        // Продление: добавляем токены и сдвигаем дату
        await this.subscriptionsService.renewSubscription(
          userId,
          planKey,
          Token ?? undefined,
          SubscriptionId ?? undefined,
        );
      } else {
        // Апгрейд тарифа
        await this.subscriptionsService.upgradePlan(userId, planKey);

        if (Token || SubscriptionId) {
          await this.prisma.userSubscription.update({
            where: { userId },
            data: {
              ...(Token ? { cpCardToken: Token } : {}),
              ...(SubscriptionId ? { cpSubscriptionId: SubscriptionId } : {}),
            },
          });
        }
      }

      this.logger.log(
        `✅ Plan ${isSamePlan ? 'renewed' : 'upgraded'}: userId=${userId}, plan=${planKey}, TxId=${TransactionId}`,
      );
    } catch (err) {
      this.logger.error(`Pay webhook error: ${err.message}`, err.stack);
    }

    return { code: 0 };
  }

  /**
   * Обработка Fail-уведомления (неудачный платёж).
   */
  async handleFailWebhook(body: Record<string, any>) {
    const { TransactionId, InvoiceId, Reason, ReasonCode } = body;
    this.logger.warn(
      `Fail webhook: TxId=${TransactionId}, InvoiceId=${InvoiceId}, Reason=${Reason} (${ReasonCode})`,
    );

    if (InvoiceId) {
      await this.prisma.payment.updateMany({
        where: { invoiceId: InvoiceId, status: 'pending' },
        data: { status: 'failed', cpTransactionId: String(TransactionId) },
      });
    }

    return { code: 0 };
  }

  /**
   * Обработка Recurrent-уведомления (изменение статуса рекуррентной подписки).
   */
  async handleRecurrentWebhook(body: Record<string, any>) {
    const { Id, AccountId, Status } = body;
    this.logger.log(
      `Recurrent webhook: SubId=${Id}, AccountId=${AccountId}, Status=${Status}`,
    );

    if (Status === 'Cancelled') {
      const userSub = await this.prisma.userSubscription.findFirst({
        where: { cpSubscriptionId: Id },
      });

      if (userSub) {
        await this.prisma.userSubscription.update({
          where: { id: userSub.id },
          data: { autoRenew: false, cpSubscriptionId: null },
        });
        this.logger.log(`Recurrent subscription cancelled: userId=${userSub.userId}`);
      }
    }

    return { code: 0 };
  }

  /**
   * Отменить рекуррентную подписку в CloudPayments (по запросу пользователя).
   */
  async cancelCloudSubscription(userId: string) {
    const sub = await this.prisma.userSubscription.findUnique({
      where: { userId },
    });

    if (!sub?.cpSubscriptionId) {
      return { success: false, message: 'Нет активной рекуррентной подписки' };
    }

    const response = await axios.post(
      `${this.CP_API_URL}/subscriptions/cancel`,
      { Id: sub.cpSubscriptionId },
      {
        auth: { username: this.publicId, password: this.apiSecret },
        headers: { 'Content-Type': 'application/json' },
      },
    );

    if (response.data.Success) {
      await this.prisma.userSubscription.update({
        where: { userId },
        data: { autoRenew: false, cpSubscriptionId: null },
      });
      return { success: true };
    }

    return { success: false, message: response.data.Message };
  }

  /**
   * Получить статус подписки из CloudPayments (для отладки).
   */
  async getCloudSubscriptionStatus(userId: string) {
    const sub = await this.prisma.userSubscription.findUnique({
      where: { userId },
    });

    if (!sub?.cpSubscriptionId) {
      return { success: false, message: 'Нет рекуррентной подписки' };
    }

    const response = await axios.post(
      `${this.CP_API_URL}/subscriptions/get`,
      { Id: sub.cpSubscriptionId },
      {
        auth: { username: this.publicId, password: this.apiSecret },
        headers: { 'Content-Type': 'application/json' },
      },
    );

    return response.data;
  }

  private extractPlanKey(jsonData: unknown): string | null {
    try {
      const data =
        typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      return (data as any)?.planKey ?? null;
    } catch {
      return null;
    }
  }
}
