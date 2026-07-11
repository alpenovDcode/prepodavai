import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TutorExchangeNotifier } from '../notifications/tutor-exchange-notifier.service';
import { TutorMarketAccessService } from '../tutors/tutor-market-access.service';

const ACTIVE_DIALOG_STATUSES = ['OPEN', 'TRIAL_PENDING', 'PAYMENT_PENDING'] as const;
const MAX_ACTIVE_DIALOGS = 5;

const COUNTERPART_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
} as const;

const DIALOG_LIST_SELECT = {
  id: true,
  leadId: true,
  responderId: true,
  status: true,
  createdAt: true,
  closedAt: true,
  paymentDeadline: true,
  lead: {
    select: {
      id: true,
      subject: true,
      grade: true,
      creatorId: true,
      status: true,
      creator: { select: COUNTERPART_SELECT },
    },
  },
  responder: { select: COUNTERPART_SELECT },
} as const;

@Injectable()
export class DialogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: TutorExchangeNotifier,
    private readonly access: TutorMarketAccessService,
  ) {}

  async createDialog(userId: string, input: { leadId: string }) {
    await this.access.assertNotFrozen(userId);
    const lead = await (this.prisma as any).lead.findUnique({
      where: { id: input.leadId },
      select: { id: true, status: true, creatorId: true },
    });
    if (!lead) throw new NotFoundException('Заявка не найдена');
    if (lead.creatorId === userId) {
      throw new BadRequestException({ code: 'OwnLead', message: 'Нельзя откликаться на свою заявку' });
    }
    if (lead.status !== 'ACTIVE') {
      throw new BadRequestException({ code: 'LeadNotAvailable', message: 'Заявка уже занята или снята' });
    }

    const activeCount = await (this.prisma as any).leadDialog.count({
      where: { responderId: userId, status: { in: ACTIVE_DIALOG_STATUSES } },
    });
    if (activeCount >= MAX_ACTIVE_DIALOGS) {
      throw new BadRequestException({
        code: 'LimitReached',
        message: 'Не более 5 активных диалогов одновременно. Закройте или отмените один из текущих.',
      });
    }

    const overdue = await (this.prisma as any).leadDialog.findFirst({
      where: {
        responderId: userId,
        status: 'PAYMENT_PENDING',
        paymentDeadline: { lt: new Date() },
      },
      select: { id: true },
    });
    if (overdue) {
      throw new BadRequestException({
        code: 'OverduePayment',
        message: 'Нельзя откликаться: есть просроченная комиссия по другому диалогу.',
      });
    }

    const now = new Date();
    // Атомарный захват заявки: conditional updateMany работает как
    // compare-and-swap по строке lead. Если два репетитора откликаются
    // одновременно, оба проходят предварительную проверку status===ACTIVE
    // выше (TOCTOU), но заблокировать заявку сможет только один —
    // второй увидит count===0 и получит LeadNotAvailable. Без этого
    // на один lead создавалось два диалога.
    const dialog = await this.prisma.$transaction(async (tx) => {
      const locked = await (tx as any).lead.updateMany({
        where: { id: lead.id, status: 'ACTIVE' },
        data: { status: 'LOCKED', lockedById: userId, lockedAt: now },
      });
      if (locked.count !== 1) {
        throw new BadRequestException({
          code: 'LeadNotAvailable',
          message: 'Заявка уже занята или снята',
        });
      }
      return (tx as any).leadDialog.create({
        data: { leadId: lead.id, responderId: userId, status: 'OPEN' },
        select: DIALOG_LIST_SELECT,
      });
    });
    void this.notifier.notifyDialogCreated({
      id: dialog.id,
      responderId: userId,
      lead: { id: lead.id, subject: dialog.lead.subject, creatorId: lead.creatorId },
    });
    return dialog;
  }

  async listMyDialogs(userId: string) {
    return (this.prisma as any).leadDialog.findMany({
      where: {
        OR: [{ responderId: userId }, { lead: { creatorId: userId } }],
      },
      select: DIALOG_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getDialog(userId: string, dialogId: string) {
    const dialog = await (this.prisma as any).leadDialog.findUnique({
      where: { id: dialogId },
      include: {
        lead: {
          select: {
            id: true,
            subject: true,
            grade: true,
            format: true,
            city: true,
            description: true,
            type: true,
            price: true,
            status: true,
            studentContact: true,
            creatorId: true,
            creator: { select: COUNTERPART_SELECT },
          },
        },
        responder: { select: COUNTERPART_SELECT },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!dialog) throw new NotFoundException('Диалог не найден');
    const isParticipant =
      dialog.responderId === userId || dialog.lead.creatorId === userId;
    if (!isParticipant) throw new ForbiddenException('Нет доступа к диалогу');

    // Оценить сделку можно только раз. Отдаём фронту признак «я уже оценил»,
    // чтобы кнопка была неактивна сразу после перезагрузки (иначе повторный
    // клик получал 409). Рейтинг возможен только на CONFIRMED — только там
    // и проверяем, лишний запрос не делаем.
    let hasRated = false;
    if (dialog.status === 'CONFIRMED') {
      const mine = await (this.prisma as any).tutorRating.findFirst({
        where: { dialogId, raterId: userId },
        select: { id: true },
      });
      hasRated = !!mine;
    }

    if (dialog.status !== 'CONFIRMED') {
      const { studentContact: _hidden, ...leadRest } = dialog.lead;
      return { ...dialog, lead: leadRest, hasRated };
    }
    return { ...dialog, hasRated };
  }
}
