import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from '../../notifications/notifications.service';
import { TelegramService } from '../../telegram/telegram.service';
import { MessageDebouncer } from './message-debouncer';

const MESSAGE_DEBOUNCE_MS = 30_000;

const linkTo = (dialogId: string) => `/dashboard/dialogs/${dialogId}`;

interface DialogLite {
  id: string;
  leadId?: string;
  responderId: string;
  paymentDeadline?: Date | string | null;
  lead: {
    id: string;
    subject: string;
    creatorId: string;
    type?: string;
  };
}

@Injectable()
export class TutorExchangeNotifier {
  private readonly logger = new Logger(TutorExchangeNotifier.name);
  private readonly messageDebouncer = new MessageDebouncer();

  constructor(
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramService,
  ) {}

  async notifyDialogCreated(dialog: DialogLite): Promise<void> {
    await this.deliver(dialog.lead.creatorId, {
      type: 'tutor_exchange.dialog_created',
      title: `Отклик на заявку «${dialog.lead.subject}»`,
      message: 'Репетитор откликнулся на вашу заявку. Откройте диалог, чтобы назначить пробный урок.',
      metadata: { dialogId: dialog.id, leadId: dialog.lead.id },
      tgText: `📨 На вашу заявку «${dialog.lead.subject}» откликнулся репетитор. Откройте диалог: ${linkTo(dialog.id)}`,
    });
  }

  async notifyTrialScheduled(dialog: DialogLite): Promise<void> {
    await this.deliver(dialog.responderId, {
      type: 'tutor_exchange.trial_scheduled',
      title: 'Назначен пробный урок',
      message: `По заявке «${dialog.lead.subject}» назначен пробный урок.`,
      metadata: { dialogId: dialog.id },
    });
  }

  async notifyTrialResult(dialog: DialogLite, success: boolean): Promise<void> {
    await this.deliver(dialog.lead.creatorId, {
      type: 'tutor_exchange.trial_result',
      title: success ? 'Пробный урок прошёл успешно' : 'Пробный урок не удался',
      message: success
        ? `Репетитор подтвердил успешный пробный по «${dialog.lead.subject}».`
        : `Пробный урок по «${dialog.lead.subject}» не удался. Заявка возвращена в ленту.`,
      metadata: { dialogId: dialog.id, success },
      tgText: `${success ? '✅' : '⚠️'} Пробный по «${dialog.lead.subject}» ${success ? 'успешно' : 'не удался'}: ${linkTo(dialog.id)}`,
    });
  }

  async notifyPaymentReported(dialog: DialogLite): Promise<void> {
    await this.deliver(dialog.lead.creatorId, {
      type: 'tutor_exchange.payment_reported',
      title: 'Репетитор отметил оплату',
      message: `Проверьте получение комиссии по заявке «${dialog.lead.subject}» и подтвердите закрытие.`,
      metadata: { dialogId: dialog.id },
      tgText: `💸 Репетитор отметил оплату по «${dialog.lead.subject}». Подтвердите: ${linkTo(dialog.id)}`,
    });
  }

  async notifyPaymentConfirmed(dialog: DialogLite): Promise<void> {
    await this.deliver(dialog.responderId, {
      type: 'tutor_exchange.payment_confirmed',
      title: 'Оплата подтверждена',
      message: `Сделка по заявке «${dialog.lead.subject}» закрыта. Контакт ученика открыт.`,
      metadata: { dialogId: dialog.id },
      tgText: `🎉 Сделка «${dialog.lead.subject}» закрыта. Контакт ученика открыт: ${linkTo(dialog.id)}`,
    });
  }

  async notifyPaymentOverdue(dialog: DialogLite): Promise<void> {
    await this.deliver(dialog.lead.creatorId, {
      type: 'tutor_exchange.payment_overdue',
      title: 'Просрочена оплата комиссии',
      message: `Репетитор просрочил оплату по «${dialog.lead.subject}». Свяжитесь с ним или откройте спор.`,
      metadata: { dialogId: dialog.id },
      tgText: `⏰ Просрочена оплата по «${dialog.lead.subject}»: ${linkTo(dialog.id)}`,
    });
  }

  async notifyDisputeOpened(dialog: DialogLite, actorId: string): Promise<void> {
    const other = actorId === dialog.responderId ? dialog.lead.creatorId : dialog.responderId;
    await this.deliver(other, {
      type: 'tutor_exchange.dispute_opened',
      title: 'Открыт спор',
      message: `По заявке «${dialog.lead.subject}» открыт спор. Модератор рассмотрит ситуацию.`,
      metadata: { dialogId: dialog.id, actorId },
      tgText: `⚠️ Открыт спор по «${dialog.lead.subject}»: ${linkTo(dialog.id)}`,
    });
  }

  /** Not awaited — вызывается синхронно из sendMessage. */
  notifyMessageNew(dialog: DialogLite, senderId: string, recipientId: string): void {
    const key = `${recipientId}:${dialog.id}`;
    this.messageDebouncer.schedule(key, MESSAGE_DEBOUNCE_MS, async (count) => {
      try {
        await this.deliver(recipientId, {
          type: 'tutor_exchange.message_new',
          title: 'Новые сообщения в диалоге',
          message: count === 1
            ? `Новое сообщение по заявке «${dialog.lead.subject}».`
            : `У вас ${count} новых сообщений по заявке «${dialog.lead.subject}».`,
          metadata: { dialogId: dialog.id, count, senderId },
          tgText: count === 1
            ? `💬 Новое сообщение в диалоге «${dialog.lead.subject}»: ${linkTo(dialog.id)}`
            : `💬 ${count} новых сообщений в диалоге «${dialog.lead.subject}»: ${linkTo(dialog.id)}`,
        });
      } catch (err) {
        this.logger.warn(`notifyMessageNew failed: ${(err as Error).message}`);
      }
    });
  }

  async notifyRatingReceived(rating: { rateeId: string; raterId: string; score: number; dialogId: string }): Promise<void> {
    await this.deliver(rating.rateeId, {
      type: 'tutor_exchange.rating_received',
      title: `Вам поставили ${rating.score} ⭐`,
      message: 'Оценка появилась на вашем публичном профиле репетитора.',
      metadata: { ratingId: rating.dialogId, score: rating.score, raterId: rating.raterId },
    });
  }

  async notifyViolationReported(violation: {
    id: string;
    dialogId: string;
    reporterId: string;
    description: string;
  }): Promise<void> {
    this.logger.log(
      `Violation reported: id=${violation.id} dialog=${violation.dialogId} by=${violation.reporterId}`,
    );
  }

  private async deliver(
    userId: string,
    payload: {
      type: any;
      title: string;
      message: string;
      metadata?: Record<string, any>;
      tgText?: string;
    },
  ): Promise<void> {
    try {
      await this.notifications.createNotification({
        userId,
        userType: 'teacher',
        type: payload.type,
        title: payload.title,
        message: payload.message,
        metadata: payload.metadata,
      });
    } catch (err) {
      this.logger.warn(`in-app notification failed: ${(err as Error).message}`);
    }
    if (payload.tgText) {
      try {
        await this.telegram.sendToAppUser(userId, payload.tgText);
      } catch (err) {
        this.logger.warn(`telegram send failed: ${(err as Error).message}`);
      }
    }
  }
}
