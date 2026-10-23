import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class TutorsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicProfile(userId: string) {
    const user = await (this.prisma as any).appUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatar: true,
        subject: true,
        marketProfile: {
          select: {
            avgPrice: true,
            experience: true,
            ratingAvg: true,
            ratingCount: true,
            dealsCompleted: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');

    const recentRatings = await (this.prisma as any).tutorRating.findMany({
      where: { rateeId: userId },
      select: {
        id: true,
        score: true,
        comment: true,
        createdAt: true,
        rater: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      user,
      marketProfile: user.marketProfile,
      recentRatings,
    };
  }
}
