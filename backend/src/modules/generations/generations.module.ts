import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GenerationsController } from './generations.controller';
import { GenerationsService } from './generations.service';
import { GenerationHelpersService } from './generation-helpers.service';
import { GenerationQueueService } from './generation-queue.service';
import { TelegramSenderProcessor } from './processors/telegram-sender.processor';
import { GammaPollingProcessor } from './processors/gamma-polling.processor';
import { ReplicatePresentationProcessor } from './processors/replicate-presentation.processor';
import { PresentationGeneratorService } from './presentation/presentation-generator.service';
import { PresentationRendererService } from './presentation/presentation-renderer.service';
import { PresentationPdfService } from './presentation/presentation-pdf.service';
import { PresentationPptxService } from './presentation/presentation-pptx.service';
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
import { StrategyRegistryService } from './strategies/strategy-registry.service';
import { QuizGenerationStrategy } from './strategies/quiz.strategy';
import { WorksheetGenerationStrategy } from './strategies/worksheet.strategy';
import { ExamVariantStrategy } from './strategies/exam-variant.strategy';
import { VocabularyStrategy } from './strategies/vocabulary.strategy';
import { LessonPlanStrategy } from './strategies/lesson-plan.strategy';
import { ContentAdaptationStrategy } from './strategies/content-adaptation.strategy';
import { UnpackingStrategy } from './strategies/unpacking.strategy';
import { MessageStrategy } from './strategies/message.strategy';
import { AssistantStrategy } from './strategies/assistant.strategy';
import { FeedbackStrategy } from './strategies/feedback.strategy';
import { VideoAnalysisStrategy } from './strategies/video-analysis.strategy';

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
    PresentationGeneratorService,
    PresentationRendererService,
    PresentationPdfService,
    PresentationPptxService,
    LessonPreparationProcessor,
    VideoAnalysisProcessor,
    SalesAdvisorProcessor,
    MaxSenderProcessor,
    AssemblyAiService,
    HtmlPostprocessorService,
    HtmlExportService,
    StrategyRegistryService,
    QuizGenerationStrategy,
    WorksheetGenerationStrategy,
    ExamVariantStrategy,
    VocabularyStrategy,
    LessonPlanStrategy,
    ContentAdaptationStrategy,
    UnpackingStrategy,
    MessageStrategy,
    AssistantStrategy,
    FeedbackStrategy,
    VideoAnalysisStrategy,
  ],
  exports: [GenerationsService, GenerationQueueService, GenerationHelpersService],
})
export class GenerationsModule {}
