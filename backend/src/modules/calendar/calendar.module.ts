import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { EmailModule } from '../../common/services/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramModule } from '../telegram/telegram.module';
import { MaxModule } from '../max/max.module';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { CalendarReminderCronService } from './calendar-reminder.cron';
import { DiaryFollowupCronService } from './diary-followup.cron';

@Module({
  imports: [PrismaModule, EmailModule, NotificationsModule, TelegramModule, MaxModule],
  controllers: [CalendarController],
  providers: [CalendarService, CalendarReminderCronService, DiaryFollowupCronService],
  exports: [CalendarService],
})
export class CalendarModule {}
