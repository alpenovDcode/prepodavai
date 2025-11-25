import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GenerationHelpersService } from './generation-helpers.service';
import { GenerationQueueService } from './generation-queue.service';
import { SubscriptionsService, OperationType } from '../subscriptions/subscriptions.service';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { GigachatService } from '../gigachat/gigachat.service';

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
    private gigachatService: GigachatService,
  ) {}

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

    // Прямые генерации через GigaChat (минуя webhooks)
    if (this.shouldUseDirectGigachatGeneration(generationType)) {
      const directResult = await this.handleDirectGigachatGeneration(
        generationType,
        generationRequest.id,
        inputParams,
        model,
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
   * Временно включаем для отдельных типов (начинаем с worksheet)
   */
  private shouldUseDirectGigachatGeneration(generationType: GenerationType): boolean {
    return generationType === 'worksheet';
  }

  /**
   * Обработка генерации напрямую через GigaChat
   */
  private async handleDirectGigachatGeneration(
    generationType: GenerationType,
    generationRequestId: string,
    inputParams: Record<string, any>,
    requestedModel?: string,
  ) {
    try {
      switch (generationType) {
        case 'worksheet':
          return await this.generateWorksheetViaGigachat(
            generationRequestId,
            inputParams,
            requestedModel,
          );
        default:
          throw new BadRequestException(`Direct GigaChat generation is not configured for ${generationType}`);
      }
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
   * Генерация рабочего листа через GigaChat (HTML документ)
   */
  private async generateWorksheetViaGigachat(
    generationRequestId: string,
    inputParams: Record<string, any>,
    requestedModel?: string,
  ) {
    const { systemPrompt, userPrompt } = this.buildWorksheetPrompt(inputParams);
    const model = requestedModel || this.gigachatService.getDefaultModel('chat');

    const response = (await this.gigachatService.createChatCompletion({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      top_p: 0.9,
      max_tokens: 2048,
    })) as any;

    const content = response?.choices?.[0]?.message?.content;

    if (!content) {
      throw new BadRequestException('GigaChat вернул пустой результат при генерации рабочего листа');
    }

    const normalizedResult = {
      provider: 'GigaChat-2-Max',
      mode: 'chat',
      model,
      content,
      prompt: {
        system: systemPrompt,
        user: userPrompt,
      },
      completedAt: new Date().toISOString(),
    };

    await this.generationHelpers.completeGeneration(generationRequestId, normalizedResult);

    return normalizedResult;
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

    const systemPrompt = `Ты профессиональный помощник. Твоя задача: Сгенерировать полноценный HTML-документ с профессиональной, строгой версткой.

ТРЕБОВАНИЯ К ДИЗАЙНУ (СТРОГИЙ МИНИМАЛИЗМ):
1. Типографика: Используй чистые шрифты (Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif). Основной цвет текста — темно-серый (#1a1a1a), фон — белый (#ffffff).
2. Структура: Контейнер max-width: 750px, центрирование, padding: 40px 20px.
3. Стилизация блоков:
   - Откажись от теней (box-shadow) в пользу тонких границ (border: 1px solid #e5e5e5).
   - Используй минимальное скругление углов (border-radius: 4px) или прямые углы.
   - Заголовки должны быть контрастными и иметь четкие отступы.
   - Код и цитаты оформляй на светло-сером фоне (#f7f7f7) с моноширинным шрифтом.
4. Адаптивность: Полная поддержка мобильных устройств, отступы должны масштабироваться.

ТРЕБОВАНИЯ К ФОРМУЛАМ И СПЕЦСИМВОЛАМ:
1. Если в ответе есть формулы (математика, физика, химия), ОБЯЗАТЕЛЬНО используй LaTeX.
2. Используй разделители \\( ... \\) для строчных формул и \\[ ... \\] для отдельных блоков.
3. Добавь в секцию <head> скрипт для рендеринга LaTeX: <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
4. Убедись, что формулы имеют достаточные отступы сверху и снизу для читаемости.

ФОРМАТ ОТВЕТА:
Верни ТОЛЬКО валидный HTML-код (начиная с <!DOCTYPE html>). Не используй markdown-блоки кода (без \`\`\`). Верни чистый HTML.`;

    const details: string[] = [];

    if (subject) details.push(`Предмет: ${subject}`);
    if (topic) details.push(`Тема: ${topic}`);
    if (level) details.push(`Класс / уровень: ${level}`);
    if (questionsCount) details.push(`Количество заданий: ${questionsCount}`);
    if (preferences) details.push(`Особые пожелания: ${preferences}`);
    if (customPrompt) details.push(`Дополнительные инструкции: ${customPrompt}`);

    const userPrompt = `Сгенерируй рабочий лист в HTML-формате по следующим параметрам:
${details.length ? details.join('\n') : 'Используй стандартные параметры.'}

Структура документа должна включать:
- Заголовок с предметом и темой
- Краткое вводное описание/цель урока
- Нумерованные задания (минимум ${questionsCount || 10})
- Блок "Ответы/подсказки" в конце

Каждый блок должен быть оформлен в соответствии с требованиями по дизайну.`;

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
    const apiUrl = this.configService.get<string>('API_URL', 'http://localhost:3001');
    const callbackMap: Record<GenerationType, string> = {
      worksheet: `${apiUrl}/api/webhooks/worksheet-callback`,
      quiz: `${apiUrl}/api/webhooks/quiz-callback`,
      vocabulary: `${apiUrl}/api/webhooks/vocabulary-callback`,
      'lesson-plan': `${apiUrl}/api/webhooks/lesson-plan-callback`,
      'content-adaptation': `${apiUrl}/api/webhooks/content-callback`,
      message: `${apiUrl}/api/webhooks/message-callback`,
      feedback: `${apiUrl}/api/webhooks/feedback-callback`,
      image: `${apiUrl}/api/webhooks/image-callback`,
      photosession: `${apiUrl}/api/webhooks/image-callback`,
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
      image: 'DALL-E 3',
      photosession: 'DALL-E 2',
      presentation: 'Gamma AI',
      transcription: 'Whisper AI',
      'gigachat-chat': 'GigaChat',
      'gigachat-image': 'GigaChat-Image',
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
