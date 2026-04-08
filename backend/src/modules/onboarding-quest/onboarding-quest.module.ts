import { Module } from '@nestjs/common';
import { OnboardingQuestController } from './onboarding-quest.controller';
import { OnboardingQuestService } from './onboarding-quest.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OnboardingQuestController],
  providers: [OnboardingQuestService],
  exports: [OnboardingQuestService],
})
export class OnboardingQuestModule {}
