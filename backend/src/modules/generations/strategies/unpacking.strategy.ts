import { Injectable } from '@nestjs/common';
import { GenerationStrategy, GenerationRequestParams } from '../interfaces/generation-strategy.interface';
import { DesignSystemConfig } from '../config/design-system.config';

@Injectable()
export class UnpackingStrategy implements GenerationStrategy {
  supports(type: string): boolean {
    return type === 'unpacking';
  }

  async generate(params: GenerationRequestParams): Promise<{ systemPrompt: string; userPrompt: string }> {
    const answers = [
      `1) Что вас подтолкнуло заниматься преподаванием?: ${params.q1 || '-'}`,
      `2) Что вы делаете лучше всего?: ${params.q2 || '-'}`,
      `3) За что вам чаще всего говорят "спасибо"?: ${params.q3 || '-'}`,
      `4) Каким достижениям удивляются?: ${params.q4 || '-'}`,
      `5) Чем вы гордитесь в жизни?: ${params.q5 || '-'}`,
      `6) Какие действия вы предприняли?: ${params.q6 || '-'}`,
      `7) Что уникального было создано?: ${params.q7 || '-'}`,
      `8) С какими учениками нравится заниматься?: ${params.q8 || '-'}`,
      `9) Почему именно с ними?: ${params.q9 || '-'}`,
      `10) Кому дадите самый быстрый результат?: ${params.q10 || '-'}`,
      `11) Какие качества влияют на работу?: ${params.q11 || '-'}`,
      `12) Ошибки и выводы: ${params.q12 || '-'}`,
      `13) 3 аспекта вдохновения: ${params.q13 || '-'}`,
    ].join('\n');

    const systemPrompt = `
${DesignSystemConfig.PROMPT_MODULES.SYSTEM_INTRO}
Генерируешь документ "Распаковка личности и экспертности" в формате HTML.

${DesignSystemConfig.PROMPT_MODULES.MATHJAX_RULES}
${DesignSystemConfig.PROMPT_MODULES.CRITICAL_OUTPUT_RULES}

ВАЖНО: Документ — аналитический отчёт для эксперта. Интерактивные поля ввода НЕ нужны.

СТРУКТУРА ОТЧЕТА:
1. История героя (Storytelling).
2. Миссия и ценности.
3. Профиль идеального ученика.
4. Продуктовая линейка (Tripwire, Core, VIP).
`;

    const userPrompt = `Проведи распаковку эксперта на основе ответов:\n\n${answers}\n\n${params.customPrompt ? `Дополнительно: ${params.customPrompt}` : ''}

<html_skeleton>
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Стратегия Личного Бренда</title>
${DesignSystemConfig.STYLES}
${DesignSystemConfig.MATHJAX_SCRIPTS}
</head>
<body>
<div class="container">
  ${DesignSystemConfig.COMPONENTS.HEADER('Распаковка и Стратегия')}
  
  <div class="meta-info">
    <p>Отчет сформирован на основе глубокого анализа вашей экспертности.</p>
  </div>

  <!-- Блоки стратегии здесь -->

  ${DesignSystemConfig.COMPONENTS.FOOTER}
</div>
</body>
</html>
</html_skeleton>

Начинай вывод сразу с <!DOCTYPE html>.`;

    return { systemPrompt, userPrompt };
  }
}
