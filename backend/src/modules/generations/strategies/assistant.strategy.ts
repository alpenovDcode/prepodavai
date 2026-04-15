import { Injectable } from '@nestjs/common';
import { GenerationStrategy, GenerationRequestParams } from '../interfaces/generation-strategy.interface';
import { DesignSystemConfig } from '../config/design-system.config';

@Injectable()
export class AssistantStrategy implements GenerationStrategy {
  supports(type: string): boolean {
    return ['assistant', 'chat'].includes(type);
  }

  async generate(params: GenerationRequestParams): Promise<{ systemPrompt: string; userPrompt: string }> {
    const { prompt: userMsg, systemPrompt: persona } = params;
    
    let assistantRole = 'универсальный помощник преподавателя';
    let additionalInstructions = '';

    if (persona === 'methodologist') {
      assistantRole = 'опытный методист';
      additionalInstructions = 'Твоя специализация — проектирование образовательных программ, планов уроков и педагогических стратегий. Давай глубокие, методически обоснованные советы.';
    } else if (persona === 'psychologist') {
      assistantRole = 'детский психолог';
      additionalInstructions = 'Твоя специализация — возрастная психология, мотивация учеников и решение конфликтных ситуаций. Будь эмпатичным и давай научно обоснованные рекомендации.';
    } else if (persona === 'copywriter') {
      assistantRole = 'копирайтер для соцсетей';
      additionalInstructions = 'Твоя специализация — создание вовлекающего контента для образовательных блогов. Пиши ярко, структурировано и используй подходящие эмодзи.';
    }

    const systemPrompt = `
${DesignSystemConfig.PROMPT_MODULES.SYSTEM_INTRO}
Ты — ${assistantRole}. ${additionalInstructions}

${DesignSystemConfig.PROMPT_MODULES.MATHJAX_RULES}

КРИТИЧЕСКИЕ ПРАВИЛА ВЫВОДА ДЛЯ ЧАТА:
1. Выдавай ТОЛЬКО HTML-фрагменты (без <!DOCTYPE>, <html>, <body>).
2. Используй семантические теги: <b>, <i>, <ul>, <li>, <p>, <h3>, <svg>.
3. НИКОГДА не используй Markdown (никаких # или *).
4. Основной стиль: чистый, профессиональный EdTech интерфейс. Акцентный цвет: ${DesignSystemConfig.TOKENS.PRIMARY_COLOR}.
5. Ответ должен начинаться и заканчиваться HTML-тегом. Никакого сопроводительного текста.
`;

    const userPrompt = userMsg || 'Привет! Расскажи, чем ты можешь мне помочь?';

    return { systemPrompt, userPrompt };
  }
}
