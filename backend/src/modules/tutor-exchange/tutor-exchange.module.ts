import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { SystemModule } from '../system/system.module';
import { AuthModule } from '../auth/auth.module';
import { ExchangeEnabledGuard } from './guards/exchange-enabled.guard';
import { LeadsController } from './leads/leads.controller';
import { LeadsService } from './leads/leads.service';
import { DialogsController } from './dialogs/dialogs.controller';
import { DialogsService } from './dialogs/dialogs.service';
import { MessagesController } from './messages/messages.controller';
import { MessagesService } from './messages/messages.service';
import { ModerationService } from './messages/moderation.service';

/**
 * Биржа лидов между репетиторами. Этап 3 добавил dialogs + messages
 * + moderation. Следующие этапы подключат violations, ratings —
 * все под ExchangeEnabledGuard.
 */
@Module({
  imports: [PrismaModule, SystemModule, AuthModule],
  controllers: [LeadsController, DialogsController, MessagesController],
  providers: [
    ExchangeEnabledGuard,
    LeadsService,
    DialogsService,
    MessagesService,
    ModerationService,
  ],
  exports: [ExchangeEnabledGuard],
})
export class TutorExchangeModule {}
