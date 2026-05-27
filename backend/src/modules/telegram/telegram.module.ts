import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { HtmlExportService } from '../../common/services/html-export.service';
import { HtmlPostprocessorService } from '../../common/services/html-postprocessor.service';
import { EmailModule } from '../../common/services/email.module';
@Module({
  imports: [ConfigModule, PrismaModule, EmailModule],
  providers: [TelegramService, HtmlExportService, HtmlPostprocessorService],
  controllers: [TelegramController],
  exports: [TelegramService],
})
export class TelegramModule {}
