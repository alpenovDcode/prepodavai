import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { SystemModule } from '../system/system.module';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ExchangeEnabledGuard } from './guards/exchange-enabled.guard';
import { LeadsController } from './leads/leads.controller';
import { LeadsService } from './leads/leads.service';
import { DialogsController } from './dialogs/dialogs.controller';
import { DialogsService } from './dialogs/dialogs.service';
import { DialogActionsService } from './dialogs/dialog-actions.service';
import { MessagesController } from './messages/messages.controller';
import { MessagesService } from './messages/messages.service';
import { ModerationService } from './messages/moderation.service';
import { ViolationsController } from './violations/violations.controller';
import { AdminViolationsController } from './violations/admin-violations.controller';
import { ViolationsService } from './violations/violations.service';
import { PaymentOverdueJob } from './cron/payment-overdue.job';
import { TutorExchangeNotifier } from './notifications/tutor-exchange-notifier.service';
import { RatingsController } from './ratings/ratings.controller';
import { RatingsService } from './ratings/ratings.service';
import { TutorsController } from './tutors/tutors.controller';
import { TutorsService } from './tutors/tutors.service';
import { TutorMarketAccessService } from './tutors/tutor-market-access.service';

/**
 * Биржа лидов между репетиторами. Этап 4 добавил state-machine
 * (DialogActionsService), жалобы (ViolationsService) и cron-задачу
 * учёта просроченных оплат. Все клиентские эндпоинты — под
 * ExchangeEnabledGuard, админские — под AdminGuard.
 */
@Module({
  imports: [
    PrismaModule,
    SystemModule,
    AuthModule,
    AdminModule,
    NotificationsModule,
    TelegramModule,
  ],
  controllers: [
    LeadsController,
    DialogsController,
    MessagesController,
    ViolationsController,
    AdminViolationsController,
    RatingsController,
    TutorsController,
  ],
  providers: [
    ExchangeEnabledGuard,
    LeadsService,
    DialogsService,
    DialogActionsService,
    MessagesService,
    ModerationService,
    ViolationsService,
    PaymentOverdueJob,
    TutorExchangeNotifier,
    RatingsService,
    TutorsService,
    TutorMarketAccessService,
  ],
  exports: [ExchangeEnabledGuard],
})
export class TutorExchangeModule {}
