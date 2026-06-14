import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ACHIEVEMENT_SEED } from './achievement-seed';

/**
 * При старте приложения upsert-ит каталог ачивок в БД.
 * Чтобы добавить новую ачивку — пропиши её в ACHIEVEMENT_SEED и перезапусти бэк.
 */
@Injectable()
export class AchievementSeedService implements OnModuleInit {
  private readonly logger = new Logger(AchievementSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      let created = 0;
      let updated = 0;
      for (const a of ACHIEVEMENT_SEED) {
        const existing = await this.prisma.achievement.findUnique({ where: { key: a.key } });
        if (!existing) {
          await this.prisma.achievement.create({ data: { ...a, isActive: true } });
          created++;
        } else {
          await this.prisma.achievement.update({
            where: { key: a.key },
            data: { ...a, isActive: true },
          });
          updated++;
        }
      }
      this.logger.log(`Achievements seeded: ${created} created, ${updated} updated, ${ACHIEVEMENT_SEED.length} total`);
    } catch (e: any) {
      // Не валим стартап, если БД ещё не готова или миграция не накатана.
      this.logger.warn(`Achievement seed skipped: ${e?.message}`);
    }
  }
}
