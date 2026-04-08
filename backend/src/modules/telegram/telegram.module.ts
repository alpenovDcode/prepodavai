import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { HtmlExportService } from '../../common/services/html-export.service';
import { SmscModule } from '../smsc/smsc.module';

@Module({
  imports: [ConfigModule, PrismaModule, SmscModule],
  providers: [TelegramService, HtmlExportService],
  controllers: [TelegramController],
  exports: [TelegramService],
})
export class TelegramModule {}
