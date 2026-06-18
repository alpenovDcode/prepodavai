import { Module } from '@nestjs/common';
import { SmartLinksService } from './smart-links.service';
import {
  SmartLinksAdminController,
  SmartLinksRedirectController,
} from './smart-links.controller';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AdminModule], // нужен AdminGuard
  controllers: [SmartLinksRedirectController, SmartLinksAdminController],
  providers: [SmartLinksService],
  exports: [SmartLinksService],
})
export class SmartLinksModule {}
