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
        const exists = await this.prisma.funnel.findFirst({ where: { name: def.name } });
        if (exists) continue;
        await this.funnels.create({
          name: def.name,
          description: def.description,
          steps: def.steps.map(s => ({ ...s, eventFilters: (s as any).eventFilters ?? null })),
        });
        this.logger.log(`Funnel seeded: ${def.name}`);
      }
    } catch (e: any) {
      this.logger.warn(`Funnel seed skipped: ${e?.message}`);
    }
  }
}
