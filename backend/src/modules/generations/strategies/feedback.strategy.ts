import { Injectable } from '@nestjs/common';
import { GenerationStrategy, GenerationRequestParams } from '../interfaces/generation-strategy.interface';
import { DesignSystemConfig } from '../config/design-system.config';

@Injectable()
export class FeedbackStrategy implements GenerationStrategy {
  supports(type: string): boolean {
    return type === 'feedback';
  }

  async generate(params: GenerationRequestParams): Promise<{ systemPrompt: string; userPrompt: string }> {
    const { studentWork, taskType, criteria, level, customPrompt } = params;

    const systemPrompt = `
${DesignSystemConfig.PROMPT_MODULES.SYSTEM_INTRO}
Генерируешь развёрнутый методический разбор работы ученика в формате HTML.

${DesignSystemConfig.PROMPT_MODULES.MATHJAX_RULES}
${DesignSystemConfig.PROMPT_MODULES.CRITICAL_OUTPUT_RULES}

ВАЖНО: Документ предназначен для учителя, НЕ для ученика. Интерактивные поля ввода НЕ нужны.

СТРУКТУРА РАЗБОРА:
1. Оценка и общее впечатление.
2. Сильные стороны и точки роста.
3. Конкретные рекомендации по улучшению.
`;

    const userPrompt = `Дай развёрнутую обратную связь по работе ученика.
Вводные данные:
Тип задания: ${taskType || 'общее'}
Уровень: ${level || 'средний'}
${criteria ? `Критерии оценивания: ${criteria}` : ''}
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}

Текст работы:
${studentWork || '-'}

<html_skeleton>
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Разбор работы</title>
${DesignSystemConfig.STYLES}
${DesignSystemConfig.MATHJAX_SCRIPTS}
</head>
<body>
<div class="container">
  ${DesignSystemConfig.COMPONENTS.HEADER('Развёрнутая обратная связь')}

  <div class="meta-info">
    <p><strong>Тип задания:</strong> ${taskType || '—'}</p>
    <p><strong>Уровень:</strong> ${level || '—'}</p>
  </div>

  <div class="feedback-content">
    <!-- Текст разбора здесь -->
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
