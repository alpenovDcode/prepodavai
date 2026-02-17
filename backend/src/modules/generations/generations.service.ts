import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GenerationHelpersService } from './generation-helpers.service';
import { GenerationQueueService } from './generation-queue.service';
import { SubscriptionsService, OperationType } from '../subscriptions/subscriptions.service';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { GigachatService } from '../gigachat/gigachat.service';
import { GammaService } from '../gamma/gamma.service';
import { HtmlPostprocessorService } from '../../common/services/html-postprocessor.service';
import { FilesService } from '../files/files.service';
import {
  LOGO_BASE64,
  SHARED_DESIGN_SYSTEM_PROMPT,
  SHARED_CSS,
  SHARED_MATHJAX_RULES,
  SHARED_MATHJAX_SCRIPT,
  SHARED_CRITICAL_RULES_HTML_OUTPUT,
} from './generation.constants';

export type GenerationType =
  | 'lesson-preparation'
  | 'lessonPreparation'
  | 'worksheet'
  | 'quiz'
  | 'vocabulary'
  | 'lesson-plan'
  | 'content-adaptation'
  | 'message'
  | 'feedback'
  | 'presentation'
  | 'video-analysis'
  | 'transcription'
  | 'gigachat-chat'
  | 'gigachat-image'
  | 'gigachat-embeddings'
  | 'sales-advisor'
  | 'image'
  | 'photosession';

export interface GenerationRequest {
  userId: string;
  generationType: GenerationType;
  inputParams: Record<string, any>;
  model?: string;
}

@Injectable()
export class GenerationsService {
  private readonly logger = new Logger(GenerationsService.name);




  constructor(
    private prisma: PrismaService,
    private generationHelpers: GenerationHelpersService,
    private generationQueue: GenerationQueueService,
    private subscriptionsService: SubscriptionsService,
    private configService: ConfigService,
    @Inject(forwardRef(() => GigachatService))
    private gigachatService: GigachatService,
    private gammaService: GammaService,
    private htmlPostprocessor: HtmlPostprocessorService,
    private filesService: FilesService,
    @InjectQueue('gamma-polling') private gammaPollingQueue: Queue,
    @InjectQueue('replicate-presentation') private readonly replicatePresentationQueue: Queue,
    @InjectQueue('lesson-preparation') private readonly lessonPreparationQueue: Queue,
    @InjectQueue('video-analysis') private readonly videoAnalysisQueue: Queue,
    @InjectQueue('sales-advisor') private readonly salesAdvisorQueue: Queue,
  ) { }

  async createGeneration(request: GenerationRequest) {
    const { userId, generationType, inputParams, model } = request;

    // Проверяем и списываем кредиты
    const creditCheck = await this.subscriptionsService.checkAndDebitCredits(
      userId,
      this.mapGenerationTypeToOperationType(generationType),
    );

    if (!creditCheck.success) {
      throw new BadRequestException(creditCheck.error || 'Недостаточно кредитов');
    }

    // Создаем записи в БД
    const { generationRequest } = await this.generationHelpers.createGeneration({
      userId,
      generationType,
      inputParams,
      model: model || this.getDefaultModel(generationType),
    });

    // Генерации через Replicate (презентации)
    if (generationType === 'presentation') {
      const directResult = await this.handleReplicatePresentationGeneration(
        generationRequest.id,
        inputParams,
      );

      return {
        success: true,
        requestId: generationRequest.id,
        status: 'pending',
      };
    }

    if (generationType === 'video-analysis') {
      const baseUrl = this.configService.get<string>('BASE_URL', 'https://api.prepodavai.ru');
      const videoUrl = inputParams.videoHash
        ? `${baseUrl}/api/files/${inputParams.videoHash}`
        : inputParams.videoUrl;

      await this.videoAnalysisQueue.add('analyze', {
        generationRequestId: generationRequest.id,
        videoUrl: videoUrl,
        analysisType: inputParams.analysisType || 'sales',
      });

      return {
        success: true,
        requestId: generationRequest.id,
        status: 'pending',
      };
    }

    if (generationType === 'sales-advisor') {
      const baseUrl = this.configService.get<string>('BASE_URL', 'https://api.prepodavai.ru');

      // Log incoming params for debugging
      this.logger.log(`Sales Advisor - inputParams: ${JSON.stringify(inputParams)}`);

      // Support both single imageHash and array imageHashes
      const imageHashes = inputParams.imageHashes || (inputParams.imageHash ? [inputParams.imageHash] : []);

      this.logger.log(`Sales Advisor - imageHashes: ${JSON.stringify(imageHashes)}, length: ${imageHashes.length}`);

      if (imageHashes.length === 0) {
        throw new Error('At least one image is required for sales advisor analysis');
      }

      if (imageHashes.length > 6) {
        throw new Error('Maximum 6 images allowed for sales advisor analysis');
      }

      const imageUrls = imageHashes.map(hash => `${baseUrl}/api/files/${hash}`);

      await this.salesAdvisorQueue.add('analyze', {
        generationRequestId: generationRequest.id,
        imageHashes: imageHashes,
        imageUrls: imageUrls,
      });

      return {
        success: true,
        requestId: generationRequest.id,
        status: 'pending',
      };
    }



    // Генерация подготовки к уроку (WOW-урок)
    if (generationType === 'lessonPreparation') {
      const directResult = await this.handleLessonPreparationGeneration(
        generationRequest.id,
        inputParams,
      );

      return {
        success: true,
        requestId: generationRequest.id,
        status: 'pending',
        result: directResult,
      };
    }

    // Прямые генерации через GigaChat (минуя webhooks)
    if (this.shouldUseDirectGigachatGeneration(generationType)) {
      const directResult = await this.handleDirectGigachatGeneration(
        generationType,
        generationRequest.id,
        inputParams,
        model,
        userId,
      );

      return {
        success: true,
        requestId: generationRequest.id,
        status: 'completed',
        result: directResult,
      };
    }

    // GigaChat генерации обрабатываются напрямую, не через webhooks
    const isGigachatGeneration = generationType.startsWith('gigachat-');

    if (!isGigachatGeneration) {
      // Формируем правильную структуру payload для webhook
      const webhookPayload = this.buildWebhookPayload(
        generationType,
        inputParams,
        userId,
        generationRequest.id,
      );

      // Отправляем запрос в webhook (n8n) асинхронно
      await this.sendToWebhook(generationType, webhookPayload);
    }

    return {
      success: true,
      requestId: generationRequest.id,
      status: 'pending',
    };
  }

  /**
   * Проверяем, нужно ли использовать прямую генерацию через GigaChat
   * Временно включаем для отдельных типов
   */
  private shouldUseDirectGigachatGeneration(generationType: GenerationType): boolean {
    return [
      'worksheet',
      'quiz',
      'vocabulary',
      'lesson-plan',
      'content-adaptation',
      'message',
      'feedback',
      'image',
      'photosession',
    ].includes(generationType);
  }

  /**
   * Обработка генерации напрямую через GigaChat
   */
  private async handleDirectGigachatGeneration(
    generationType: GenerationType,
    generationRequestId: string,
    inputParams: Record<string, any>,
    requestedModel?: string,
    userId?: string,
  ) {
    try {
      // Генерация изображений
      if (generationType === 'image' || generationType === 'photosession') {
        return await this.generateImageViaGigachat(
          generationType,
          generationRequestId,
          inputParams,
          requestedModel,
          userId,
        );
      }

      // Текстовые генерации
      if (this.shouldUseDirectGigachatGeneration(generationType)) {
        return await this.generateTextViaGigachat(
          generationType,
          generationRequestId,
          inputParams,
          requestedModel,
        );
      }

      throw new BadRequestException(
        `Direct GigaChat generation is not configured for ${generationType}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Direct GigaChat generation failed for ${generationType}: ${error?.message || error}`,
        error?.stack,
      );
      await this.generationHelpers.failGeneration(
        generationRequestId,
        error?.response?.data?.message || error?.message || 'Ошибка генерации через GigaChat',
      );
      throw error;
    }
  }

  /**
   * Универсальная генерация текста через Replicate (Claude)
   */
  private async generateTextViaGigachat(
    generationType: GenerationType,
    generationRequestId: string,
    inputParams: Record<string, any>,
    requestedModel?: string,
  ) {
    this.logger.log(`[GenerationsService] Starting text generation for ${generationType}`);
    const { systemPrompt, userPrompt } = this.buildGigachatPrompt(generationType, inputParams);
    const model = requestedModel || 'anthropic/claude-3.5-sonnet';

    this.logger.log(
      `[GenerationsService] Using Replicate model: ${model}, prompt length: ${systemPrompt.length + userPrompt.length}`,
    );

    try {
      const replicateToken = this.configService.get<string>('REPLICATE_API_TOKEN');
      if (!replicateToken) {
        throw new BadRequestException('REPLICATE_API_TOKEN not configured');
      }

      const axios = (await import('axios')).default;

      // Создаем prediction через Replicate API
      const response = await axios.post(
        `https://api.replicate.com/v1/models/${model}/predictions`,
        {
          input: {
            prompt: `${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`,
            max_tokens: 8000,
            temperature: 0.7,
            top_p: 0.9,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${replicateToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        },
      );

      const predictionId = response.data.id;
      this.logger.log(`Replicate prediction created: ${predictionId}`);

      // Polling для получения результата
      let attempts = 0;
      const maxAttempts = 60;
      let content: string | null = null;

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const statusResponse = await axios.get(
          `https://api.replicate.com/v1/predictions/${predictionId}`,
          {
            headers: {
              Authorization: `Bearer ${replicateToken}`,
            },
          },
        );

        const status = statusResponse.data.status;
        this.logger.log(`Prediction ${predictionId} status: ${status}`);

        if (status === 'succeeded') {
          content = statusResponse.data.output?.join('') || statusResponse.data.output;
          break;
        } else if (status === 'failed' || status === 'canceled') {
          throw new Error(`Prediction failed with status: ${status}`);
        }

        attempts++;
      }

      if (!content) {
        throw new BadRequestException('Replicate не вернул результат в течение 2 минут');
      }

      this.logger.log(
        `[GenerationsService] Received response from Replicate, content length: ${content.length}`,
      );

      // Postprocess HTML using HtmlPostprocessorService
      console.log(`[GenerationsService] Starting HTML postprocessing for ${generationType}`);
      const processedContent = this.htmlPostprocessor.process(content);
      console.log(
        `[GenerationsService] HTML postprocessing complete, processed length: ${processedContent.length}`,
      );

      const normalizedResult = {
        provider: 'Replicate (Claude)',
        mode: 'chat',
        model,
        content: processedContent,
        prompt: {
          system: systemPrompt,
          user: userPrompt,
        },
        completedAt: new Date().toISOString(),
      };

      console.log(`[GenerationsService] Saving generation result to database for ${generationType}`);
      await this.generationHelpers.completeGeneration(generationRequestId, normalizedResult);
      console.log(`[GenerationsService] Generation ${generationType} completed successfully`);

      return normalizedResult;
    } catch (error: any) {
      this.logger.error(`Replicate text generation error: ${error.message}`);
      await this.generationHelpers.failGeneration(
        generationRequestId,
        error.message || 'Ошибка генерации текста через Replicate',
      );
      throw error;
    }
  }

  /**
   * Генерация изображений через Replicate (nano-banana-pro)
   */
  private async generateImageViaGigachat(
    generationType: GenerationType,
    generationRequestId: string,
    inputParams: Record<string, any>,
    requestedModel?: string,
    _userId?: string,
  ) {
    this.logger.log(`[GenerationsService] Starting image generation for ${generationType}`);
    const { prompt, style, photoUrl, count } = inputParams;

    if (!prompt) {
      throw new BadRequestException('Prompt is required for image generation');
    }

    try {
      // Для всех типов изображений используем Replicate API (nano-banana-pro)
      const isPhotosession = generationType === 'photosession';
      const promptText = prompt;

      // Если это фотосессия, нужен хэш фото
      let imageUrlInput: string | null = null;
      if (isPhotosession) {
        const photoHash = inputParams.photoHash;
        if (!photoHash) {
          throw new BadRequestException('No photo provided for photosession');
        }
        const baseUrl = this.configService.get<string>('BASE_URL', 'https://api.prepodavai.ru');
        imageUrlInput = `${baseUrl}/api/files/${photoHash}`;
      } else if (inputParams.imageUrl) {
        imageUrlInput = inputParams.imageUrl;
      }

      // URL для обратного вызова
      const baseUrl = this.configService.get<string>('BASE_URL', 'https://api.prepodavai.ru');
      const callbackUrl = `${baseUrl}/api/webhooks/replicate-callback`;

      // Replicate API token
      const replicateToken = this.configService.get<string>('REPLICATE_API_TOKEN');
      if (!replicateToken) {
        throw new BadRequestException('REPLICATE_API_TOKEN not configured');
      }

      this.logger.log(`Sending image generation request to Replicate API: prompt="${promptText}"`);

      try {
        const axios = (await import('axios')).default;

        const input: any = {
          prompt: promptText,
          output_format: 'png',
          safety_filter_level: 'block_only_high',
        };

        // Если это фотосессия или есть входное изображение
        if (imageUrlInput) {
          input.image_input = [imageUrlInput];
          input.aspect_ratio = '1:1';
          input.resolution = '2K';
        } else {
          // Для обычной генерации
          input.aspect_ratio = '1:1';
        }

        const requestBody = {
          input: input,
          webhook: callbackUrl,
          webhook_events_filter: ['completed'],
        };

        this.logger.log(`Replicate request body: ${JSON.stringify(requestBody, null, 2)}`);

        const response = await axios.post(
          'https://api.replicate.com/v1/models/google/nano-banana-pro/predictions',
          requestBody,
          {
            headers: {
              Authorization: `Bearer ${replicateToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 300000,
          },
        );

        const predictionId = response.data.id;
        this.logger.log(`Replicate prediction created: ${predictionId}`);

        // Сохраняем prediction ID в metadata генерации
        await this.prisma.generationRequest.update({
          where: { id: generationRequestId },
          data: {
            metadata: {
              replicatePredictionId: predictionId,
            },
          },
        });

        // Возвращаем pending статус
        return {
          provider: 'Replicate',
          mode: generationType,
          status: 'pending',
          predictionId: predictionId,
          requestId: generationRequestId,
          completedAt: new Date().toISOString(),
        };
      } catch (error: any) {
        this.logger.error(`Failed to send Replicate request: ${error.message}`);
        if (error.response) {
          this.logger.error(
            `Replicate error response: ${JSON.stringify(error.response.data, null, 2)}`,
          );
        }
        throw new BadRequestException(`Failed to start generation: ${error.message}`);
      }
    } catch (error: any) {
      console.error(`[GenerationsService] Image generation failed:`, error);
      throw error;
    }
  }

  /**
   * Обработка генерации презентаций напрямую через Gamma API
   */
  /**
   * Обработка генерации презентаций через Replicate (Claude + Nano Banana)
   */
  private async handleReplicatePresentationGeneration(
    generationRequestId: string,
    inputParams: Record<string, any>,
  ) {
    try {
      this.logger.log(`Starting Replicate presentation generation for request ${generationRequestId}`);

      const inputText = inputParams.prompt || inputParams.text || inputParams.topic || inputParams.inputText || '';
      const numCards = inputParams.length || 8;

      if (!inputText) {
        throw new BadRequestException('No prompt provided for presentation generation');
      }

      await this.replicatePresentationQueue.add('generate-presentation', {
        generationRequestId,
        inputText,
        numCards,
      });

      this.logger.log(`Enqueued Replicate presentation job for ${generationRequestId}`);

      return {
        provider: 'Replicate',
        mode: 'presentation',
        status: 'pending',
        requestId: generationRequestId,
        createdAd: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(
        `Replicate presentation generation failed for ${generationRequestId}: ${error?.message || error}`,
        error?.stack,
      );
      await this.generationHelpers.failGeneration(
        generationRequestId,
        error?.message || 'Ошибка генерации презентации',
      );
      throw error;
    }
  }

  private async handleLessonPreparationGeneration(
    generationRequestId: string,
    inputParams: Record<string, any>,
  ) {
    try {
      this.logger.log(`Starting Lesson Preparation generation for request ${generationRequestId}`);

      const { subject, topic, level, interests, generationTypes, ...otherParams } = inputParams;

      if (!subject || !topic) {
        throw new BadRequestException('Missing required fields for lesson preparation');
      }

      await this.lessonPreparationQueue.add('generate-lesson', {
        generationRequestId,
        subject,
        topic,
        level,
        interests,
        generationTypes: generationTypes || [],
        ...otherParams
      });

      this.logger.log(`Enqueued Lesson Preparation job for ${generationRequestId}`);

      return {
        provider: 'Replicate',
        mode: 'lessonPreparation',
        status: 'pending',
        requestId: generationRequestId,
        createdAd: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(
        `Lesson Preparation generation failed for ${generationRequestId}: ${error?.message || error}`,
        error?.stack,
      );
      await this.generationHelpers.failGeneration(
        generationRequestId,
        error?.message || 'Ошибка генерации урока',
      );
      throw error;
    }
  }

  private buildGigachatPrompt(generationType: GenerationType, inputParams: Record<string, any>) {
    let systemPrompt = '';
    let userPrompt = '';

    switch (generationType) {
      case 'worksheet':
        return this.buildWorksheetPrompt(inputParams);

      case 'quiz': {
        const { subject, topic, level, questionsCount, answersCount, customPrompt } = inputParams;
        systemPrompt = `Ты — Методист мирового уровня с 20-летним стажем и Senior Frontend разработчик. Твоя задача: спроектировать идеальный методический материал, а затем сверстать его в безупречный HTML-код.

ЗАДАЧА:
Сгенерировать полноценный HTML-документ с ТЕСТОМ (QUIZ) с встроенным CSS в строгом, профессиональном стиле.

КРИТИЧЕСКИЕ ПРАВИЛА ВЫВОДА (СОБЛЮДАТЬ СТРОГО):
1.  **СТРАТЕГИЯ:** Первым делом проанализируй тему и уровень. Напиши краткий план своей методической стратегии внутри блока \`<!-- STRATEGY: ... -->\` ПЕРЕД тегом \`<!DOCTYPE html>\`. Опиши, как ты будешь проверять знания и какие ловушки (distractors) используешь.
2.  **ТОЛЬКО КОД:** Твой ответ должен начинаться с комментария стратегии, затем идти \`<!DOCTYPE html>\` и заканчиваться символами \`</html>\`.
3.  **НИКАКОГО ТЕКСТА ПОСЛЕ КОДА:** Категорически запрещено писать после закрывающего тега </html>.
${SHARED_CRITICAL_RULES_HTML_OUTPUT}

${SHARED_DESIGN_SYSTEM_PROMPT}

МЕТОДИЧЕСКИЕ ТРЕБОВАНИЯ:
1.  **Вариативность:** Располагай правильный ответ случайным образом (A, B, C или D).
2.  **Качество вопросов:** Вопросы должны проверять понимание.

${SHARED_MATHJAX_RULES}

SVG ИЛЛЮСТРАЦИЯМ (ДЛЯ ВИЗУАЛЬНЫХ ЗАДАЧ):
1.  Если вопрос требует графика, геометрии или схемы — ВСТАВЛЯЙ SVG (inline).
2.  Стиль SVG: черно-белый, минималистичный, stroke="#222".

CSS ШАБЛОН:
${SHARED_CSS}
${SHARED_MATHJAX_SCRIPT}
`;

        userPrompt = `Сгенерируй HTML-код теста.
Вводные данные:
Предмет: ${subject || 'Общие знания'}
Тема: ${topic || 'Случайная тема'}
Класс/Уровень: ${level || 'Средний'}
Количество вопросов: ${questionsCount || 10}
Вариантов ответа: ${answersCount || 4}
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}

СТРУКТУРА:
1. Шапка (Flexbox): <div class="header"><img src="LOGO_PLACEHOLDER" class="header-logo"><h1>Заголовок теста</h1></div>. Логотип слева, заголовок справа. Логотип НЕ должен перекрывать текст.
2. Список вопросов с вариантами ответов. (Для задач по геометрии или физике обязательно генерируй SVG иллюстрации).
3. Блок "КЛЮЧИ С ОТВЕТАМИ" (в самом конце, желательно с кратким пояснением).
4. Логотип внизу: Вставь <div class="footer-logo"><img src="LOGO_PLACEHOLDER" style="width: 120px; opacity: 0.5;"></div> СТРОГО В САМОМ КОНЦЕ ДОКУМЕНТА (на последней странице, внутри границ листа).

Начинай вывод сразу с <!DOCTYPE html>. Не пиши никаких вступлений и никаких заключений после тега </html>.`;
        break;
      }

      case 'vocabulary': {
        const { subject, topic, language, wordsCount, level, customPrompt } = inputParams;
        const languageNames: Record<string, string> = {
          en: 'английский',
          de: 'немецкий',
          fr: 'французский',
          es: 'испанский',
          it: 'итальянский',
          ru: 'русский',
        };
        const langName = languageNames[language] || language;

        systemPrompt = `Ты — Методист мирового уровня с 20-летним стажем и Senior Frontend разработчик. Твоя задача: спроектировать идеальный методический материал, а затем сверстать его в безупречный HTML-код.

ЗАДАЧА:
Сгенерировать структурированный HTML-документ в формате СЛОВАРЯ или ГЛОССАРИЯ.

!!! ВАЖНОЕ ПРАВИЛО ПРИОРИТЕТА !!!
В тексте задания (ниже) могут содержаться устаревшие требования вернуть ответ в формате JSON. ТЫ ДОЛЖЕН ПОЛНОСТЬЮ ИГНОРИРОВАТЬ ЛЮБЫЕ ТРЕБОВАНИЯ К ФОРМАТУ JSON В ТЕКСТЕ ЗАДАНИЯ. Твоя задача — взять данные, но оформить их ИСКЛЮЧИТЕЛЬНО как HTML-страницу.

КРИТИЧЕСКИЕ ПРАВИЛА ВЫВОДА (СОБЛЮДАТЬ СТРОГО):
1.  **СТРАТЕГИЯ:** Напиши краткий план внутри блока \`<!-- STRATEGY: ... -->\` ПЕРЕД тегом \`<!DOCTYPE html>\`.
2.  **ТОЛЬКО КОД:** Твой ответ должен начинаться с комментария стратегии, затем \`<!DOCTYPE html>\` и заканчиваться \`</html>\`.
3.  **НИКАКОГО ТЕКСТА ПОСЛЕ КОДА:** Категорически запрещено писать после закрывающего тега </html>.
4.  **БЕЗ MARKDOWN:** Не оборачивай код в тройные кавычки. Верни "сырую" строку HTML.

${SHARED_DESIGN_SYSTEM_PROMPT}

${SHARED_MATHJAX_RULES}

CSS ШАБЛОН:
${SHARED_CSS}
${SHARED_MATHJAX_SCRIPT}
`;

        userPrompt = `Сгенерируй HTML-код словаря.
Вводные данные:
Тема: ${topic}
Предмет: ${subject || ''}
Язык: ${langName}
Уровень: ${level || 'базовый'}
Количество слов: ${wordsCount || 20}
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}

СТРУКТУРА:
   - Логотип: Вставь <div class="header"><img src="LOGO_PLACEHOLDER" class="header-logo"><h1>Словарь</h1></div>. Логотип слева, заголовок справа. Без наложения.
   - Логотип внизу: Вставь <div class="footer-logo"><img src="LOGO_PLACEHOLDER" style="width: 120px; opacity: 0.5;"></div> СТРОГО В САМОМ КОНЦЕ ДОКУМЕНТА (на последней странице).
2. Список терминов (Термин -> Транскрипция/Мета -> Определение -> Пример использования).

Начинай вывод сразу с <!DOCTYPE html>. Не пиши никаких вступлений и никаких заключений после тега </html>.`;
        break;
      }

      case 'lesson-plan': {
        const { subject, topic, level, duration, objectives, customPrompt } = inputParams;
        systemPrompt = `Ты — Методист мирового уровня с 20-летним стажем и Senior Frontend разработчик. Твоя задача: спроектировать идеальный методический материал, а затем сверстать его в безупречный HTML-код.

ЗАДАЧА:
Сгенерировать четкий, структурированный и профессиональный ПЛАН УРОКА в формате HTML.

КРИТИЧЕСКИЕ ПРАВИЛА ВЫВОДА (СОБЛЮДАТЬ СТРОГО):
1.  **СТРАТЕГИЯ:** Первым делом проанализируй тему и уровень. Напиши краткий план своей методической стратегии внутри блока \`<!-- STRATEGY: ... -->\` ПЕРЕД тегом \`<!DOCTYPE html>\`.
2.  **ТОЛЬКО КОД:** Твой ответ должен начинаться с комментария стратегии, затем символами \`<!DOCTYPE html>\`.
3.  **НИКАКОГО ТЕКСТА ПОСЛЕ КОДА:** Категорически запрещено писать после закрывающего тега </html>.
4.  **БЕЗ MARKDOWN:** Не оборачивай код в тройные кавычки. Верни "сырую" строку HTML.

МЕТОДИЧЕСКИЕ ТРЕБОВАНИЯ:
1.  **Тайминг:** Сумма этапов = ${duration} мин.
2.  **Структура:** Введение -> Изучение -> Закрепление -> Рефлексия.

${SHARED_DESIGN_SYSTEM_PROMPT}

${SHARED_MATHJAX_RULES}

CSS ШАБЛОН:
${SHARED_CSS}
${SHARED_MATHJAX_SCRIPT}
`;

        userPrompt = `Сгенерируй HTML - код плана урока.
Вводные данные:
        Предмет: ${subject || 'На усмотрение ИИ'}
        Тема: ${topic || 'На усмотрение ИИ'}
        Класс: ${level || 'Средняя школа'}
        Длительность: ${duration || 45} мин.
          Цели: ${objectives || 'Сформулируй стандартные образовательные цели'}
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}

        СТРУКТУРА:
        1. Шапка(Flexbox): <div class="header" > <img src="LOGO_PLACEHOLDER" class="header-logo" > <h1>Тема урока < /h1></div >.Логотип слева, заголовок справа.
2. Цели и задачи.
3. Оборудование / Материалы.
4. ТАБЛИЦА "Ход урока"(Этап, Время, Деятельность).
5. Домашнее задание.
6. Логотип внизу: Вставь < div class="footer-logo" > <img src="LOGO_PLACEHOLDER" style = "width: 120px; opacity: 0.5;" > </div> СТРОГО В САМОМ КОНЦЕ ДОКУМЕНТА (на последней странице).

Начинай вывод сразу с < !DOCTYPE html >.Не пиши никаких вступлений и никаких заключений после тега </html>.`;
        break;
      }

      case 'content-adaptation': {
        const { text, action, level, customPrompt } = inputParams;
        systemPrompt = `Ты — Методист мирового уровня с 20-летним стажем и Senior Frontend разработчик. Твоя задача: адаптировать учебный материал, сохраняя методическую ценность, и сверстать его в безупречный HTML.

ЗАДАЧА:
Сгенерировать ответ в виде HTML-документа со строгим, минималистичным дизайном (стиль технической спецификации).

4.  **БЕЗ MARKDOWN:** Не оборачивай код в тройные кавычки. Верни "сырую" строку HTML.

${SHARED_DESIGN_SYSTEM_PROMPT}

КРИТИЧЕСКИЕ ПРАВИЛА ВЫВОДА (СОБЛЮДАТЬ СТРОГО):
1.  **СТРАТЕГИЯ:** Напиши краткий план адаптации внутри блока \`<!-- STRATEGY: ... -->\` ПЕРЕД тегом \`<!DOCTYPE html>\`.
2.  **ТОЛЬКО КОД:** Твой ответ должен начинаться с комментария стратегии, затем \`<!DOCTYPE html>\`.
3.  **НИКАКОГО ТЕКСТА ПОСЛЕ КОДА:** Категорически запрещено писать после закрывающего тега </html>.

${SHARED_MATHJAX_RULES}
   - Контейнер max-width: 740px, выравнивание по центру.
   - Шрифт: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif.
   - Основной цвет текста: #1F2937 (глубокий серый), Фон: #FFFFFF.
   - Line-height: 1.6 для основного текста.
2. Декоративные элементы:
   - Полный отказ от теней (box-shadow). Используй только границы (border: 1px solid #E5E7EB).
   - Заголовки: Черные, жирные, отделены от текста отступами.
   - Если есть блоки кода или выделения: использовать фон #F9FAFB (очень светло-серый) и border-radius: 4px.
   - Логотип: Вставь <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 20px;"><img src="LOGO_PLACEHOLDER" style="width: 120px;"><h1>Заголовок</h1></div>. Логотип слева, текст справа. БЕЗ НАЛОЖЕНИЯ.
   - Логотип внизу: Вставь <div style="text-align: right; margin-top: 40px; page-break-inside: avoid;"><img src="LOGO_PLACEHOLDER" style="width: 120px; opacity: 0.5;"></div> СТРОГО В САМОМ КОНЦЕ ДОКУМЕНТА (на последней странице).
3. Списки: Маркеры должны быть внутри контента (list-style-position: inside) или с аккуратным padding-left.

   ❌ НЕПРАВИЛЬНО: "Вычислите $...$" (запрещено)

5. ВСЕ математические выражения ОБЯЗАТЕЛЬНО оборачивай в \\(...\\) или \\[...\\]!
ФОРМАТ ОТВЕТА: Верни ТОЛЬКО валидный HTML-код (начиная с <!DOCTYPE html>). Не используй markdown-блоки кода (т.е. без \`\`\`html), просто чистый текст HTML.`;

        userPrompt = `Адаптируй текст для ${level} класса.
Действие: ${action || 'упростить'}.
Текст:
${text}
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}`;
        break;
      }

      case 'message': {
        const { formData, customPrompt } = inputParams;
        systemPrompt = `Ты — Эксперт по коммуникациям и Senior Frontend разработчик.
ЗАДАЧА:
Сгенерировать ответ в виде HTML-документа с чистым, строгим и профессиональным дизайном.

${SHARED_CRITICAL_RULES_HTML_OUTPUT}

${SHARED_DESIGN_SYSTEM_PROMPT}

${SHARED_MATHJAX_RULES}

        4. ПРИМЕРЫ ПРАВИЛЬНОГО ИСПОЛЬЗОВАНИЯ:
   ✅ ПРАВИЛЬНО: "Вычислите \\(\\frac{2}{3} + \\frac{1}{4}\\)"
   ✅ ПРАВИЛЬНО: "Решите уравнение \\[x^2 + 5x + 6 = 0\\]"
   ❌ НЕПРАВИЛЬНО: "Вычислите $$...$$"(запрещено)
   ❌ НЕПРАВИЛЬНО: "Вычислите $...$"(запрещено)

        5. ВСЕ математические выражения ОБЯЗАТЕЛЬНО оборачивай в \\(...\\) или \\[...\\]!
ФОРМАТ ОТВЕТА: Верни ТОЛЬКО валидный HTML-код (начиная с <!DOCTYPE html>). Не используй markdown-блоки кода (т.е. без \`\`\`html), просто чистый текст HTML.`;

        userPrompt = `Создай сообщение для родителей.
          Данные: ${JSON.stringify(formData || {})}
${customPrompt ? `Дополнительно: ${customPrompt}` : ''} `;
        break;
      }

      case 'feedback': {
        const { studentWork, taskType, criteria, level, customPrompt } = inputParams;
        systemPrompt = `Ты — Методист мирового уровня и Senior Frontend разработчик.
ЗАДАЧА:
Сгенерировать конструктивный и профессиональный ФИДБЕК (АУДИТ РАБОТЫ).

${SHARED_CRITICAL_RULES_HTML_OUTPUT}

${SHARED_DESIGN_SYSTEM_PROMPT}

${SHARED_MATHJAX_RULES}

        4. ПРИМЕРЫ ПРАВИЛЬНОГО ИСПОЛЬЗОВАНИЯ:
   ✅ ПРАВИЛЬНО: "Вычислите \\(\\frac{2}{3} + \\frac{1}{4}\\)"
   ✅ ПРАВИЛЬНО: "Решите уравнение \\[x^2 + 5x + 6 = 0\\]"
   ❌ НЕПРАВИЛЬНО: "Вычислите $$...$$"(запрещено)
   ❌ НЕПРАВИЛЬНО: "Вычислите $...$"(запрещено)

        5. ВСЕ математические выражения ОБЯЗАТЕЛЬНО оборачивай в \\(...\\) или \\[...\\]!
ФОРМАТ ОТВЕТА: Верни ТОЛЬКО валидный HTML-код (начиная с <!DOCTYPE html>). Не используй markdown-блоки кода (т.е. без \`\`\`html), просто чистый текст HTML.`;

        userPrompt = `Дай фидбек по работе ученика.
          Работа:
${studentWork}

        Тип задания: ${taskType || 'общее'}.
        Критерии: ${criteria || 'стандартные'}.
        Уровень: ${level || 'средний'}.
${customPrompt ? `Дополнительно: ${customPrompt}` : ''} `;
        break;
      }

      default:
        throw new BadRequestException(`Prompt builder not implemented for ${generationType}`);
    }

    return { systemPrompt, userPrompt };
  }

  private buildWorksheetPrompt(inputParams: Record<string, any>) {
    const { subject, topic, level, questionsCount, preferences, customPrompt } = inputParams;

    // 1. SYSTEM PROMPT: Жесткие технические ограничения
    const systemPrompt = `Ты — Методист мирового уровня с 20-летним стажем и Senior Frontend разработчик. Твоя задача: спроектировать идеальный методический материал, а затем сверстать его в безупречный HTML-код.

ЗАДАЧА:
Сгенерировать рабочий лист в формате HTML, который визуально идентичен распечатанному документу формата А4.

${SHARED_CRITICAL_RULES_HTML_OUTPUT}

${SHARED_DESIGN_SYSTEM_PROMPT}

МЕТОДИЧЕСКИЕ ТРЕБОВАНИЯ:
1.  **Распечатка:** Создай контент, удобный для печати (ч/б графика, четкие линии).
2.  **Структура:** Шапка с полями для имени, разнообразные задания, место для ответов.

CSS ШАБЛОН:
${SHARED_CSS}
${SHARED_MATHJAX_SCRIPT}
`;

    // 2. СБОР ПАРАМЕТРОВ
    const details: string[] = [];

    if (subject) details.push(`Предмет: ${subject}`);
    if (topic) details.push(`Тема: ${topic} `);
    if (level) details.push(`Класс / уровень: ${level} `);
    if (questionsCount)
      details.push(`Количество заданий: ${questionsCount} (Распредели на несколько страниц)`);
    if (preferences) details.push(`Особые пожелания: ${preferences} `);
    if (customPrompt) details.push(`Дополнительные инструкции: ${customPrompt} `);

    // 3. USER PROMPT: Инструкция с универсальным фоллбэком
    const userPrompt = `Сгенерируй HTML-код рабочего листа.
Вводные данные:
${details.length ? details.join('\n') : 'Предмет не указан. Выбери любую популярную школьную тему (например, математика, история или биология) и создай для неё задания.'}

КРИТИЧЕСКИ ВАЖНО:
        1. Шапка с "prepodavAI".
2. Разнообразные задания (тесты, таблицы, соотнесение).
3. ОБЯЗАТЕЛЬНО сгенерируй ВСЕ ${questionsCount || 10} заданий БЕЗ ИСКЛЮЧЕНИЙ. Не обрезай ответ, не используй многоточия, не пропускай задания.
4. Раздел "ОТВЕТЫ" строго на отдельном листе в конце с ответами к каждому заданию.

Начинай вывод сразу с <!DOCTYPE html>. Не пиши никаких вступлений и никаких заключений после тега </html>.`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Отправка запроса в webhook (n8n)
   */
  private async sendToWebhook(generationType: GenerationType, payload: any) {
    const webhookUrl = this.getWebhookUrl(generationType);
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    const isDevelopment = nodeEnv === 'development';

    if (isDevelopment) {
      console.log(`📤 Sending webhook request to ${webhookUrl} `, {
        generationType,
        requestId: payload.generationRequestId,
        payloadKeys: Object.keys(payload),
      });
    }

    // Отправляем асинхронно, не ждем ответа
    axios
      .post(webhookUrl, payload, {
        timeout: 10000, // Увеличиваем timeout до 10 секунд
        validateStatus: () => true, // Принимаем любой статус
      })
      .then((response) => {
        if (isDevelopment) {
          console.log(`✅ Webhook request sent successfully for ${generationType}`, {
            status: response.status,
            requestId: payload.generationRequestId,
          });
        }
      })
      .catch((error) => {
        // В production логируем только ошибки без деталей
        console.error(`❌ Webhook request failed for ${generationType}`, {
          requestId: payload.generationRequestId,
          ...(isDevelopment ? { message: error.message, code: error.code, url: webhookUrl } : {}),
        });
        // Обновляем статус на failed
        this.generationHelpers.failGeneration(
          payload.generationRequestId,
          `Webhook error: ${error.message} `,
        );
      });
  }

  /**
   * Получить URL webhook для типа генерации
   */
  private getWebhookUrl(generationType: GenerationType): string {
    const baseUrl = this.configService.get<string>(
      'N8N_WEBHOOK_URL',
      'https://prrvauto.ru/webhook',
    );

    const webhookMap: Record<GenerationType, string> = {
      worksheet: `${baseUrl}/chatgpt-hook`,
      quiz: `${baseUrl}/chatgpt-hook`,
      vocabulary: `${baseUrl}/chatgpt-hook`,
      'lesson-plan': `${baseUrl}/chatgpt-hook`,
      'content-adaptation': `${baseUrl}/chatgpt-hook`,
      message: `${baseUrl}/chatgpt-hook`,
      feedback: `${baseUrl}/chatgpt-hook`,
      image: `${baseUrl}/generate-image`,
      photosession: `${baseUrl}/generate-image`,
      presentation: `${baseUrl}/generate-presentation`,
      transcription: `${baseUrl}/transcribe-video`,
      // GigaChat генерации не используют webhooks (обрабатываются напрямую)
      'gigachat-chat': '',
      'gigachat-image': '',
      'gigachat-embeddings': '',
      'lessonPreparation': '',
      'lesson-preparation': '',
      'video-analysis': '',
      'sales-advisor': '',
    };

    return webhookMap[generationType] || `${baseUrl}/chatgpt-hook`;
  }

  /**
   * Получить callback URL для типа генерации
   */
  private getCallbackUrl(generationType: GenerationType): string {
    const apiUrl = this.configService.get<string>('API_URL', 'https://api.prepodavai.ru');
    const callbackMap: Record<GenerationType, string> = {
      worksheet: `${apiUrl}/api/webhooks/worksheet-callback`,
      quiz: `${apiUrl}/api/webhooks/quiz-callback`,
      vocabulary: `${apiUrl}/api/webhooks/vocabulary-callback`,
      'lesson-plan': `${apiUrl}/api/webhooks/lesson-plan-callback`,
      'content-adaptation': `${apiUrl}/api/webhooks/content-callback`,
      message: `${apiUrl}/api/webhooks/message-callback`,
      feedback: `${apiUrl}/api/webhooks/feedback-callback`,
      image: `${apiUrl}/api/webhooks/image-callback`,
      photosession: `${apiUrl}/api/webhooks/photosession-callback`,
      presentation: `${apiUrl}/api/webhooks/presentation-callback`,
      transcription: `${apiUrl}/api/webhooks/transcription-callback`,
      // GigaChat генерации не используют callbacks (обрабатываются напрямую)
      'gigachat-chat': '',
      'gigachat-image': '',
      'gigachat-embeddings': '',
      'lessonPreparation': '',
      'lesson-preparation': '',
      'video-analysis': '',
      'sales-advisor': '',
    };

    return callbackMap[generationType];
  }

  /**
   * Построить правильную структуру payload для webhook
   */
  private buildWebhookPayload(
    generationType: GenerationType,
    inputParams: Record<string, any>,
    userId: string,
    generationRequestId: string,
  ): any {
    const callbackUrl = this.getCallbackUrl(generationType);

    // Для текстовых генераций формируем структуру с prompt и system
    const textGenerationTypes: GenerationType[] = [
      'worksheet',
      'quiz',
      'vocabulary',
      'lesson-plan',
      'content-adaptation',
      'message',
      'feedback',
    ];

    if (textGenerationTypes.includes(generationType)) {
      const prompt = this.generatePrompt(generationType, inputParams);
      const system = this.generateSystemMessage(generationType);

      return {
        prompt,
        system,
        userId,
        generationRequestId,
        callbackUrl,
        type: generationType,
      };
    }

    // Для изображений (image, photosession)
    if (generationType === 'image' || generationType === 'photosession') {
      const payload: any = {
        prompt: inputParams.prompt,
        style: inputParams.style || 'realistic',
        userId,
        generationRequestId,
        callbackUrl,
      };

      // Для photosession добавляем photoUrl и isPhotoSession
      if (generationType === 'photosession') {
        if (inputParams.photoUrl) {
          payload.photoUrl = inputParams.photoUrl;
        }
        if (inputParams.photoHash) {
          payload.photoHash = inputParams.photoHash;
        }
        payload.isPhotoSession = true;
      }

      // Опциональные поля для image
      if (inputParams.size) {
        payload.size = inputParams.size;
      }

      return payload;
    }

    // Для презентаций и транскрипций оставляем исходную структуру
    return {
      ...inputParams,
      userId,
      generationRequestId,
      callbackUrl,
      type: generationType,
    };
  }

  /**
   * Генерация prompt для текстовых генераций
   */
  /**
   * Генерация prompt для текстовых генераций
   */
  private generatePrompt(generationType: GenerationType, inputParams: Record<string, any>): string {
    const commonInstructions = `
${SHARED_CRITICAL_RULES_HTML_OUTPUT}

${SHARED_DESIGN_SYSTEM_PROMPT}

${SHARED_MATHJAX_RULES}

CSS ШАБЛОН:
${SHARED_CSS}
${SHARED_MATHJAX_SCRIPT}
`;

    switch (generationType) {
      case 'worksheet': {
        const { subject, topic, level, questionsCount, preferences, customPrompt } = inputParams;
        const details: string[] = [];

        if (subject) details.push(`Предмет: ${subject}`);
        if (topic) details.push(`Тема: ${topic} `);
        if (level) details.push(`Класс / уровень: ${level} `);
        if (questionsCount)
          details.push(`Количество заданий: ${questionsCount} (Распредели на несколько страниц)`);
        if (preferences) details.push(`Особые пожелания: ${preferences} `);
        if (customPrompt) details.push(`Дополнительные инструкции: ${customPrompt} `);

        return `Ты — Методист мирового уровня. Сгенерируй HTML-код рабочего листа.
${commonInstructions}

ЗАДАЧА:
Вводные данные:
${details.length ? details.join('\n') : 'Предмет не указан. Выбери любую популярную школьную тему и создай для неё задания.'}

СТРУКТУРА КОНТЕНТА:
1. Шапка: Логотип (LOGO_PLACEHOLDER) и заголовок.
2. Разнообразные задания (тесты, таблицы, соотнесение).
3. ОБЯЗАТЕЛЬНО сгенерируй ВСЕ ${questionsCount || 10} заданий.
4. Раздел "ОТВЕТЫ" строго на отдельном листе в конце.
5. Логотип в подвале страницы.

Начинай вывод сразу с <!-- STRATEGY: ... --> затем <!DOCTYPE html>.`;
      }

      case 'quiz': {
        const { subject, topic, level, questionsCount, answersCount, customPrompt } = inputParams;
        return `Ты — Методист мирового уровня. Сгенерируй HTML-код теста.
${commonInstructions}

ЗАДАЧА:
Вводные данные:
Предмет: ${subject || 'Общие знания'}
Тема: ${topic || 'Случайная тема'}
Класс/Уровень: ${level || 'Средний'}
Количество вопросов: ${questionsCount || 10}
Вариантов ответа: ${answersCount || 4}
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}

СТРУКТУРА КОНТЕНТА:
1. Шапка: Логотип (LOGO_PLACEHOLDER) и заголовок теста.
2. Список вопросов с вариантами ответов. (Используй MathJax для формул и SVG для графиков).
3. Блок "КЛЮЧИ С ОТВЕТАМИ" (в конце).
4. Логотип в подвале.

Начинай вывод сразу с <!-- STRATEGY: ... --> затем <!DOCTYPE html>.`;
      }

      case 'vocabulary': {
        const { subject, topic, language, wordsCount, level, customPrompt } = inputParams;
        const languageNames: Record<string, string> = {
          en: 'английский',
          de: 'немецкий',
          fr: 'французский',
          es: 'испанский',
          it: 'итальянский',
          ru: 'русский',
        };
        const langName = languageNames[language] || language;

        return `Ты — Методист мирового уровня. Сгенерируй HTML-код словаря.
${commonInstructions}

ЗАДАЧА:
Вводные данные:
Тема: ${topic}
Предмет: ${subject || ''}
Язык: ${langName}
Уровень: ${level || 'базовый'}
Количество слов: ${wordsCount || 20}
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}

СТРУКТУРА КОНТЕНТА:
1. Шапка: Логотип (LOGO_PLACEHOLDER) и заголовок.
2. Список терминов (Термин -> Транскрипция/Мета -> Определение -> Пример).
3. Логотип в подвале.

Начинай вывод сразу с <!-- STRATEGY: ... --> затем <!DOCTYPE html>.`;
      }

      case 'lesson-plan': {
        const { subject, topic, level, duration, objectives, customPrompt } = inputParams;
        return `Ты — Методист мирового уровня. Сгенерируй HTML-код плана урока.
${commonInstructions}

ЗАДАЧА:
Вводные данные:
Предмет: ${subject || 'На усмотрение ИИ'}
Тема: ${topic || 'На усмотрение ИИ'}
Класс: ${level || 'Средняя школа'}
Длительность: ${duration || 45} мин.
Цели: ${objectives || 'Сформулируй стандартные образовательные цели'}
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}

СТРУКТУРА КОНТЕНТА:
1. Шапка: Логотип (LOGO_PLACEHOLDER) и тема урока.
2. Цели и задачи.
3. Оборудование / Материалы.
4. ТАБЛИЦА "Ход урока" (Этап, Время, Деятельность).
5. Домашнее задание.
6. Логотип в подвале.

Начинай вывод сразу с <!-- STRATEGY: ... --> затем <!DOCTYPE html>.`;
      }

      case 'content-adaptation': {
        const { text, action, level, customPrompt } = inputParams;
        return `Ты — Методист мирового уровня. Адаптируй текст и сверстай в HTML.
${commonInstructions}

ЗАДАЧА:
Адаптируй текст для ${level} класса.
Действие: ${action || 'упростить'}.
Текст:
${text}
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}

Начинай вывод сразу с <!-- STRATEGY: ... --> затем <!DOCTYPE html>.`;
      }

      case 'message': {
        const { formData, customPrompt } = inputParams;
        return `Ты — Профессиональный коммуникатор. Создай сообщение для родителей в HTML.
${commonInstructions}

ЗАДАЧА:
Данные: ${JSON.stringify(formData || {})}
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}

Начинай вывод сразу с <!-- STRATEGY: ... --> затем <!DOCTYPE html>.`;
      }

      case 'feedback': {
        const { studentWork, taskType, criteria, level, customPrompt } = inputParams;
        return `Ты — Педагог-эксперт. Дай фидбек по работе ученика в HTML.
${commonInstructions}

ЗАДАЧА:
Работа:
${studentWork}

Тип задания: ${taskType || 'общее'}.
Критерии: ${criteria || 'стандартные'}.
Уровень: ${level || 'средний'}.
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}

Начинай вывод сразу с <!-- STRATEGY: ... --> затем <!DOCTYPE html>.`;
      }

      default:
        return JSON.stringify(inputParams);
    }
  }

  /**
   * Генерация system message для текстовых генераций
   * Соответствует оригинальному проекту ChatiumPREPODAVAI
   */
  private generateSystemMessage(generationType: GenerationType): string {
    const commonSystemPrompt = `Ты — Методист мирового уровня с 20-летним стажем и Senior Frontend разработчик. Твоя задача: спроектировать идеальный методический материал, а затем сверстать его в безупречный HTML-код.

ЗАДАЧА:
Сгенерировать ответ в виде HTML-документа со строгим, профессиональным дизайном.

${SHARED_CRITICAL_RULES_HTML_OUTPUT}

${SHARED_DESIGN_SYSTEM_PROMPT}

${SHARED_MATHJAX_RULES}

CSS ШАБЛОН:
${SHARED_CSS}
${SHARED_MATHJAX_SCRIPT}

        4. ПРИМЕРЫ ПРАВИЛЬНОГО ИСПОЛЬЗОВАНИЯ:
   ✅ ПРАВИЛЬНО: "Вычислите \\(\\frac{2}{3} + \\frac{1}{4}\\)"
   ✅ ПРАВИЛЬНО: "Решите уравнение \\[x^2 + 5x + 6 = 0\\]"
   ❌ НЕПРАВИЛЬНО: "Вычислите $$...$$"(запрещено)
   ❌ НЕПРАВИЛЬНО: "Вычислите $...$"(запрещено)

        5. ВСЕ математические выражения ОБЯЗАТЕЛЬНО оборачивай в \\(...\\) или \\[...\\]!`;

    return commonSystemPrompt;
  }

  /**
   * Маппинг типа генерации в тип операции для кредитов
   */
  private mapGenerationTypeToOperationType(generationType: GenerationType): OperationType {
    const map: Record<GenerationType, OperationType> = {
      worksheet: 'worksheet',
      quiz: 'quiz',
      vocabulary: 'vocabulary',
      'lesson-plan': 'lesson_plan',
      'content-adaptation': 'content_adaptation',
      message: 'message',
      feedback: 'feedback',
      image: 'image_generation',
      photosession: 'photosession',
      presentation: 'presentation',
      transcription: 'transcription',
      'gigachat-chat': 'gigachat_text',
      'gigachat-image': 'gigachat_image',
      'gigachat-embeddings': 'gigachat_embeddings',
      'lessonPreparation': 'lesson_preparation',
      'lesson-preparation': 'lesson_preparation',
      'video-analysis': 'video_analysis',
      'sales-advisor': 'sales_advisor',
    };

    return map[generationType];
  }

  /**
   * Получить модель по умолчанию для типа генерации
   */
  private getDefaultModel(generationType: GenerationType): string {
    const modelMap: Record<GenerationType, string> = {
      worksheet: 'chatgpt-webhook',
      quiz: 'chatgpt-webhook',
      vocabulary: 'chatgpt-webhook',
      'lesson-plan': 'chatgpt-webhook',
      'content-adaptation': 'chatgpt-webhook',
      message: 'chatgpt-webhook',
      feedback: 'chatgpt-webhook',
      image: 'GigaChat-2-Max',
      photosession: 'GigaChat-2-Max',
      presentation: 'Gamma AI',
      transcription: 'Whisper AI',
      'gigachat-chat': 'GigaChat',
      'gigachat-image': 'GigaChat-2-Max',
      'gigachat-embeddings': 'GigaChat-Embedding',
      'lessonPreparation': 'claude-3.5-sonnet',
      'lesson-preparation': 'claude-3.5-sonnet',
      'video-analysis': 'claude-3.5-sonnet',
      'sales-advisor': 'claude-3.5-sonnet',
    };

    return modelMap[generationType];
  }

  /**
   * Получить статус генерации
   */
  async getGenerationStatus(requestId: string, userId: string) {
    const generation = await this.prisma.generationRequest.findUnique({
      where: { id: requestId },
      include: {
        userGeneration: true,
      },
    });

    if (!generation) {
      throw new NotFoundException('Запрос генерации не найден');
    }

    if (generation.userId !== userId) {
      throw new NotFoundException('Доступ запрещен');
    }

    // Формируем правильный формат ответа для frontend
    const status: 'pending' | 'completed' | 'failed' = generation.status as any;

    return {
      success: true,
      requestId: generation.id,
      status: {
        status,
        result: generation.result,
        error: generation.error,
      },
      result: generation.result, // Для обратной совместимости
      error: generation.error, // Для обратной совместимости
      createdAt: generation.createdAt,
      updatedAt: generation.updatedAt,
    };
  }

  /**
   * Получить историю генераций пользователя
   */
  async getGenerationHistory(userId: string, limit = 50, offset = 0) {
    const generations = await this.prisma.userGeneration.findMany({
      where: { userId },
      include: {
        generationRequest: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await this.prisma.userGeneration.count({
      where: { userId },
    });

    return {
      success: true,
      generations: generations.map((gen) => ({
        id: gen.id,
        userId: gen.userId,
        type: gen.generationType,
        status: gen.status,
        params: gen.inputParams,
        result: gen.outputData || gen.generationRequest?.result,
        error: gen.errorMessage || gen.generationRequest?.error,
        createdAt: gen.createdAt,
        updatedAt: gen.updatedAt,
        model: gen.model,
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * Удалить генерацию
   */
  async deleteGeneration(requestId: string, userId: string) {
    const generation = await this.prisma.generationRequest.findUnique({
      where: { id: requestId },
      include: {
        userGeneration: true,
      },
    });

    if (!generation) {
      throw new NotFoundException('Запрос генерации не найден');
    }

    if (generation.userId !== userId) {
      throw new NotFoundException('Доступ запрещен');
    }

    // Удаляем связанные записи
    if (generation.userGeneration) {
      await this.prisma.userGeneration.delete({
        where: { id: generation.userGeneration.id },
      });
    }

    await this.prisma.generationRequest.delete({
      where: { id: requestId },
    });

    return {
      success: true,
      message: 'Генерация удалена',
    };
  }
}
