import { Injectable } from '@nestjs/common';
import { GenerationStrategy, GenerationRequestParams } from '../interfaces/generation-strategy.interface';
import { DesignSystemConfig } from '../config/design-system.config';

@Injectable()
export class MessageStrategy implements GenerationStrategy {
  supports(type: string): boolean {
    return type === 'message';
  }

  async generate(params: GenerationRequestParams): Promise<{ systemPrompt: string; userPrompt: string }> {
    const { formData, customPrompt } = params;

    const systemPrompt = `
${DesignSystemConfig.PROMPT_MODULES.SYSTEM_INTRO}
Генерируешь профессиональные сообщения для родителей и учеников в формате HTML.

${DesignSystemConfig.PROMPT_MODULES.MATHJAX_RULES}
${DesignSystemConfig.PROMPT_MODULES.INTERACTIVE_RULES}
${DesignSystemConfig.PROMPT_MODULES.CRITICAL_OUTPUT_RULES}
`;

    const userPrompt = `# ТВОЯ ЗАДАЧА (ГЛАВНОЕ)
Создай профессиональное сообщение на основе данных ниже.
Внимательно прочитай все поля и отрази их содержание в тексте сообщения.

<form_data>
${JSON.stringify(formData || {}, null, 2)}
</form_data>

<html_skeleton>
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Сообщение</title>
${DesignSystemConfig.STYLES}
${DesignSystemConfig.MATHJAX_SCRIPTS}
</head>
<body>
<div class="container">
  ${DesignSystemConfig.COMPONENTS.HEADER('Информационное сообщение')}

  <div class="message-content">
    <!-- Текст сообщения здесь -->
  </div>

  ${DesignSystemConfig.COMPONENTS.FOOTER}
</div>
</body>
</html>
</html_skeleton>

⚠️ ПРОВЕРЬ ПЕРЕД ВЫВОДОМ: все данные из form_data отражены в тексте сообщения.
${customPrompt ? `ДОПОЛНИТЕЛЬНЫЕ ИНСТРУКЦИИ (выполни обязательно): ${customPrompt}` : ''}

Начинай вывод сразу с <!DOCTYPE html>.`;

    return { systemPrompt, userPrompt };
  }
}
