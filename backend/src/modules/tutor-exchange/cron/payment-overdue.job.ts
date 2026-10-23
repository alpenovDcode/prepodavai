import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TutorExchangeNotifier } from '../notifications/tutor-exchange-notifier.service';

@Injectable()
export class PaymentOverdueJob {
  private readonly logger = new Logger(PaymentOverdueJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: TutorExchangeNotifier,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron(): Promise<void> {
    const marked = await this.markOverdue();
    if (marked > 0) {
      this.logger.log(`Payment overdue marked: ${marked} dialog(s)`);
    }
  }

  async markOverdue(): Promise<number> {
    const now = new Date();
    const overdue = await (this.prisma as any).leadDialog.findMany({
      where: {
        status: 'PAYMENT_PENDING',
        paymentDeadline: { lt: now },
        paymentOverdueNotifiedAt: null,
      },
      select: {
        id: true,
        responderId: true,
        lead: { select: { id: true, subject: true, creatorId: true } },
      },
    });
    if (overdue.length === 0) return 0;
    await (this.prisma as any).leadDialog.updateMany({
      where: { id: { in: overdue.map((d: any) => d.id) } },
      data: { paymentOverdueNotifiedAt: now },
    });
    for (const d of overdue) {
      void this.notifier.notifyPaymentOverdue({
        id: d.id,
        responderId: d.responderId,
        lead: { id: d.lead.id, subject: d.lead.subject, creatorId: d.lead.creatorId },
      });
    }
    return overdue.length;
  }
}
