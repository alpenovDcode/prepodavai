import { Module, forwardRef } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { GigachatModule } from '../gigachat/gigachat.module';
import { HtmlExportService } from '../../common/services/html-export.service';

@Module({
  imports: [ConfigModule, PrismaModule, forwardRef(() => GigachatModule)],
  providers: [TelegramService, HtmlExportService],
  exports: [TelegramService],
})
export class TelegramModule {}
