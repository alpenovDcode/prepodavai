import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TutorExchangeNotifier } from '../notifications/tutor-exchange-notifier.service';

@Injectable()
export class RatingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: TutorExchangeNotifier,
  ) {}

  async createRating(
    actorId: string,
    dialogId: string,
    input: { score: number; comment?: string },
  ) {
    if (input.score < 1 || input.score > 5) {
      throw new BadRequestException('Оценка от 1 до 5');
    }

    const dialog = await (this.prisma as any).leadDialog.findUnique({
      where: { id: dialogId },
      select: {
        id: true,
        status: true,
        responderId: true,
        lead: { select: { creatorId: true } },
      },
    });
    if (!dialog) throw new NotFoundException('Диалог не найден');
    if (dialog.status !== 'CONFIRMED') {
      throw new BadRequestException('Оценить можно только успешно завершённую сделку');
    }
    const isCreator = dialog.lead.creatorId === actorId;
    const isResponder = dialog.responderId === actorId;
    if (!isCreator && !isResponder) {
      throw new ForbiddenException('Нет доступа к диалогу');
    }
    const rateeId = isCreator ? dialog.responderId : dialog.lead.creatorId;

    const existing = await (this.prisma as any).tutorRating.findFirst({
      where: { dialogId, raterId: actorId },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Вы уже оценили этот диалог');

    const [rating] = await this.prisma.$transaction([
      (this.prisma as any).tutorRating.create({
        data: {
          dialogId,
          raterId: actorId,
          rateeId,
          score: input.score,
          comment: input.comment?.trim() || null,
        },
      }),
    ]);

    await this.recalcAggregate(rateeId);

    await this.notifier.notifyRatingReceived({
      dialogId,
      raterId: actorId,
      rateeId,
      score: input.score,
    });

    return rating;
  }

  async listMyReceived(userId: string) {
    return (this.prisma as any).tutorRating.findMany({
      where: { rateeId: userId },
      include: {
        rater: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private async recalcAggregate(userId: string): Promise<void> {
    const agg = await (this.prisma as any).tutorRating.aggregate({
      where: { rateeId: userId },
      _avg: { score: true },
      _count: { _all: true },
    });
    const avg = agg._avg.score ?? 0;
    const count = agg._count._all ?? 0;
    await (this.prisma as any).tutorMarketProfile.upsert({
      where: { userId },
      update: { ratingAvg: avg, ratingCount: count },
      create: { userId, ratingAvg: avg, ratingCount: count },
    });
  }
}
