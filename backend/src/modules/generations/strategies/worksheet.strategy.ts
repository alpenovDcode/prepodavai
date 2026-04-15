import { Injectable } from '@nestjs/common';
import { GenerationStrategy, GenerationRequestParams } from '../interfaces/generation-strategy.interface';
import { GenerationType } from '../generations.service';
import { DesignSystemConfig } from '../config/design-system.config';

@Injectable()
export class WorksheetGenerationStrategy implements GenerationStrategy {
  supports(type: GenerationType): boolean {
    return type === 'worksheet' || type === 'game_generation';
  }

  async generate(params: GenerationRequestParams): Promise<{ systemPrompt: string; userPrompt: string }> {
    const { subject, topic, level, questionsCount, preferences, customPrompt } = params;

    const systemPrompt = `
${DesignSystemConfig.PROMPT_MODULES.SYSTEM_INTRO}
Генерируешь интерактивные рабочие листы в формате HTML.

${DesignSystemConfig.PROMPT_MODULES.MATHJAX_RULES}
${DesignSystemConfig.PROMPT_MODULES.INTERACTIVE_RULES}
${DesignSystemConfig.PROMPT_MODULES.CRITICAL_OUTPUT_RULES}

СТРУКТУРА ЛИСТА:
1. Шапка и поля для ученика (Имя, Класс, Дата).
2. Блоки заданий с теорией и практикой.
3. Обязательно в конце — раздел с ответами (Teacher Answers).
`;
    
    const userPrompt = `Сгенерируй HTML-код рабочего листа.
Вводные данные:
Предмет: ${subject || '—'}
Тема: ${topic || '—'}
Класс/Уровень: ${level || '—'}
Количество заданий: ${questionsCount || 7}
Предпочтения: ${preferences || 'не указаны'}
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}

<html_skeleton>
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Рабочий лист — ${topic || 'Урок'}</title>
${DesignSystemConfig.STYLES}
${DesignSystemConfig.MATHJAX_SCRIPTS}
</head>
<body>
<div class="container">
  ${DesignSystemConfig.COMPONENTS.HEADER('Рабочий лист')}
  
  <div class="meta-info">
    <div style="display: flex; justify-content: space-between; gap: 20px;">
      <p><strong>Ученик:</strong> <input type="text" class="inline-input" style="flex: 1;"></p>
      <p><strong>Класс:</strong> <input type="text" class="inline-input" style="width: 80px;"></p>
      <p><strong>Дата:</strong> <input type="text" class="inline-input" style="width: 100px;"></p>
    </div>
    <p><strong>Раздел/Предмет:</strong> ${subject || '—'}</p>
    <p><strong>Тема занятия:</strong> ${topic || '—'}</p>
  </div>

  <!-- Содержимое листа здесь -->
  
  <div class="teacher-answers-only">
    <h2>ОТВЕТЫ (ДЛЯ УЧИТЕЛЯ)</h2>
    <!-- Ключ ответов -->
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
