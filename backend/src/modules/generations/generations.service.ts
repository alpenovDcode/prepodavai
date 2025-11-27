import { Injectable, BadRequestException, NotFoundException, Logger, Inject, forwardRef } from '@nestjs/common';
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

const LOGO_BASE64 = 'data:image/png;base64,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l3s1jvWbwQLuVoG2uuUpJs5uv9sIEPE3yvASXuDEvz7Dl9+KsPOGKicp7zyB7j/31/qYXwhwdVEU5d/DsLyQXaj1deRw0fqt3XXVyrLgbQPp6meffx4XF9/Q0KDUVCo7e4r8liTJmppakjat4uE0kGVr6+tJinbBhGt9DxwBtsu2Ni+cTgXtIFMuQusJpbPf/zEjqFrZ+kXXrl0BALdKS60JdtKyElORIIjDh4cAAObMjZGhRwht+X4rAOCDJfirso5urXktwI1lyEvwh3NzT586XVZW/uP27flHjnLSxkhTU1PmwYMlJSXXr18/frxAhunkyZPbtm07e/asvFhWU3N73/59N2/dLDp/fvv27deuXVWQoigyNy/3hx9+VCrjxQlBKCgs3LFjx40bN3r37t26devyCnzIpby8fO++fb/s3Cm3UFZWlp6efuUK/iIUQkin1+3du7e4uBghlJmZCSR59NFHy8qknyFCaO3adQCAlJQU/AjeZlfHjxz469fTLeov76IQJPnYY48/+LsHO3XqJI9t7LixEMGCY0cBAF2e69KmdZvRo0axDD1u/HgAQKtWrQAAkZF4F/6XX34BADz55JPt27cHALRr3271anx+/datW7169VYqh82YwfEchHDatOnyIx588KGHHnr4vrZtGxrqcw9nyRdBq1b33Xvf1q1brxYXAwD+0bMnL212hoeHAwD27d2LEJow4V9t7r13+vQwAMCSJdJRbYS+/vprAEBaWlogCFDCjW8WIK8W2nCAly1ll/rEE08AAGLmzM3Jzunb9xUAwOpVX12+eAkAcE+re8JmzDh75sz789MAAElJieUV5WEzZgIADmQcyMnJAQA88sgjG9avX7t2TYcOHe6///7y8vLQ0FAAwKxZsw7n5gwePBgAsHHTt/v27gEAvPDCX9PT01Peew8A0KHD/dXVVberdUs+WHTs6JHvNm9p3frep596kufYkNeGAQAKCgpoinrowYee79IFIXTt2lUAwNChwxoaGjt2fOSZp59uaKhDCK3/Zr1kAanaCdBOjFLTt0TMZpXcxIRMAEVSj/7hD48/9hhJ4CWz9F27AABTJk8+f+YMAGBA//5yA4MHDQIAjBwR8vbbb706+FUAQGpqan5eHgAgSrIGhNCUye8AAL7/bstzzz7bvl2727erEUKHc7IBAKFTpsxLTgYAbFi/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';

export type GenerationType =
  | 'worksheet'
  | 'quiz'
  | 'vocabulary'
  | 'lesson-plan'
  | 'content-adaptation'
  | 'message'
  | 'feedback'
  | 'image'
  | 'photosession'
  | 'presentation'
  | 'transcription'
  | 'gigachat-chat'
  | 'gigachat-image'
  | 'gigachat-embeddings'
  | 'gigachat-audio-speech'
  | 'gigachat-audio-transcription'
  | 'gigachat-audio-translation';

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
  ) { }

  /**
   * Создать запрос на генерацию
   * Все генерации работают через webhooks (n8n)
   */
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
    const { generationRequest, userGeneration } = await this.generationHelpers.createGeneration({
      userId,
      generationType,
      inputParams,
      model: model || this.getDefaultModel(generationType),
    });

    // Прямые генерации через Gamma API (презентации)
    if (generationType === 'presentation') {
      const directResult = await this.handleDirectGammaGeneration(
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

      throw new BadRequestException(`Direct GigaChat generation is not configured for ${generationType}`);
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
   * Универсальная генерация текста через GigaChat (HTML документ)
   */
  private async generateTextViaGigachat(
    generationType: GenerationType,
    generationRequestId: string,
    inputParams: Record<string, any>,
    requestedModel?: string,
  ) {
    console.log(`[GenerationsService] Starting text generation for ${generationType}`);
    const { systemPrompt, userPrompt } = this.buildGigachatPrompt(generationType, inputParams);
    const model = requestedModel || this.gigachatService.getDefaultModel('chat');
    console.log(`[GenerationsService] Using model: ${model}, prompt length: ${systemPrompt.length + userPrompt.length}`);

    const response = (await this.gigachatService.createChatCompletion({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7, // Чуть выше для креативности, но в рамках разумного
      top_p: 0.9,
      max_tokens: 8000, // Увеличено для больших рабочих листов с множеством заданий
    })) as any;

    const content = response?.choices?.[0]?.message?.content;
    console.log(`[GenerationsService] Received response from GigaChat, content length: ${content?.length || 0}`);

    if (!content) {
      throw new BadRequestException('GigaChat вернул пустой результат');
    }

    // Postprocess HTML to ensure MathJax is included if formulas are present
    console.log(`[GenerationsService] Starting HTML postprocessing for ${generationType}`);
    // Replace logo placeholder with actual base64 image
    const contentWithLogo = content.replace('LOGO_PLACEHOLDER', LOGO_BASE64);
    const processedContent = this.htmlPostprocessor.ensureMathJaxScript(contentWithLogo);
    console.log(`[GenerationsService] HTML postprocessing complete, processed length: ${processedContent.length}`);

    const normalizedResult = {
      provider: 'GigaChat-2-Max',
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
  }

  /**
   * Генерация изображений через GigaChat
   */
  private async generateImageViaGigachat(
    generationType: GenerationType,
    generationRequestId: string,
    inputParams: Record<string, any>,
    requestedModel?: string,
    userId?: string,
  ) {
    console.log(`[GenerationsService] Starting image generation for ${generationType}`);
    const model = requestedModel || this.gigachatService.getDefaultModel('image');

    const { prompt, style, size, photoUrl, photoHash, count } = inputParams;

    if (!prompt) {
      throw new BadRequestException('Prompt is required for image generation');
    }

    console.log(`[GenerationsService] Using model: ${model}, prompt: ${prompt}`);

    try {
      // Для фотосессии используем Replicate API
      if (generationType === 'photosession') {
        const photoHash = inputParams.photoHash;
        const prompt = inputParams.prompt;

        if (!photoHash) {
          throw new BadRequestException('No photo provided for photosession');
        }

        // Формируем URL фото
        const baseUrl = this.configService.get<string>('BASE_URL', 'https://api.prepodavai.ru');
        const photoUrl = `${baseUrl}/api/files/${photoHash}`;

        // URL для обратного вызова
        const callbackUrl = `${baseUrl}/api/webhooks/replicate-callback`;

        // Replicate API token
        const replicateToken = this.configService.get<string>('REPLICATE_API_TOKEN');
        if (!replicateToken) {
          throw new BadRequestException('REPLICATE_API_TOKEN not configured');
        }

        this.logger.log(`Sending photosession request to Replicate API: ${photoUrl}`);

        try {
          const axios = (await import('axios')).default;

          const requestBody = {
            input: {
              prompt: prompt,
              image_input: [photoUrl],
              resolution: '2K',
              aspect_ratio: '1:1',
              output_format: 'png',
              safety_filter_level: 'block_only_high'
            },
            webhook: callbackUrl,
            webhook_events_filter: ['completed']
          };

          this.logger.log(`Replicate request body: ${JSON.stringify(requestBody, null, 2)}`);

          // Отправляем запрос на Replicate API
          const response = await axios.post(
            'https://api.replicate.com/v1/models/google/nano-banana-pro/predictions',
            requestBody,
            {
              headers: {
                'Authorization': `Bearer ${replicateToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          const predictionId = response.data.id;
          this.logger.log(`Replicate prediction created: ${predictionId}`);

          // Сохраняем prediction ID в metadata генерации
          await this.prisma.generationRequest.update({
            where: { id: generationRequestId },
            data: {
              metadata: {
                replicatePredictionId: predictionId
              }
            }
          });

          // Возвращаем pending статус
          return {
            provider: 'Replicate',
            mode: 'photosession',
            status: 'pending',
            predictionId: predictionId,
            requestId: generationRequestId,
            completedAt: new Date().toISOString(),
          };
        } catch (error: any) {
          this.logger.error(`Failed to send Replicate request: ${error.message}`);
          if (error.response) {
            this.logger.error(`Replicate error response: ${JSON.stringify(error.response.data, null, 2)}`);
          }
          throw new BadRequestException(`Failed to start photosession: ${error.message}`);
        }
      }

      // Для остальных типов изображений используем GigaChat напрямую
      let messages: any[] = [];
      if (generationType === 'image' && inputParams.prompt) {
        messages = [
          {
            role: 'user',
            content: inputParams.prompt,
          },
        ];
      } else {
        // Fallback logic if needed, but currently only image/photosession use this method
        // and we handled photosession above.
        // If we are here, it's a regular image generation without prompt? 
        // Or maybe we should keep the old logic for 'image' type.
        // The old logic for 'image' was:
        messages = [
          {
            role: 'user',
            content: inputParams.prompt,
          },
        ];
      }

      const response = await this.gigachatService.createImage({
        model,
        prompt,
        messages, // Передаем сформированные сообщения (важно для photosession)
        function_call: 'auto',
      });

      console.log(`[GenerationsService] Image generated successfully`);

      // Извлекаем URL изображения из ответа
      const imageUrl = response?.data?.[0]?.url || response?.data?.[0]?.b64_json
        ? `data:image/jpeg;base64,${response.data[0].b64_json}`
        : null;

      if (!imageUrl) {
        throw new Error('No image URL in GigaChat response');
      }

      const normalizedResult = {
        provider: 'GigaChat',
        mode: 'image',
        model,
        imageUrl,
        imageUrls: undefined,
        prompt,
        style: style || 'realistic',
        photoUrl: photoUrl || null,
        count: count || 1,
        type: generationType,
        completedAt: new Date().toISOString(),
      };

      console.log(`[GenerationsService] Saving image generation result to database`);
      await this.generationHelpers.completeGeneration(generationRequestId, normalizedResult);
      console.log(`[GenerationsService] Image generation ${generationType} completed successfully`);

      return normalizedResult;
    } catch (error: any) {
      console.error(`[GenerationsService] Image generation failed:`, error);
      throw error;
    }
  }

  /**
   * Обработка генерации презентаций напрямую через Gamma API
   */
  private async handleDirectGammaGeneration(
    generationRequestId: string,
    inputParams: Record<string, any>,
  ) {
    try {
      this.logger.log(`Starting Gamma presentation generation for request ${generationRequestId}`);

      // Build Gamma API request from input parameters
      const gammaRequest = this.gammaService.buildGenerationRequest(inputParams);

      this.logger.log(`Gamma request payload: ${JSON.stringify(gammaRequest, null, 2)}`);

      // Call Gamma API to start generation
      const gammaResponse = await this.gammaService.generatePresentation(gammaRequest);

      this.logger.log(`Gamma API response: ${JSON.stringify(gammaResponse, null, 2)}`);

      // Store Gamma generation ID in metadata for tracking
      await this.prisma.generationRequest.update({
        where: { id: generationRequestId },
        data: {
          metadata: {
            gammaGenerationId: gammaResponse.id,
            gammaStatus: gammaResponse.status,
          } as any,
        },
      });

      // Enqueue polling job to check status every 5 seconds
      await this.gammaPollingQueue.add(
        'poll-gamma-status',
        {
          generationRequestId,
          gammaGenerationId: gammaResponse.id,
          attempt: 1,
        },
        {
          delay: 5000, // Start polling after 5 seconds
          attempts: 1, // Don't retry the job itself, processor handles retries
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      this.logger.log(`Enqueued polling job for Gamma generation ${gammaResponse.id}`);

      // Return pending status - presentation will complete via polling worker
      return {
        provider: 'Gamma AI',
        mode: 'presentation',
        status: 'pending',
        gammaGenerationId: gammaResponse.id,
        requestId: generationRequestId,
        completedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(
        `Gamma presentation generation failed for ${generationRequestId}: ${error?.message || error}`,
        error?.stack,
      );
      await this.generationHelpers.failGeneration(
        generationRequestId,
        error?.response?.data?.message || error?.message || 'Ошибка генерации через Gamma API',
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
        systemPrompt = `Твоя задача: Сгенерировать полноценный HTML-документ с встроенным CSS в строгом, профессиональном стиле.
ТРЕБОВАНИЯ К ДИЗАЙНУ (СТРОГИЙ И АККУРАТНЫЙ):
1. Типографика: Используй нейтральные шрифты (Inter, Roboto, -apple-system, sans-serif). Цвет текста: темно-серый (#222222), фон: белый (#FFFFFF).
2. Структура: Контейнер max-width: 720px, центрирование (margin: 0 auto), четкие отступы (padding: 40px 20px).
3. Стиль блоков:
   - Полный отказ от теней (box-shadow: none). Вместо них используй тонкие границы (border: 1px solid #E5E5E5).
   - Углы: либо прямые, либо минимальное скругление (border-radius: 4px).
   - Заголовки: контрастные, с увеличенным margin-bottom.
   - Цитаты и код: оформлять на светло-сером фоне (#F9F9F9) с моноширинным шрифтом.
4. Верстка: Адаптивная (mobile-friendly), line-height: 1.6 для основного текста.

КРИТИЧЕСКИ ВАЖНЫЕ ТРЕБОВАНИЯ К МАТЕМАТИЧЕСКИМ ФОРМУЛАМ:
1. ДЛЯ СТРОЧНЫХ ФОРМУЛ (внутри текста): используй ТОЛЬКО двойные доллары $$формула$$
   Пример: "Найдите значение $$\\frac{5}{6} : \\frac{3}{8}$$"
   НИКОГДА не используй одинарные $ для формул!

2. ДЛЯ БЛОЧНЫХ ФОРМУЛ (отдельной строкой): используй ТОЛЬКО двойные доллары на отдельных строках
   Пример:
   $$
   \\frac{1}{3} : \\frac{2}{9} =
   $$

3. ОБЯЗАТЕЛЬНАЯ КОНФИГУРАЦИЯ MathJax в <head>:
   <script>
   window.MathJax = {
     tex: {
       inlineMath: [['$$', '$$']],
       displayMath: [['$$', '$$']],
       processEscapes: true
     },
     svg: { fontCache: 'global' }
   };
   </script>
   <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>

4. ПРИМЕРЫ ПРАВИЛЬНОГО ИСПОЛЬЗОВАНИЯ:
   ✅ ПРАВИЛЬНО: "Вычислите $$\\frac{2}{3} + \\frac{1}{4}$$"
   ✅ ПРАВИЛЬНО: "Решите уравнение $$x^2 + 5x + 6 = 0$$"
   ❌ НЕПРАВИЛЬНО: "Вычислите $\\frac{2}{3}$" (одинарный $)
   ❌ НЕПРАВИЛЬНО: "Вычислите \\(\\frac{2}{3}\\)" (обратные слеши)
   ❌ НЕПРАВИЛЬНО: "Вычислите 2/3" (без LaTeX)

5. ВСЕ математические выражения ОБЯЗАТЕЛЬНО оборачивай в $$...$$ даже простые дроби!

ТРЕБОВАНИЯ К SVG ИЛЛЮСТРАЦИЯМ:
1. Для визуальных задач (геометрия, графики, диаграммы) ОБЯЗАТЕЛЬНО добавляй SVG иллюстрации прямо в HTML.
2. SVG должен быть встроенным (inline), не используй внешние файлы.
3. Примеры использования SVG:
   - Геометрические фигуры (треугольники, окружности, многоугольники)
   - Графики функций и координатные плоскости
   - Диаграммы (столбчатые, круговые, линейные)
   - Схемы и иллюстрации (молекулы, электрические схемы)
4. Стиль SVG: минималистичный, используй цвета из палитры (#222222, #666666, #E5E5E5)
5. Размер SVG: адаптивный (width="100%", max-width в CSS)
6. Пример SVG треугольника:
   <svg width="200" height="200" viewBox="0 0 200 200">
     <polygon points="100,20 20,180 180,180" fill="none" stroke="#222222" stroke-width="2"/>
     <text x="100" y="15" text-anchor="middle" font-size="14">A</text>
   </svg>

ФОРМАТ ОТВЕТА: Верни ТОЛЬКО валидный HTML-код (начиная с <!DOCTYPE html>). Не используй markdown-блоки кода (т.е. без \`\`\`html), просто чистый текст HTML.`;

        userPrompt = `Создай тест по предмету "${subject}" на тему "${topic}" для ${level} класса.
Количество вопросов: ${questionsCount || 10}.
Вариантов ответа: ${answersCount || 4}.
${customPrompt ? `Дополнительные требования: ${customPrompt}` : ''}`;
        break;
      }

      case 'vocabulary': {
        const { subject, topic, language, wordsCount, level, customPrompt } = inputParams;
        const languageNames: Record<string, string> = {
          en: 'английский', de: 'немецкий', fr: 'французский', es: 'испанский', it: 'итальянский', ru: 'русский',
        };
        const langName = languageNames[language] || language;

        systemPrompt = `Твоя задача: Сгенерировать структурированный HTML-документ в формате СЛОВАРЯ или ГЛОССАРИЯ.
!!! ВАЖНОЕ ПРАВИЛО ПРИОРИТЕТА !!!
В тексте задания (ниже) могут содержаться устаревшие требования вернуть ответ в формате JSON. ТЫ ДОЛЖЕН ПОЛНОСТЬЮ ИГНОРИРОВАТЬ ЛЮБЫЕ ТРЕБОВАНИЯ К ФОРМАТУ JSON В ТЕКСТЕ ЗАДАНИЯ. Твоя задача — взять *данные* из задания, но оформить их ИСКЛЮЧИТЕЛЬНО как HTML-страницу по инструкции ниже.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

ТРЕБОВАНИЯ К ДИЗАЙНУ (СТРОГИЙ ЭНЦИКЛОПЕДИЧЕСКИЙ СТИЛЬ):
1. Контейнер: max-width 760px, центрирование, padding 40px 20px.
2. Стиль записей: Вместо карточек с тенями используй строгие блоки.
   - Каждый термин отделен тонкой линией снизу (border-bottom: 1px solid #E5E5E5) или заключен в рамку (border: 1px solid #E0E0E0).
   - Никаких теней (box-shadow: none) и ярких фонов.
   - Padding внутри блока: 20px 0 (или 20px внутри рамки).
3. Типографика:
   - ТЕРМИН: Крупный, жирный, цвет почти черный (#111).
   - МЕТА-ДАННЫЕ (транскрипция, род, часть речи): Темно-серый цвет (#666), шрифт чуть меньше, возможно моноширинный для транскрипции.
   - ОПРЕДЕЛЕНИЕ: Контрастный шрифт (line-height: 1.6).
   - ПРИМЕРЫ: Должны быть визуально отделены (например, серым вертикальным бордером слева border-left: 3px solid #eee, с отступом padding-left).
4. Шрифт: Inter, Roboto, -apple-system, sans-serif.

КРИТИЧЕСКИ ВАЖНЫЕ ТРЕБОВАНИЯ К МАТЕМАТИЧЕСКИМ ФОРМУЛАМ:
1. ДЛЯ СТРОЧНЫХ ФОРМУЛ (внутри текста): используй ТОЛЬКО двойные доллары $$формула$$
   Пример: "Найдите значение $$\\frac{5}{6} : \\frac{3}{8}$$"
   НИКОГДА не используй одинарные $ для формул!

2. ДЛЯ БЛОЧНЫХ ФОРМУЛ (отдельной строкой): используй ТОЛЬКО двойные доллары на отдельных строках
   Пример:
   $$
   \\frac{1}{3} : \\frac{2}{9} =
   $$

3. ОБЯЗАТЕЛЬНАЯ КОНФИГУРАЦИЯ MathJax в <head>:
   <script>
   window.MathJax = {
     tex: {
       inlineMath: [['$$', '$$']],
       displayMath: [['$$', '$$']],
       processEscapes: true
     },
     svg: { fontCache: 'global' }
   };
   </script>
   <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>

4. ПРИМЕРЫ ПРАВИЛЬНОГО ИСПОЛЬЗОВАНИЯ:
   ✅ ПРАВИЛЬНО: "Вычислите $$\\frac{2}{3} + \\frac{1}{4}$$"
   ✅ ПРАВИЛЬНО: "Решите уравнение $$x^2 + 5x + 6 = 0$$"
   ❌ НЕПРАВИЛЬНО: "Вычислите $\\frac{2}{3}$" (одинарный $)
   ❌ НЕПРАВИЛЬНО: "Вычислите \\(\\frac{2}{3}\\)" (обратные слеши)
   ❌ НЕПРАВИЛЬНО: "Вычислите 2/3" (без LaTeX)

5. ВСЕ математические выражения ОБЯЗАТЕЛЬНО оборачивай в $$...$$ даже простые дроби!
ФОРМАТ ОТВЕТА: Верни ТОЛЬКО валидный HTML-код (начиная с <!DOCTYPE html>). Не используй markdown-блоки кода (т.е. без \`\`\`html), просто чистый текст HTML.`;

        userPrompt = `Создай словарь по теме "${topic}" (${subject || ''}) на ${langName} языке.
Уровень: ${level || 'базовый'}.
Количество слов: ${wordsCount || 20}.
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}`;
        break;
      }

      case 'lesson-plan': {
        const { subject, topic, level, duration, objectives, customPrompt } = inputParams;
        systemPrompt = `Твоя задача: Сгенерировать четкий, структурированный и профессиональный ПЛАН УРОКА.
ТРЕБОВАНИЯ К ДИЗАЙНУ (ОФИЦИАЛЬНО-ДЕЛОВОЙ СТИЛЬ):
1. Контейнер: max-width 800px, центрирование, белый фон.
2. Типографика: Строгий sans-serif (Inter, Arial, system-ui). Цвет текста #1a1a1a.
3. Заголовки:
   - H1 (Тема урока): Крупный, с нижним подчеркиванием (border-bottom: 2px solid #000), margin-bottom: 30px.
   - H2 (Разделы): Четкие, жирные, с небольшим отступом снизу.
4. Списки: Аккуратные <ul>/<ol> с отступом слева (padding-left: 20px).

ТРЕБОВАНИЯ К ТАБЛИЦЕ ("ХОД УРОКА"):
1. Секцию 'Ход урока' ОБЯЗАТЕЛЬНО оформи как HTML-таблицу (<table>).
2. Стиль таблицы (Strict Grid):
   - border-collapse: collapse; width: 100%; margin-top: 20px;
   - Границы ячеек: border: 1px solid #cccccc; (тонкие серые линии).
   - Заголовок таблицы (thead): Фон светло-серый (#f4f4f4), текст жирный, выравнивание по левому краю.
   - Ячейки (td): Padding 10px 12px, vertical-align: top (текст всегда сверху).
3. Колонки: 'Этап', 'Время', 'Деятельность учителя/учеников'.

КРИТИЧЕСКИ ВАЖНЫЕ ТРЕБОВАНИЯ К МАТЕМАТИЧЕСКИМ ФОРМУЛАМ:
1. ДЛЯ СТРОЧНЫХ ФОРМУЛ (внутри текста): используй ТОЛЬКО двойные доллары $$формула$$
   Пример: "Найдите значение $$\\frac{5}{6} : \\frac{3}{8}$$"
   НИКОГДА не используй одинарные $ для формул!

2. ДЛЯ БЛОЧНЫХ ФОРМУЛ (отдельной строкой): используй ТОЛЬКО двойные доллары на отдельных строках
   Пример:
   $$
   \\frac{1}{3} : \\frac{2}{9} =
   $$

3. ОБЯЗАТЕЛЬНАЯ КОНФИГУРАЦИЯ MathJax в <head>:
   <script>
   window.MathJax = {
     tex: {
       inlineMath: [['$$', '$$']],
       displayMath: [['$$', '$$']],
       processEscapes: true
     },
     svg: { fontCache: 'global' }
   };
   </script>
   <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>

4. ПРИМЕРЫ ПРАВИЛЬНОГО ИСПОЛЬЗОВАНИЯ:
   ✅ ПРАВИЛЬНО: "Вычислите $$\\frac{2}{3} + \\frac{1}{4}$$"
   ✅ ПРАВИЛЬНО: "Решите уравнение $$x^2 + 5x + 6 = 0$$"
   ❌ НЕПРАВИЛЬНО: "Вычислите $\\frac{2}{3}$" (одинарный $)
   ❌ НЕПРАВИЛЬНО: "Вычислите \\(\\frac{2}{3}\\)" (обратные слеши)
   ❌ НЕПРАВИЛЬНО: "Вычислите 2/3" (без LaTeX)

5. ВСЕ математические выражения ОБЯЗАТЕЛЬНО оборачивай в $$...$$ даже простые дроби!
ФОРМАТ ОТВЕТА: Верни ТОЛЬКО валидный HTML-код (начиная с <!DOCTYPE html>). Не используй markdown-блоки кода (т.е. без \`\`\`html), просто чистый текст HTML.`;

        userPrompt = `Создай план урока по предмету "${subject}" на тему "${topic}" для ${level} класса.
Длительность: ${duration || 45} мин.
Цели: ${objectives || 'на твое усмотрение'}.
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}`;
        break;
      }

      case 'content-adaptation': {
        const { text, action, level, customPrompt } = inputParams;
        systemPrompt = `Твоя задача: Сгенерировать ответ в виде HTML-документа со строгим, минималистичным дизайном (стиль технической спецификации).
ТРЕБОВАНИЯ К ДИЗАЙНУ (STRICT & CLEAN):
1. Макет:
   - Контейнер max-width: 740px, выравнивание по центру.
   - Шрифт: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif.
   - Основной цвет текста: #1F2937 (глубокий серый), Фон: #FFFFFF.
   - Line-height: 1.6 для основного текста.
2. Декоративные элементы:
   - Полный отказ от теней (box-shadow). Используй только границы (border: 1px solid #E5E7EB).
   - Заголовки: Черные, жирные, отделены от текста отступами.
   - Если есть блоки кода или выделения: использовать фон #F9FAFB (очень светло-серый) и border-radius: 4px.
3. Списки: Маркеры должны быть внутри контента (list-style-position: inside) или с аккуратным padding-left.

КРИТИЧЕСКИ ВАЖНЫЕ ТРЕБОВАНИЯ К МАТЕМАТИЧЕСКИМ ФОРМУЛАМ:
1. ДЛЯ СТРОЧНЫХ ФОРМУЛ (внутри текста): используй ТОЛЬКО двойные доллары $$формула$$
   Пример: "Найдите значение $$\\frac{5}{6} : \\frac{3}{8}$$"
   НИКОГДА не используй одинарные $ для формул!

2. ДЛЯ БЛОЧНЫХ ФОРМУЛ (отдельной строкой): используй ТОЛЬКО двойные доллары на отдельных строках
   Пример:
   $$
   \\frac{1}{3} : \\frac{2}{9} =
   $$

3. ОБЯЗАТЕЛЬНАЯ КОНФИГУРАЦИЯ MathJax в <head>:
   <script>
   window.MathJax = {
     tex: {
       inlineMath: [['$$', '$$']],
       displayMath: [['$$', '$$']],
       processEscapes: true
     },
     svg: { fontCache: 'global' }
   };
   </script>
   <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>

4. ПРИМЕРЫ ПРАВИЛЬНОГО ИСПОЛЬЗОВАНИЯ:
   ✅ ПРАВИЛЬНО: "Вычислите $$\\frac{2}{3} + \\frac{1}{4}$$"
   ✅ ПРАВИЛЬНО: "Решите уравнение $$x^2 + 5x + 6 = 0$$"
   ❌ НЕПРАВИЛЬНО: "Вычислите $\\frac{2}{3}$" (одинарный $)
   ❌ НЕПРАВИЛЬНО: "Вычислите \\(\\frac{2}{3}\\)" (обратные слеши)
   ❌ НЕПРАВИЛЬНО: "Вычислите 2/3" (без LaTeX)

5. ВСЕ математические выражения ОБЯЗАТЕЛЬНО оборачивай в $$...$$ даже простые дроби!
ФОРМАТ ОТВЕТА: Верни ТОЛЬКО валидный HTML-код (начиная с <!DOCTYPE html>). Не используй markdown-блоки кода (т.е. без \`\`\`html), просто чистый текст HTML.`;

        userPrompt = `Адаптируй текст для ${level} класса.
Действие: ${action || 'упростить'}.
Текст:
${text}
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}`;
        break;
      }

      case 'message': {
        const { templateId, formData, customPrompt } = inputParams;
        systemPrompt = `Твоя задача: Сгенерировать ответ в виде HTML-документа с чистым, строгим и профессиональным дизайном.
ТРЕБОВАНИЯ К ДИЗАЙНУ (MINIMALIST & STRICT):
1. Структура страницы:
   - Контейнер: max-width 720px, выравнивание по центру (margin: 0 auto), padding: 40px 20px.
   - Шрифт: system-ui, -apple-system, Inter, Roboto, sans-serif.
   - Текст: Темно-серый (#2c2c2c) на белом фоне. Line-height: 1.6.
2. Оформление элементов:
   - Заголовки: Четкие, черные, с отступом снизу. H1 и H2 должны иметь тонкую линию снизу (border-bottom: 1px solid #eaeaea).
   - Таблицы: Строгий стиль. border-collapse: collapse. Границы ячеек: 1px solid #e0e0e0. Шапка таблицы: жирный шрифт, фон #f9f9f9.
   - Списки: Маркеры аккуратные, с отступами.
   - Исключи любые тени (box-shadow) и яркие цвета. Используй только границы (border) и оттенки серого.

КРИТИЧЕСКИ ВАЖНЫЕ ТРЕБОВАНИЯ К МАТЕМАТИЧЕСКИМ ФОРМУЛАМ:
1. ДЛЯ СТРОЧНЫХ ФОРМУЛ (внутри текста): используй ТОЛЬКО двойные доллары $$формула$$
   Пример: "Найдите значение $$\\frac{5}{6} : \\frac{3}{8}$$"
   НИКОГДА не используй одинарные $ для формул!

2. ДЛЯ БЛОЧНЫХ ФОРМУЛ (отдельной строкой): используй ТОЛЬКО двойные доллары на отдельных строках
   Пример:
   $$
   \\frac{1}{3} : \\frac{2}{9} =
   $$

3. ОБЯЗАТЕЛЬНАЯ КОНФИГУРАЦИЯ MathJax в <head>:
   <script>
   window.MathJax = {
     tex: {
       inlineMath: [['$$', '$$']],
       displayMath: [['$$', '$$']],
       processEscapes: true
     },
     svg: { fontCache: 'global' }
   };
   </script>
   <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>

4. ПРИМЕРЫ ПРАВИЛЬНОГО ИСПОЛЬЗОВАНИЯ:
   ✅ ПРАВИЛЬНО: "Вычислите $$\\frac{2}{3} + \\frac{1}{4}$$"
   ✅ ПРАВИЛЬНО: "Решите уравнение $$x^2 + 5x + 6 = 0$$"
   ❌ НЕПРАВИЛЬНО: "Вычислите $\\frac{2}{3}$" (одинарный $)
   ❌ НЕПРАВИЛЬНО: "Вычислите \\(\\frac{2}{3}\\)" (обратные слеши)
   ❌ НЕПРАВИЛЬНО: "Вычислите 2/3" (без LaTeX)

5. ВСЕ математические выражения ОБЯЗАТЕЛЬНО оборачивай в $$...$$ даже простые дроби!
ФОРМАТ ОТВЕТА: Верни ТОЛЬКО валидный HTML-код (начиная с <!DOCTYPE html>). Не используй markdown-блоки кода (т.е. без \`\`\`html), просто чистый текст HTML.`;

        userPrompt = `Создай сообщение для родителей.
Данные: ${JSON.stringify(formData || {})}
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}`;
        break;
      }

      case 'feedback': {
        const { studentWork, taskType, criteria, level, customPrompt } = inputParams;
        systemPrompt = `Твоя задача: Сгенерировать конструктивный и профессиональный ФИДБЕК (АУДИТ РАБОТЫ).
ТРЕБОВАНИЯ К ДИЗАЙНУ (СТИЛЬ "ПРОФЕССИОНАЛЬНЫЙ АУДИТ"):
1. Макет:
   - Контейнер: max-width 760px, по центру, padding 40px 20px.
   - Шрифт: Inter, system-ui, sans-serif. Основной текст: #111.
   - Отказ от теней (box-shadow: none).
2. Структура отчета (Визуальные блоки):
   - ОЦЕНКА: Не используй круги или яркие плашки. Сделай строгий блок: "Итоговый результат: X/10" крупным шрифтом с нижней границей (border-bottom).
   - СЕКЦИИ (Плюсы/Минусы): Вместо заливки цветом используй стиль "Callout" (белый фон, тонкая рамка border: 1px solid #eee).
     * Для "Сильных сторон": Добавь акцент слева (border-left: 4px solid #10b981) — темно-зеленый.
     * Для "Зон роста/Ошибок": Добавь акцент слева (border-left: 4px solid #f59e0b) — сдержанный оранжевый.
   - ЗАГОЛОВКИ СЕКЦИЙ: Используй uppercase (все заглавные), мелкий размер, серый цвет (#666) и letter-spacing (разрядку), как в технической документации.
3. Списки:
   - Используй маркированные списки (<ul>) внутри блоков. Маркеры должны быть аккуратными.

КРИТИЧЕСКИ ВАЖНЫЕ ТРЕБОВАНИЯ К МАТЕМАТИЧЕСКИМ ФОРМУЛАМ:
1. ДЛЯ СТРОЧНЫХ ФОРМУЛ (внутри текста): используй ТОЛЬКО двойные доллары $$формула$$
   Пример: "Найдите значение $$\\frac{5}{6} : \\frac{3}{8}$$"
   НИКОГДА не используй одинарные $ для формул!

2. ДЛЯ БЛОЧНЫХ ФОРМУЛ (отдельной строкой): используй ТОЛЬКО двойные доллары на отдельных строках
   Пример:
   $$
   \\frac{1}{3} : \\frac{2}{9} =
   $$

3. ОБЯЗАТЕЛЬНАЯ КОНФИГУРАЦИЯ MathJax в <head>:
   <script>
   window.MathJax = {
     tex: {
       inlineMath: [['$$', '$$']],
       displayMath: [['$$', '$$']],
       processEscapes: true
     },
     svg: { fontCache: 'global' }
   };
   </script>
   <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>

4. ПРИМЕРЫ ПРАВИЛЬНОГО ИСПОЛЬЗОВАНИЯ:
   ✅ ПРАВИЛЬНО: "Вычислите $$\\frac{2}{3} + \\frac{1}{4}$$"
   ✅ ПРАВИЛЬНО: "Решите уравнение $$x^2 + 5x + 6 = 0$$"
   ❌ НЕПРАВИЛЬНО: "Вычислите $\\frac{2}{3}$" (одинарный $)
   ❌ НЕПРАВИЛЬНО: "Вычислите \\(\\frac{2}{3}\\)" (обратные слеши)
   ❌ НЕПРАВИЛЬНО: "Вычислите 2/3" (без LaTeX)

5. ВСЕ математические выражения ОБЯЗАТЕЛЬНО оборачивай в $$...$$ даже простые дроби!
ФОРМАТ ОТВЕТА: Верни ТОЛЬКО валидный HTML-код (начиная с <!DOCTYPE html>). Не используй markdown-блоки кода (т.е. без \`\`\`html), просто чистый текст HTML.`;

        userPrompt = `Дай фидбек по работе ученика.
Работа:
${studentWork}

Тип задания: ${taskType || 'общее'}.
Критерии: ${criteria || 'стандартные'}.
Уровень: ${level || 'средний'}.
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}`;
        break;
      }

      default:
        throw new BadRequestException(`Prompt builder not implemented for ${generationType}`);
    }

    return { systemPrompt, userPrompt };
  }

  private buildWorksheetPrompt(inputParams: Record<string, any>) {
    const {
      subject,
      topic,
      level,
      questionsCount,
      preferences,
      customPrompt,
    } = inputParams;

    // 1. SYSTEM PROMPT: Жесткие технические ограничения
    const systemPrompt = `Ты — профессиональный технический генератор кода. Твоя единственная функция — выдавать чистый HTML-код. Ты НЕ являешься чат-ботом.

ЗАДАЧА:
Сгенерировать рабочий лист в формате HTML, который визуально идентичен распечатанному документу формата А4.

КРИТИЧЕСКИЕ ПРАВИЛА ВЫВОДА (СОБЛЮДАТЬ СТРОГО):
1.  **ТОЛЬКО КОД:** Твой ответ должен начинаться символами "<!DOCTYPE html>" и заканчиваться символами "</html>".
2.  **НИКАКОГО ТЕКСТА ПОСЛЕ КОДА:** Категорически запрещено писать после закрывающего тега </html>. Никаких объяснений вроде "Этот код создает...", "Надеюсь, это поможет" и т.д.
3.  **БЕЗ MARKDOWN:** Не оборачивай код в тройные кавычки (\`\`\`html ... \`\`\`). Верни "сырую" строку HTML.

ТРЕБОВАНИЯ К ВЕРСТКЕ (СТИЛЬ "БУМАЖНЫЙ ЛИСТ"):
1.  **Основа:**
    -   Ширина контента: 210mm.
    -   Минимальная высота: 297mm.
    -   Padding: 20mm.
    -   Фон страницы (body): светло-серый (#f0f0f0).
    -   Фон листа (.sheet): белый (#ffffff).
    -   Шрифт: "Times New Roman", Times, serif.

2.  **Структура документа:**
    -   **Шапка (на первом листе):**
        -   Слева: "Рабочий лист по предмету: [Предмет]" (жирным).
        -   Справа: <img src="LOGO_PLACEHOLDER" class="header-logo" alt="prepodavAI">
        -   Ниже: Поля: "Имя: _______", "Класс: _______", "Дата: _______".
    -   **Тело заданий:** Нумерованный список. page-break-inside: avoid.
    -   **Блок ответов:** Должен быть на НОВОЙ СТРАНИЦЫ (page-break-before: always).

3.  **Стилизация элементов:**
    -   **Тесты:** Символы квадратов ($$\\square$$ или &#9744;).
    -   **Впиши пропущенное:** Нижнее подчеркивание.
    -   **Соотнесение:** Две колонки (Grid/Flex).
    -   **Разлиновка:** Пустые строки для ответа от руки.

4.  **Математика (MathJax):**
    -   Вставь скрипт MathJax в <head>.
    -   Формулы: используй \`$$...$$\` для выключных формул (на отдельной строке) и \`$...$\` для строчных (внутри текста).
    -   **ВАЖНО:** Не используй запятые внутри формул для перечисления, если это не часть математического выражения.
    -   **ВАЖНО:** Пиши чистый LaTeX без лишних текстовых пояснений внутри формул.

CSS ШАБЛОН:
<style>
  body { background: #e0e0e0; font-family: 'Times New Roman', serif; margin: 0; padding: 20px; }
  .sheet {
    background: white;
    width: 210mm;
    min-height: 297mm;
    padding: 20mm;
    margin: 0 auto 20px auto;
    box-shadow: 0 0 10px rgba(0,0,0,0.1);
    box-sizing: border-box;
    position: relative;
  }
  .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 30px; position: relative; }
  .header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
  .header-logo { position: absolute; top: 0; right: 0; width: 80px; height: auto; }
  .student-info { display: flex; gap: 20px; margin-top: 10px; }
  .field { border-bottom: 1px solid black; flex-grow: 1; padding-left: 5px; }
  .task-block { margin-bottom: 25px; page-break-inside: avoid; }
  .task-title { font-weight: bold; margin-bottom: 8px; font-size: 1.1em; }
  .match-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .lines-for-writing {
    margin-top: 10px;
    line-height: 30px;
    background-image: linear-gradient(#999 1px, transparent 1px);
    background-size: 100% 30px;
    height: 90px;
  }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th, td { border: 1px solid black; padding: 8px; text-align: left; }
  .page-break { page-break-before: always; }
  
  @media print {
    body { background: none; margin: 0; padding: 0; }
    .sheet { box-shadow: none; margin: 0; width: 100%; min-height: auto; page-break-after: always; }
    .sheet:last-child { page-break-after: auto; }
  }
</style>
<script>
window.MathJax = { 
  tex: { 
    inlineMath: [['$', '$'], ['\\(', '\\)']], 
    displayMath: [['$$', '$$'], ['\\[', '\\]']] 
  }, 
  svg: { fontCache: 'global' },
  options: {
    ignoreHtmlClass: 'tex2jax_ignore',
    processHtmlClass: 'tex2jax_process'
  }
};
</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
`;



    // 2. СБОР ПАРАМЕТРОВ
    const details: string[] = [];

    if (subject) details.push(`Предмет: ${subject}`);
    if (topic) details.push(`Тема: ${topic}`);
    if (level) details.push(`Класс / уровень: ${level}`);
    if (questionsCount) details.push(`Количество заданий: ${questionsCount} (Распредели на несколько страниц)`);
    if (preferences) details.push(`Особые пожелания: ${preferences}`);
    if (customPrompt) details.push(`Дополнительные инструкции: ${customPrompt}`);

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
      console.log(`📤 Sending webhook request to ${webhookUrl}`, {
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
          `Webhook error: ${error.message}`,
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
      'gigachat-audio-speech': '',
      'gigachat-audio-transcription': '',
      'gigachat-audio-translation': '',
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
      'gigachat-audio-speech': '',
      'gigachat-audio-transcription': '',
      'gigachat-audio-translation': '',
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
  private generatePrompt(generationType: GenerationType, inputParams: Record<string, any>): string {
    switch (generationType) {
      case 'worksheet': {
        const { subject, topic, level, questionsCount, customPrompt } = inputParams;
        return `Ты опытный учитель-методист. Создай КАЧЕСТВЕННЫЙ и ДЕТАЛЬНЫЙ рабочий лист по предмету "${subject}" на тему "${topic}" для ${level} класса.

Требования:
1. ЦЕЛИ ОБУЧЕНИЯ (2-3 конкретные цели)
   - Что ученик должен знать после выполнения
   - Какие навыки должен приобрести

2. ЗАДАНИЯ (${questionsCount || 10} заданий)
   Используй РАЗНООБРАЗНЫЕ типы:
   - Вопросы с кратким ответом
   - Задачи с решением
   - Упражнения на применение
   - Творческие задания
   - Вопросы на анализ и синтез
   
   Каждое задание должно содержать:
   - Четкую формулировку
   - Достаточно места для ответа
   - Количество баллов за задание

3. ИНСТРУКЦИИ ДЛЯ УЧЕНИКА
   - Как выполнять задания
   - Время на выполнение
   - Критерии оценивания

4. КЛЮЧИ ОТВЕТОВ (в конце, отдельным блоком)

ВАЖНО: Задания должны соответствовать уровню ${level} класса, быть понятными и интересными.
Формат: чистый структурированный текст без markdown разметки, готовый к печати.

${customPrompt ? `\nДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ:\n${customPrompt}` : ''}`;
      }

      case 'quiz': {
        const { subject, topic, level, questionsCount, answersCount, customPrompt } = inputParams;
        return `Ты опытный учитель-методист. Создай КАЧЕСТВЕННЫЙ тест по предмету "${subject}" на тему "${topic}" для ${level} класса.

Требования:
1. КОЛИЧЕСТВО ВОПРОСОВ: ${questionsCount || 10}
2. ВАРИАНТЫ ОТВЕТОВ: ${answersCount || 4} варианта на каждый вопрос
3. ТИПЫ ВОПРОСОВ: используй разнообразные типы (выбор одного, множественный выбор, на соответствие)
4. СЛОЖНОСТЬ: соответствует уровню ${level} класса

СТРУКТУРА:
- Каждый вопрос должен быть четко сформулирован
- Правильный ответ должен быть помечен
- Для каждого вопроса добавь объяснение правильного ответа
- В конце добавь ключ с правильными ответами

${customPrompt ? `\nДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ:\n${customPrompt}` : ''}`;
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

        return `Ты опытный преподаватель ${langName} языка. Создай КАЧЕСТВЕННЫЙ учебный словарь по теме "${topic}" на ${langName} языке.

КОНТЕКСТ:
- Язык словаря: ${langName} (код: ${language})
- Тема словаря: "${topic}"
${subject ? `- Предмет/область: ${subject}` : ''}
- Уровень сложности: ${level || 'базовый'}
- Количество слов в словаре: ${wordsCount || 20}

ОБЯЗАТЕЛЬНЫЕ ТРЕБОВАНИЯ:
1. ВЫБОР СЛОВ: все слова должны быть напрямую связаны с темой "${topic}"
2. ДЛЯ КАЖДОГО СЛОВА УКАЖИ:
   - Слово на ${langName} языке
   - Точный перевод на русский
   - Фонетическую транскрипцию
   - Часть речи
   - Пример использования в предложении

${customPrompt ? `\nДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ:\n${customPrompt}` : ''}`;
      }

      case 'lesson-plan': {
        const { subject, topic, level, duration, objectives } = inputParams;
        return `Ты опытный учитель-методист с большим стажем. Создай ДЕТАЛЬНЫЙ и ПРАКТИЧНЫЙ план урока по предмету "${subject}" на тему "${topic}" для ${level} класса.

ПАРАМЕТРЫ УРОКА:
- Длительность: ${duration || 45} минут
- Целевая аудитория: ${level} класс
- Цели: ${objectives || 'Определи самостоятельно на основе темы'}

СТРУКТУРА ПЛАНА (обязательная):
1. ТЕМА И ЦЕЛИ (5 мин на вводную часть)
2. НЕОБХОДИМЫЕ МАТЕРИАЛЫ
3. ХОД УРОКА (с точным хронометражем)
4. МЕТОДЫ И ПРИЕМЫ
5. ДИФФЕРЕНЦИАЦИЯ
6. ОЦЕНИВАНИЕ

Формат: структурированный текст с четкими разделами и таймингом, готовый к использованию.`;
      }

      case 'content-adaptation': {
        const { text, action, level, sourceType } = inputParams;
        return `Ты опытный учитель-методист. Адаптируй следующий учебный материал для ${level} класса.

ДЕЙСТВИЕ: ${action || 'упростить'}
ИСХОДНЫЙ ТЕКСТ:
${text}

ТРЕБОВАНИЯ:
- Адаптировать под уровень ${level} класса
- Сохранить основную информацию
- Использовать понятный язык
- Добавить примеры и пояснения при необходимости

Формат: адаптированный текст, готовый к использованию.`;
      }

      case 'message': {
        const { templateId, formData } = inputParams;
        return `Ты опытный учитель. Создай сообщение для родителей на основе следующих данных:

${formData ? `Данные:\n${JSON.stringify(formData, null, 2)}` : ''}

ТРЕБОВАНИЯ:
- Вежливый и профессиональный тон
- Конкретная информация
- Конструктивные рекомендации
- Понятный язык для родителей

Формат: готовое сообщение для отправки.`;
      }

      case 'feedback': {
        const { studentWork, taskType, criteria, level } = inputParams;
        return `Ты опытный учитель. Дай конструктивную обратную связь по работе ученика.

РАБОТА УЧЕНИКА:
${studentWork}

ТИП ЗАДАНИЯ: ${taskType || 'общее'}
КРИТЕРИИ: ${criteria || 'стандартные'}
УРОВЕНЬ: ${level || 'средний'}

ТРЕБОВАНИЯ:
- Отметь сильные стороны
- Укажи на ошибки и недочеты
- Дай конкретные рекомендации по улучшению
- Поддерживающий и мотивирующий тон

Формат: структурированная обратная связь, готовая к использованию.`;
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
    const systemMessages: Partial<Record<GenerationType, string>> = {
      worksheet: 'Ты опытный учитель-методист, создающий качественные учебные материалы',
      quiz: 'Ты опытный учитель-методист, создающий качественные тесты и контрольные работы',
      vocabulary:
        'Ты опытный преподаватель иностранных языков, создающий эффективные учебные словари',
      'lesson-plan':
        'Ты опытный учитель-методист с большим стажем, создающий эффективные планы уроков',
      'content-adaptation':
        'Ты опытный учитель-методист, помогающий адаптировать учебные материалы для разных уровней и целей',
      message: 'Ты опытный учитель, создающий профессиональные сообщения для родителей',
      feedback:
        'Ты опытный педагог-эксперт, предоставляющий конструктивную обратную связь ученикам',
    };

    return systemMessages[generationType] || 'Ты опытный учитель-методист';
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
      'gigachat-audio-speech': 'gigachat_audio',
      'gigachat-audio-transcription': 'gigachat_audio',
      'gigachat-audio-translation': 'gigachat_audio',
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
      'gigachat-audio-speech': 'GigaChat-Audio',
      'gigachat-audio-transcription': 'GigaChat-Audio',
      'gigachat-audio-translation': 'GigaChat-Audio',
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
