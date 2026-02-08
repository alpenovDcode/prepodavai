import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GenerationsController } from './generations.controller';
import { GenerationsService } from './generations.service';
import { GenerationHelpersService } from './generation-helpers.service';
import { GenerationQueueService } from './generation-queue.service';
import { TelegramSenderProcessor } from './processors/telegram-sender.processor';
import { GammaPollingProcessor } from './processors/gamma-polling.processor';
import { ReplicatePresentationProcessor } from './processors/replicate-presentation.processor';
import { LessonPreparationProcessor } from './processors/lesson-preparation.processor';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

import { GigachatModule } from '../gigachat/gigachat.module';
import { GammaModule } from '../gamma/gamma.module';
import { HtmlPostprocessorService } from '../../common/services/html-postprocessor.service';
import { HtmlExportService } from '../../common/services/html-export.service';
import { FilesModule } from '../files/files.module';
import { TelegramModule } from '../telegram/telegram.module';
import { AssemblyAiService } from '../integrations/assemblyai.service';
import { VideoAnalysisProcessor } from './processors/video-analysis.processor';
import { SalesAdvisorProcessor } from './processors/sales-advisor.processor';


@Module({
  imports: [
    // Queue for generations
    BullModule.registerQueue({
      name: 'generation',
    }),
    // Queue for Telegram sending
    BullModule.registerQueue({
      name: 'telegram-send',
    }),
    // Queue for Gamma polling
    BullModule.registerQueue({
      name: 'gamma-polling',
    }),
    BullModule.registerQueue({
      name: 'replicate-presentation',
    }),
    BullModule.registerQueue({
      name: 'lesson-preparation',
    }),
    BullModule.registerQueue({
      name: 'video-analysis',
    }),
    BullModule.registerQueue({
      name: 'sales-advisor',
    }),
    TelegramModule,
    SubscriptionsModule,
    forwardRef(() => GigachatModule),
    GammaModule,
    FilesModule,
  ],
  controllers: [GenerationsController],
  providers: [
    GenerationsService,
    GenerationHelpersService,
    GenerationQueueService,
    TelegramSenderProcessor,
    GammaPollingProcessor,
    ReplicatePresentationProcessor,
    LessonPreparationProcessor,
    VideoAnalysisProcessor,
    SalesAdvisorProcessor,
    AssemblyAiService,
    HtmlPostprocessorService,
    HtmlExportService,
  ],
  exports: [GenerationsService, GenerationQueueService, GenerationHelpersService],
})
export class GenerationsModule { }
