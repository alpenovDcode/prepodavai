import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MaxService } from './max.service';
import { MaxController } from './max.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { HtmlExportService } from '../../common/services/html-export.service';
import { HtmlPostprocessorService } from '../../common/services/html-postprocessor.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [MaxService, HtmlExportService, HtmlPostprocessorService],
  controllers: [MaxController],
  exports: [MaxService],
})
export class MaxModule {}
