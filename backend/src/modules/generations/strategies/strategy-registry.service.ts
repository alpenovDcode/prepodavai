import { Injectable, Logger } from '@nestjs/common';
import { GenerationStrategy } from '../interfaces/generation-strategy.interface';
import { GenerationType } from '../generations.service';

import { WorksheetGenerationStrategy } from './worksheet.strategy';
import { QuizGenerationStrategy } from './quiz.strategy';
import { ExamVariantStrategy } from './exam-variant.strategy';
import { VocabularyStrategy } from './vocabulary.strategy';
import { LessonPlanStrategy } from './lesson-plan.strategy';
import { ContentAdaptationStrategy } from './content-adaptation.strategy';
import { UnpackingStrategy } from './unpacking.strategy';
import { MessageStrategy } from './message.strategy';
import { AssistantStrategy } from './assistant.strategy';
import { FeedbackStrategy } from './feedback.strategy';
import { VideoAnalysisStrategy } from './video-analysis.strategy';

@Injectable()
export class StrategyRegistryService {
  private readonly logger = new Logger(StrategyRegistryService.name);
  private strategies: GenerationStrategy[] = [];

  constructor(
    private readonly quiz: QuizGenerationStrategy,
    private readonly worksheet: WorksheetGenerationStrategy,
    private readonly examVariant: ExamVariantStrategy,
    private readonly vocabulary: VocabularyStrategy,
    private readonly lessonPlan: LessonPlanStrategy,
    private readonly contentAdaptation: ContentAdaptationStrategy,
    private readonly unpacking: UnpackingStrategy,
    private readonly message: MessageStrategy,
    private readonly assistant: AssistantStrategy,
    private readonly feedback: FeedbackStrategy,
    private readonly videoAnalysis: VideoAnalysisStrategy,
  ) {
    this.registerStrategy(quiz);
    this.registerStrategy(worksheet);
    this.registerStrategy(examVariant);
    this.registerStrategy(vocabulary);
    this.registerStrategy(lessonPlan);
    this.registerStrategy(contentAdaptation);
    this.registerStrategy(unpacking);
    this.registerStrategy(message);
    this.registerStrategy(assistant);
    this.registerStrategy(feedback);
    this.registerStrategy(videoAnalysis);
  }

  /**
   * Регистрирует новую стратегию
   */
  registerStrategy(strategy: GenerationStrategy) {
    this.strategies.push(strategy);
    this.logger.log(`Registered Generation Strategy: ${strategy.constructor.name}`);
  }

  /**
   * Находит подходящую стратегию для типа генерации
   */
  getStrategy(type: GenerationType): GenerationStrategy | undefined {
    return this.strategies.find((strategy) => strategy.supports(type));
  }
}
