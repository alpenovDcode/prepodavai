import { Injectable } from '@nestjs/common';
import { GenerationStrategy, GenerationRequestParams } from '../interfaces/generation-strategy.interface';
import { DesignSystemConfig } from '../config/design-system.config';

@Injectable()
export class VideoAnalysisStrategy implements GenerationStrategy {
  supports(type: string): boolean {
    return [
      'video-analysis',
      'video_analysis',
      'sales-advisor',
      'sales_advisor',
    ].includes(type);
  }

  async generate(params: GenerationRequestParams): Promise<{ systemPrompt: string; userPrompt: string }> {
    const { analysisType } = params;
    const isSales = analysisType === 'sales' || params.type === 'sales-advisor' || params.type === 'sales_advisor';

    const systemPrompt = `
${DesignSystemConfig.PROMPT_MODULES.SYSTEM_INTRO}
Ты — ${isSales ? 'Эксперт по продажам и Наставник' : 'Дружелюбный Наставник'}.
Твоя задача — предоставить детальную обратную связь по расшифровке видео.

${DesignSystemConfig.PROMPT_MODULES.MATHJAX_RULES}

КРИТИЧЕСКИЕ ПРАВИЛА ВЫВОДА (ФРАГМЕНТ ДЛЯ ВСТАВКИ):
1. Выдавай ТОЛЬКО HTML-фрагмент (без <!DOCTYPE>, <html>, <head>, <body>).
2. Используй семантические теги: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>.
3. Для акцентных блоков применяй .callout и .meta-info — эти классы уже есть в обёртке.
4. НИКАКИХ inline-стилей, НИКАКОГО Markdown (без # или *).
5. Никаких сопроводительных слов до/после HTML.
`;

    const transcript = params.transcript || params.transcription || '';
    if (!transcript) {
      throw new Error('VideoAnalysisStrategy: отсутствует расшифровка (params.transcript)');
    }

    const userPrompt = isSales
      ? `Ты — опытный наставник для преподавателей «Прорыва». Твоя задача — дать глубокую, конструктивную и прикладную обратную связь по пробному уроку с акцентом на продажу.

ВЕРНИ ТОЛЬКО HTML-ФРАГМЕНТ (без <!DOCTYPE>/<html>/<body>).
* Обращайся к преподавателю строго на "Вы".
* Тон — дружелюбный, честный и поддерживающий.

СТРУКТУРА:
1. <p> с приветствием.
2. <h2>✅ Что получилось хорошо</h2> + <ul> с примерами.
3. <h2>⚠️ Точки роста</h2> + <ul>.
4. <h2>🚀 Что сказать и сделать иначе</h2> + <ul> или <div class="callout">.
5. <h2>📊 Детальный разбор по этапам</h2> — подзаголовки <h3>: «Контакт», «Цели», «Содержание», «Продажа».

Расшифровка для анализа:
${transcript}`
      : `Ваша задача — предоставить детальную обратную связь по расшифровке видео.

ВЕРНИ ТОЛЬКО HTML-ФРАГМЕНТ (без <!DOCTYPE>/<html>/<body>).
* Обращайся к слушателю на "Вы".
* Используй эмодзи в заголовках для лучшей читаемости.

СТРУКТУРА:
1. <p> с приветствием.
2. <h2>🎯 Основные темы и идеи</h2> + <ul>.
3. <h2>🏗️ Структура материала</h2> + <p> / <ol>.
4. <h2>💡 Ключевые моменты</h2> + <ul> или <div class="callout">.
5. <h2>📈 Рекомендации</h2> + <ul>.
6. <h2>📄 Краткий итог</h2> + <p>.

Расшифровка для анализа:
${transcript}`;

    return { systemPrompt, userPrompt };
  }
}
