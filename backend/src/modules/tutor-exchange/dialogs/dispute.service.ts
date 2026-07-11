import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TutorExchangeNotifier } from '../notifications/tutor-exchange-notifier.service';

export type DisputeResolution =
  | 'DEAL_CONFIRMED'
  | 'RETURNED_TO_FEED'
  | 'CANCELLED';

interface ResolvePayload {
  resolution: DisputeResolution;
  note: string;
  freezeResponder?: boolean;
}

/**
 * Разрешение спора над диалогом биржи — АДМИНСКОЕ действие.
 *
 * Держим отдельно от DialogActionsService: там переходы делают участники
 * диалога (actor — создатель/откликнувшийся), здесь — модератор. Разные
 * права, разная точка входа (AdminGuard), раздельная тестируемость.
 *
 * Пока диалог в DISPUTED, заявка остаётся LOCKED и не двигается — этот
 * сервис единственный способ её разблокировать/закрыть.
 */
@Injectable()
export class DisputeService {
  private readonly logger = new Logger(DisputeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: TutorExchangeNotifier,
  ) {}

  async resolveDispute(
    adminId: string,
    dialogId: string,
    payload: ResolvePayload,
  ) {
    const dialog = await (this.prisma as any).leadDialog.findUnique({
      where: { id: dialogId },
      include: {
        lead: { select: { id: true, subject: true, creatorId: true } },
      },
    });
    if (!dialog) throw new NotFoundException('Диалог не найден');
    if (dialog.status !== 'DISPUTED') {
      throw new BadRequestException(
        'Разрешить можно только диалог в статусе спора',
      );
    }

    const now = new Date();
    const audit = {
      disputeResolution: payload.resolution,
      resolvedByAdminId: adminId,
      resolvedAt: now,
      resolutionNote: payload.note.trim(),
    };

    const updated = await this.prisma.$transaction(async (tx: any) => {
      const ops: Promise<any>[] = [];

      // Все ожидающие жалобы по этому диалогу — считаем обработанными.
      ops.push(
        tx.violationReport.updateMany({
          where: { dialogId, status: 'PENDING' },
          data: { status: 'RESOLVED' },
        }),
      );

      let dialogResult: any;
      if (payload.resolution === 'DEAL_CONFIRMED') {
        dialogResult = await tx.leadDialog.update({
          where: { id: dialogId },
          data: { ...audit, status: 'CONFIRMED', closedAt: now },
        });
        ops.push(
          tx.lead.update({
            where: { id: dialog.leadId },
            data: { status: 'CLOSED' },
          }),
        );
        ops.push(this.incrementDeals(tx, dialog.lead.creatorId));
        ops.push(this.incrementDeals(tx, dialog.responderId));
      } else if (payload.resolution === 'RETURNED_TO_FEED') {
        dialogResult = await tx.leadDialog.update({
          where: { id: dialogId },
          data: { ...audit, status: 'CANCELLED', closedAt: now },
        });
        ops.push(
          tx.lead.update({
            where: { id: dialog.leadId },
            data: { status: 'ACTIVE', lockedById: null, lockedAt: null },
          }),
        );
      } else {
        dialogResult = await tx.leadDialog.update({
          where: { id: dialogId },
          data: { ...audit, status: 'CANCELLED', closedAt: now },
        });
        ops.push(
          tx.lead.update({
            where: { id: dialog.leadId },
            data: { status: 'CANCELLED' },
          }),
        );
      }

      if (payload.freezeResponder) {
        ops.push(
          tx.tutorMarketProfile.upsert({
            where: { userId: dialog.responderId },
            update: {
              disabledAt: now,
              disabledReason: payload.note.trim(),
              disabledByAdminId: adminId,
            },
            create: {
              userId: dialog.responderId,
              disabledAt: now,
              disabledReason: payload.note.trim(),
              disabledByAdminId: adminId,
            },
          }),
        );
      }

      await Promise.all(ops);
      return dialogResult;
    });

    this.logger.log(
      `dispute resolved dialog=${dialogId} by=${adminId} resolution=${payload.resolution} freeze=${!!payload.freezeResponder}`,
    );

    void this.notifier.notifyDisputeResolved(
      {
        id: dialog.id,
        responderId: dialog.responderId,
        lead: {
          id: dialog.lead.id,
          subject: dialog.lead.subject,
          creatorId: dialog.lead.creatorId,
        },
      },
      payload.resolution,
    );

    return { ok: true as const, dialog: updated };
  }

  async unfreezeTutor(userId: string) {
    await (this.prisma as any).tutorMarketProfile.update({
      where: { userId },
      data: { disabledAt: null, disabledReason: null, disabledByAdminId: null },
    });
    return { ok: true as const };
  }

  private incrementDeals(tx: any, userId: string) {
    return tx.tutorMarketProfile.upsert({
      where: { userId },
      update: { dealsCompleted: { increment: 1 } },
      create: { userId, dealsCompleted: 1 },
    });
  }
}
