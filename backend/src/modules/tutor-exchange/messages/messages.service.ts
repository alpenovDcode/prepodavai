import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ModerationService } from './moderation.service';
import { TutorExchangeNotifier } from '../notifications/tutor-exchange-notifier.service';

const OPEN_STATUSES = ['OPEN', 'TRIAL_PENDING', 'PAYMENT_PENDING'] as const;

const MESSAGE_SELECT = {
  id: true,
  dialogId: true,
  senderId: true,
  content: true,
  flagged: true,
  isSystem: true,
  createdAt: true,
} as const;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly notifier: TutorExchangeNotifier,
  ) {}

  async sendMessage(userId: string, dialogId: string, input: { content: string }) {
    const dialog = await this.assertParticipant(userId, dialogId);
    if (!OPEN_STATUSES.includes(dialog.status)) {
      throw new BadRequestException('Диалог закрыт — писать нельзя');
    }
    const content = input.content.trim();
    if (!content) throw new BadRequestException('Пустое сообщение');

    const hit = this.moderation.detectContacts(content);
    const recipientId = dialog.responderId === userId ? dialog.lead.creatorId : dialog.responderId;

    let msg: any;
    if (!hit) {
      msg = await (this.prisma as any).leadMessage.create({
        data: {
          dialogId,
          senderId: userId,
          content,
          flagged: false,
          isSystem: false,
        },
        select: MESSAGE_SELECT,
      });
    } else {
      const warning = this.moderation.moderationWarningText(hit);
      const [created] = await this.prisma.$transaction([
        (this.prisma as any).leadMessage.create({
          data: {
            dialogId,
            senderId: userId,
            content,
            flagged: true,
            isSystem: false,
          },
          select: MESSAGE_SELECT,
        }),
        (this.prisma as any).leadMessage.create({
          data: {
            dialogId,
            senderId: null,
            content: warning,
            flagged: false,
            isSystem: true,
          },
        }),
      ]);
      msg = created;
    }

    this.notifier.notifyMessageNew(
      {
        id: dialog.id,
        responderId: dialog.responderId,
        lead: { id: dialog.lead.id, subject: dialog.lead.subject, creatorId: dialog.lead.creatorId },
      },
      userId,
      recipientId,
    );

    return msg;
  }

  async listMessages(userId: string, dialogId: string) {
    await this.assertParticipant(userId, dialogId);
    return (this.prisma as any).leadMessage.findMany({
      where: { dialogId },
      select: MESSAGE_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  private async assertParticipant(userId: string, dialogId: string) {
    const dialog = await (this.prisma as any).leadDialog.findUnique({
      where: { id: dialogId },
      select: {
        id: true,
        status: true,
        responderId: true,
        lead: { select: { id: true, subject: true, creatorId: true } },
      },
    });
    if (!dialog) throw new NotFoundException('Диалог не найден');
    const isParticipant =
      dialog.responderId === userId || dialog.lead.creatorId === userId;
    if (!isParticipant) throw new ForbiddenException('Нет доступа к диалогу');
    return dialog;
  }
}
