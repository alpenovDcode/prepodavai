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
Твоя задача — предоставить детальную обратную связь по транскрипции видео.

${DesignSystemConfig.PROMPT_MODULES.MATHJAX_RULES}

КРИТИЧЕСКИЕ ПРАВИЛА ВЫВОДА (ЧАТ-ФРАГМЕНТ):
1. Выдавай ТОЛЬКО HTML-фрагменты (без <!DOCTYPE>, <html>, <body>).
2. Используй семантические теги: <div>, <p>, <h3>, <ul>, <li>, <b>, <svg>.
3. ДИЗАЙН: Используй чистый стиль, отступы и акценты цветом ${DesignSystemConfig.TOKENS.PRIMARY_COLOR}.
4. НИКАКОГО Markdown (без # или *).
`;

    const transcript = params.transcript || params.transcription || '';
    if (!transcript) {
      throw new Error('VideoAnalysisStrategy: отсутствует транскрипция (params.transcript)');
    }

    const userPrompt = isSales
      ? `Ты — опытный наставник для преподавателей «Прорыва». Твоя задача — дать глубокую, конструктивную и прикладную обратную связь по пробному уроку с фокусом на продажу.

ВЕРНИ ТОЛЬКО ЧИСТЫЙ HTML КОД.
* Обращайся к преподавателю строго на "Вы".
* Тон — дружелюбный, честный и поддерживающий.

СТРУКТУРА:
1. Приветствие.
2. ✅ Что получилось хорошо (Сильные стороны) с примерами.
3. ⚠️ Что не сработало или отсутствовало (Зоны роста).
4. 🚀 Что сказать и сделать иначе (Точки приложения усилий).
5. Детальный разбор по этапам (Контакт, Цели, Контент, Продажа).

Транскрипция для анализа:
${transcript}`
      : `Ваша задача — предоставить детальную обратную связь по транскрипции видео, которую предоставил студент.

ВЕРНИ ТОЛЬКО ЧИСТЫЙ HTML КОД.
* Обращайся к студенту на "Вы".
* Используй эмодзи для лучшей читаемости.

СТРУКТУРА:
1. Приветствие.
2. 🎯 Основные темы и идеи.
3. 🏗️ Структура контента.
4. 💡 Ключевые моменты.
5. 📈 Рекомендации (Что можно улучшить).
6. 📄 Краткое резюме.

Транскрипция для анализа:
${transcript}`;

    return { systemPrompt, userPrompt };
  }
}
