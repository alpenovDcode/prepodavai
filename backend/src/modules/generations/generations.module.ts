import { Module } from '@nestjs/common';
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

import { GammaModule } from '../gamma/gamma.module';
import { HtmlPostprocessorService } from '../../common/services/html-postprocessor.service';
import { HtmlExportService } from '../../common/services/html-export.service';
import { FilesModule } from '../files/files.module';
import { ReplicateModule } from '../replicate/replicate.module';
import { LessonsModule } from '../lessons/lessons.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { OnboardingQuestModule } from '../onboarding-quest/onboarding-quest.module';
import { TelegramModule } from '../telegram/telegram.module';
import { AssemblyAiService } from '../integrations/assemblyai.service';
import { VideoAnalysisProcessor } from './processors/video-analysis.processor';
import { SalesAdvisorProcessor } from './processors/sales-advisor.processor';
import { MaxSenderProcessor } from './processors/max-sender.processor';
import { MaxModule } from '../max/max.module';
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
    BullModule.registerQueue({
      name: 'max-send',
    }),
    TelegramModule,
    MaxModule,
    SubscriptionsModule,
    ReferralsModule,
    OnboardingQuestModule,
    GammaModule,
    FilesModule,
    ReplicateModule,
    LessonsModule,
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
    MaxSenderProcessor,
    AssemblyAiService,
    HtmlPostprocessorService,
    HtmlExportService,
  ],
  exports: [GenerationsService, GenerationQueueService, GenerationHelpersService],
})
export class GenerationsModule {}
