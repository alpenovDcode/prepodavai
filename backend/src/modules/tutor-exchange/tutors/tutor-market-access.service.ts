import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Гейт заморозки репетитора на бирже.
 *
 * `TutorMarketProfile.disabledAt` ставит модератор при разрешении спора
 * (DisputeService). Без этой проверки поле было бы декоративным — здесь
 * оно начинает реально запрещать действия: замороженный не может ни
 * откликаться на заявки, ни размещать свои.
 */
@Injectable()
export class TutorMarketAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertNotFrozen(userId: string): Promise<void> {
    const profile = await (this.prisma as any).tutorMarketProfile.findUnique({
      where: { userId },
      select: { disabledAt: true },
    });
    if (profile?.disabledAt) {
      throw new ForbiddenException({
        code: 'AccountFrozen',
        message:
          'Обмен учениками недоступен: ваш аккаунт заморожен модератором. Обратитесь в поддержку.',
      });
    }
  }
}
