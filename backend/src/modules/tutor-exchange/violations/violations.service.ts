import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ViolationStatus } from './dto/update-violation.dto';
import { TutorExchangeNotifier } from '../notifications/tutor-exchange-notifier.service';

const ADMIN_LIST_INCLUDE = {
  dialog: {
    select: {
      id: true,
      status: true,
      lead: {
        select: {
          id: true,
          subject: true,
          creator: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      },
      responder: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  },
  reporter: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} as const;

@Injectable()
export class ViolationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: TutorExchangeNotifier,
  ) {}

  async createViolation(
    userId: string,
    dialogId: string,
    input: { description: string },
  ) {
    const dialog = await (this.prisma as any).leadDialog.findUnique({
      where: { id: dialogId },
      select: {
        id: true,
        responderId: true,
        lead: { select: { creatorId: true } },
      },
    });
    if (!dialog) throw new NotFoundException('Диалог не найден');
    const isParticipant =
      dialog.responderId === userId || dialog.lead.creatorId === userId;
    if (!isParticipant) throw new ForbiddenException('Нет доступа к диалогу');

    const violation = await (this.prisma as any).violationReport.create({
      data: {
        dialogId,
        reporterId: userId,
        description: input.description.trim(),
        status: 'PENDING',
      },
    });
    void this.notifier.notifyViolationReported({
      id: violation.id,
      dialogId,
      reporterId: userId,
      description: violation.description,
    });
    return violation;
  }

  async listViolations(filter: { status?: string } = {}) {
    const where: Record<string, any> = {};
    if (filter.status) where.status = filter.status;
    return (this.prisma as any).violationReport.findMany({
      where,
      include: ADMIN_LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async updateViolation(id: string, status: ViolationStatus) {
    const report = await (this.prisma as any).violationReport.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!report) throw new NotFoundException('Жалоба не найдена');
    return (this.prisma as any).violationReport.update({
      where: { id },
      data: { status },
    });
  }
}
