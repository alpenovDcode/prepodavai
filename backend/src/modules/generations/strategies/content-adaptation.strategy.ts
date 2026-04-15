import { Injectable } from '@nestjs/common';
import { GenerationStrategy, GenerationRequestParams } from '../interfaces/generation-strategy.interface';
import { DesignSystemConfig } from '../config/design-system.config';

@Injectable()
export class ContentAdaptationStrategy implements GenerationStrategy {
  supports(type: string): boolean {
    return [
      'content-adaptation',
      'content_adaptation',
    ].includes(type);
  }

  async generate(params: GenerationRequestParams): Promise<{ systemPrompt: string; userPrompt: string }> {
    const { text, action, level, customPrompt } = params;

    const systemPrompt = `
${DesignSystemConfig.PROMPT_MODULES.SYSTEM_INTRO}
Генерируешь адаптированные учебные материалы в формате HTML.

${DesignSystemConfig.PROMPT_MODULES.MATHJAX_RULES}
${DesignSystemConfig.PROMPT_MODULES.INTERACTIVE_RULES}
${DesignSystemConfig.PROMPT_MODULES.CRITICAL_OUTPUT_RULES}

ЗАДАЧА:
Адаптируй исходный текст в соответствии с запросом (упрощение, усложнение, пересказ) и оформи его в чистый HTML.
`;

    const userPrompt = `Адаптируй текст для уровня: ${level || 'заданного'}.
Действие: ${action || 'обработка'}.
Текст:
${text || ''}
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}

<html_skeleton>
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Адаптация контента</title>
${DesignSystemConfig.STYLES}
${DesignSystemConfig.MATHJAX_SCRIPTS}
</head>
<body>
<div class="container">
  ${DesignSystemConfig.COMPONENTS.HEADER('Адаптированный материал')}
  
  <div class="meta-info">
    <p><strong>Действие:</strong> ${action || 'Адаптация'}</p>
    <p><strong>Уровень:</strong> ${level || '—'}</p>
  </div>

  <div class="adapted-content">
    <!-- Адаптированный текст здесь -->
  </div>

  ${DesignSystemConfig.COMPONENTS.FOOTER}
</div>
</body>
</html>
</html_skeleton>

Начинай вывод сразу с <!DOCTYPE html>.`;

    return { systemPrompt, userPrompt };
  }
}
