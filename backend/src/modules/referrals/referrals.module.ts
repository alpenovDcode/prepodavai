import { Module, forwardRef } from '@nestjs/common';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OnboardingQuestModule } from '../onboarding-quest/onboarding-quest.module';

@Module({
  imports: [PrismaModule, NotificationsModule, forwardRef(() => OnboardingQuestModule)],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
