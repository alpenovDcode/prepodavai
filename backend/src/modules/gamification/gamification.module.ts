import { Module } from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { GamificationController } from './gamification.controller';
import { AchievementSeedService } from './achievement-seed.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GamificationController],
  providers: [GamificationService, AchievementSeedService],
  exports: [GamificationService],
})
export class GamificationModule {}
