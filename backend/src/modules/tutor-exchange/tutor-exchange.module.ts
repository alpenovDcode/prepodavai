import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { SystemModule } from '../system/system.module';
import { AuthModule } from '../auth/auth.module';
import { ExchangeEnabledGuard } from './guards/exchange-enabled.guard';
import { LeadsController } from './leads/leads.controller';
import { LeadsService } from './leads/leads.service';

/**
 * Биржа лидов между репетиторами. С этапа 2 добавлен модуль leads
 * (лента + создание + детали). Следующие этапы подключат dialogs,
 * messages, violations, ratings — все под ExchangeEnabledGuard.
 */
@Module({
  imports: [PrismaModule, SystemModule, AuthModule],
  controllers: [LeadsController],
  providers: [ExchangeEnabledGuard, LeadsService],
  exports: [ExchangeEnabledGuard],
})
export class TutorExchangeModule {}
