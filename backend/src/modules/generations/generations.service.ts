import { Injectable, BadRequestException, NotFoundException, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GenerationHelpersService } from './generation-helpers.service';
import { GenerationQueueService } from './generation-queue.service';
import { SubscriptionsService, OperationType } from '../subscriptions/subscriptions.service';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { GigachatService } from '../gigachat/gigachat.service';
import { HtmlPostprocessorService } from '../../common/services/html-postprocessor.service';

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
    private htmlPostprocessor: HtmlPostprocessorService,
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
  ) {
    try {
      // Все текстовые генерации обрабатываем через единый метод
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
      max_tokens: 3000, // Увеличиваем лимит для больших документов
    })) as any;

    const content = response?.choices?.[0]?.message?.content;
    console.log(`[GenerationsService] Received response from GigaChat, content length: ${content?.length || 0}`);

    if (!content) {
      throw new BadRequestException('GigaChat вернул пустой результат');
    }

    // Postprocess HTML to ensure MathJax is included if formulas are present
    console.log(`[GenerationsService] Starting HTML postprocessing for ${generationType}`);
    const processedContent = this.htmlPostprocessor.ensureMathJaxScript(content);
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

    const systemPrompt = `Ты профессиональный помощник. Твоя задача: Сгенерировать полноценный HTML-документ с профессиональной, строгой версткой. Ответ должен быть ПОЛНЫМ: не допускай сокращений, пропусков, многоточий вида "...". Если материала много, выводи всё целиком в одном HTML без обрезки.

ТРЕБОВАНИЯ К ДИЗАЙНУ (СТРОГИЙ МИНИМАЛИЗМ):
1. Типографика: Используй чистые шрифты (Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif). Основной цвет текста — темно-серый (#1a1a1a), фон — белый (#ffffff).
2. Структура: Контейнер max-width: 750px, центрирование, padding: 40px 20px.
3. Стилизация блоков:
   - Откажись от теней (box-shadow) в пользу тонких границ (border: 1px solid #e5e5e5).
   - Используй минимальное скругление углов (border-radius: 4px) или прямые углы.
   - Заголовки должны быть контрастными и иметь четкие отступы.
   - Код и цитаты оформляй на светло-сером фоне (#f7f7f7) с моноширинным шрифтом.
4. Адаптивность: Полная поддержка мобильных устройств, отступы должны масштабироваться.

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
