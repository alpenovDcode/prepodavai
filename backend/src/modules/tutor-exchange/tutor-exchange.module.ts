import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { SystemModule } from '../system/system.module';
import { ExchangeEnabledGuard } from './guards/exchange-enabled.guard';

/**
 * Биржа лидов между репетиторами. Пока модуль-контейнер: контроллеры
 * этапов 2–6 (leads, dialogs, messages, violations, ratings) регистрируются
 * ниже, все они автоматически попадают под ExchangeEnabledGuard.
 */
@Module({
  imports: [PrismaModule, SystemModule],
  providers: [ExchangeEnabledGuard],
  exports: [ExchangeEnabledGuard],
})
export class TutorExchangeModule {}
