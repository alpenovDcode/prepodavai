import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DialogAction } from './dto/action.dto';

const PAYMENT_DEADLINE_DAYS = 3;

interface TransitionPayload {
  trialLessonLink?: string;
}

@Injectable()
export class DialogActionsService {
  constructor(private readonly prisma: PrismaService) {}

  async transition(
    actorId: string,
    dialogId: string,
    action: DialogAction,
    payload: TransitionPayload = {},
  ) {
    const dialog = await (this.prisma as any).leadDialog.findUnique({
      where: { id: dialogId },
      include: { lead: { select: { id: true, creatorId: true, type: true } } },
    });
    if (!dialog) throw new NotFoundException('Диалог не найден');

    const isCreator = dialog.lead.creatorId === actorId;
    const isResponder = dialog.responderId === actorId;
    if (!isCreator && !isResponder) {
      throw new ForbiddenException('Нет доступа к диалогу');
    }

    switch (action) {
      case DialogAction.SCHEDULE_TRIAL:
        return this.scheduleTrial(dialog, { isCreator }, payload);
      case DialogAction.TRIAL_SUCCESS:
        return this.trialSuccess(dialog, { isResponder });
      case DialogAction.TRIAL_FAIL:
        return this.trialFail(dialog, { isResponder });
      case DialogAction.PAYMENT_SENT:
        return this.paymentSent(dialog, { isResponder });
      case DialogAction.CONFIRM_PAYMENT:
        return this.confirmPayment(dialog, { isCreator });
      case DialogAction.DISPUTE:
        return this.dispute(dialog);
      case DialogAction.CANCEL:
        return this.cancel(dialog);
      default:
        throw new BadRequestException('Неизвестное действие');
    }
  }

  private async scheduleTrial(
    dialog: any,
    { isCreator }: { isCreator: boolean },
    payload: TransitionPayload,
  ) {
    if (!isCreator) throw new ForbiddenException('Только создатель заявки назначает пробный');
    if (dialog.status !== 'OPEN') {
      throw new BadRequestException('Пробный можно назначить только в статусе OPEN');
    }
    const updated = await (this.prisma as any).leadDialog.update({
      where: { id: dialog.id },
      data: {
        status: 'TRIAL_PENDING',
        trialLessonLink: payload.trialLessonLink?.trim() || null,
        trialScheduledAt: new Date(),
      },
    });
    return { ok: true as const, dialog: updated };
  }

  private async trialSuccess(dialog: any, { isResponder }: { isResponder: boolean }) {
    if (!isResponder) throw new ForbiddenException('Только откликнувшийся отмечает результат');
    if (dialog.status !== 'TRIAL_PENDING') {
      throw new BadRequestException('Пробный ещё не назначен');
    }
    const now = new Date();
    if (dialog.lead.type === 'FREE') {
      const [updated] = await this.prisma.$transaction([
        (this.prisma as any).leadDialog.update({
          where: { id: dialog.id },
          data: { status: 'CONFIRMED', closedAt: now, trialResultAt: now },
        }),
        (this.prisma as any).lead.update({
          where: { id: dialog.leadId },
          data: { status: 'CLOSED' },
        }),
        ...this.incrementDeals(dialog.lead.creatorId),
        ...this.incrementDeals(dialog.responderId),
      ]);
      return { ok: true as const, dialog: updated };
    }
    const deadline = new Date(now.getTime() + PAYMENT_DEADLINE_DAYS * 24 * 60 * 60 * 1000);
    const updated = await (this.prisma as any).leadDialog.update({
      where: { id: dialog.id },
      data: {
        status: 'PAYMENT_PENDING',
        trialResultAt: now,
        paymentDeadline: deadline,
      },
    });
    return { ok: true as const, dialog: updated };
  }

  private async trialFail(dialog: any, { isResponder }: { isResponder: boolean }) {
    if (!isResponder) throw new ForbiddenException('Только откликнувшийся отмечает результат');
    if (dialog.status !== 'TRIAL_PENDING') {
      throw new BadRequestException('Пробный ещё не назначен');
    }
    const now = new Date();
    const [updated] = await this.prisma.$transaction([
      (this.prisma as any).leadDialog.update({
        where: { id: dialog.id },
        data: { status: 'CANCELLED', closedAt: now, trialResultAt: now },
      }),
      (this.prisma as any).lead.update({
        where: { id: dialog.leadId },
        data: { status: 'ACTIVE', lockedById: null, lockedAt: null },
      }),
    ]);
    return { ok: true as const, dialog: updated };
  }

  private async paymentSent(dialog: any, { isResponder }: { isResponder: boolean }) {
    if (!isResponder) throw new ForbiddenException('Только откликнувшийся отмечает оплату');
    if (dialog.status !== 'PAYMENT_PENDING') {
      throw new BadRequestException('Оплата возможна только в статусе PAYMENT_PENDING');
    }
    const updated = await (this.prisma as any).leadDialog.update({
      where: { id: dialog.id },
      data: { paymentSentAt: new Date() },
    });
    return { ok: true as const, dialog: updated };
  }

  private async confirmPayment(dialog: any, { isCreator }: { isCreator: boolean }) {
    if (!isCreator) throw new ForbiddenException('Только создатель заявки подтверждает оплату');
    if (dialog.status !== 'PAYMENT_PENDING') {
      throw new BadRequestException('Подтверждение возможно только в PAYMENT_PENDING');
    }
    if (!dialog.paymentSentAt) {
      throw new BadRequestException('Откликнувшийся ещё не отметил оплату');
    }
    const now = new Date();
    const [updated] = await this.prisma.$transaction([
      (this.prisma as any).leadDialog.update({
        where: { id: dialog.id },
        data: { status: 'CONFIRMED', closedAt: now },
      }),
      (this.prisma as any).lead.update({
        where: { id: dialog.leadId },
        data: { status: 'CLOSED' },
      }),
      ...this.incrementDeals(dialog.lead.creatorId),
      ...this.incrementDeals(dialog.responderId),
    ]);
    return { ok: true as const, dialog: updated };
  }

  private async dispute(dialog: any) {
    if (!['TRIAL_PENDING', 'PAYMENT_PENDING'].includes(dialog.status)) {
      throw new BadRequestException('Спор можно открыть только на активном этапе');
    }
    const updated = await (this.prisma as any).leadDialog.update({
      where: { id: dialog.id },
      data: { status: 'DISPUTED' },
    });
    return { ok: true as const, dialog: updated };
  }

  private async cancel(dialog: any) {
    if (!['OPEN', 'TRIAL_PENDING'].includes(dialog.status)) {
      throw new BadRequestException('Отменить можно только диалог в OPEN или TRIAL_PENDING');
    }
    const now = new Date();
    const [updated] = await this.prisma.$transaction([
      (this.prisma as any).leadDialog.update({
        where: { id: dialog.id },
        data: { status: 'CANCELLED', closedAt: now },
      }),
      (this.prisma as any).lead.update({
        where: { id: dialog.leadId },
        data: { status: 'ACTIVE', lockedById: null, lockedAt: null },
      }),
    ]);
    return { ok: true as const, dialog: updated };
  }

  private incrementDeals(userId: string) {
    return [
      (this.prisma as any).tutorMarketProfile.upsert({
        where: { userId },
        update: { dealsCompleted: { increment: 1 } },
        create: { userId, dealsCompleted: 1 },
      }),
    ];
  }
}
