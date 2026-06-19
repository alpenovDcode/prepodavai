import { Module } from '@nestjs/common';
import { SmartLinksService } from './smart-links.service';
import {
  SmartLinksAdminController,
  SmartLinksRedirectController,
} from './smart-links.controller';
import { AdminModule } from '../admin/admin.module';
import { AnalyticsEventsModule } from '../analytics-events/analytics-events.module';

// SmartLinkTokensService — глобальный (SmartLinkTokensModule в AppModule),
// поэтому его не указываем тут как provider.
@Module({
  imports: [AdminModule, AnalyticsEventsModule], // AdminGuard + analytics для funnel events
  controllers: [SmartLinksRedirectController, SmartLinksAdminController],
  providers: [SmartLinksService],
  exports: [SmartLinksService],
})
export class SmartLinksModule {}
