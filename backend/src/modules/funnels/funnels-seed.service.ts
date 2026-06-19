import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FunnelsService } from './funnels.service';
import { FUNNEL_SEED } from './funnels-seed';

/**
 * Сидит две дефолтные воронки (Веб и ИИ-бот) при первом старте.
 * Если у юзера уже есть воронки с такими именами — не трогает.
 */
@Injectable()
export class FunnelsSeedService implements OnModuleInit {
  private readonly logger = new Logger(FunnelsSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly funnels: FunnelsService,
  ) {}

  async onModuleInit() {
    try {
      for (const def of FUNNEL_SEED) {
        const exists = await this.prisma.funnel.findFirst({
          where: { name: def.name },
          include: { steps: true },
        });
        if (!exists) {
          await this.funnels.create({
            name: def.name,
            description: def.description,
            steps: def.steps.map(s => ({ ...s, eventFilters: (s as any).eventFilters ?? null })),
          });
          this.logger.log(`Funnel seeded: ${def.name}`);
          continue;
        }
        // Синхронизируем шаги существующей воронки: обновляем только eventFilters по order
        for (const seedStep of def.steps) {
          const dbStep = exists.steps.find(s => s.order === seedStep.order);
          if (!dbStep) continue;
          const seedFilters = (seedStep as any).eventFilters ?? null;
          const dbFilters = dbStep.eventFilters as any;
          const same = JSON.stringify(seedFilters) === JSON.stringify(dbFilters);
          if (!same) {
            await this.prisma.funnelStep.update({
              where: { id: dbStep.id },
              data: { eventFilters: seedFilters },
            });
            this.logger.log(`Funnel step synced: ${def.name} / order=${seedStep.order}`);
          }
        }
      }
    } catch (e: any) {
      this.logger.warn(`Funnel seed skipped: ${e?.message}`);
    }
  }
}
