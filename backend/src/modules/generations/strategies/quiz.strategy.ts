import { Injectable } from '@nestjs/common';
import { GenerationStrategy, GenerationRequestParams } from '../interfaces/generation-strategy.interface';
import { GenerationType } from '../generations.service';
import { DesignSystemConfig } from '../config/design-system.config';

@Injectable()
export class QuizGenerationStrategy implements GenerationStrategy {
  supports(type: GenerationType): boolean {
    return type === 'quiz';
  }

  async generate(params: GenerationRequestParams): Promise<{ systemPrompt: string; userPrompt: string }> {
    const { subject, topic, level, questionsCount, answersCount, customPrompt } = params;

    const systemPrompt = `
${DesignSystemConfig.PROMPT_MODULES.SYSTEM_INTRO}
Генерируешь интерактивные квизы в формате HTML.

${DesignSystemConfig.PROMPT_MODULES.MATHJAX_RULES}
${DesignSystemConfig.PROMPT_MODULES.INTERACTIVE_RULES}
${DesignSystemConfig.PROMPT_MODULES.CRITICAL_OUTPUT_RULES}

СТРУКТУРА КВИЗА:
1. Каждое задание — в <div class="question-block">.
2. Варианты ответов — список с <label> и <input type="radio">.
3. Обязательно в конце документа — блок ответов для учителя.
`;
    
    const userPrompt = `Сгенерируй HTML-код квиза.
Вводные данные:
Предмет: ${subject || 'Общие знания'}
Тема: ${topic || 'Случайная тема'}
Уровень: ${level || 'Средний'}
Количество вопросов: ${questionsCount || 10}
Вариантов ответа в каждом: ${answersCount || 4}
${customPrompt ? `Дополнительно: ${customPrompt}` : ''}

<html_skeleton>
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Квиз — ${subject || 'Тест'}</title>
${DesignSystemConfig.STYLES}
${DesignSystemConfig.MATHJAX_SCRIPTS}
</head>
<body>
<div class="container">
  ${DesignSystemConfig.COMPONENTS.HEADER('Интерактивный квиз')}
  
  <div class="meta-info">
    <p><strong>Предмет:</strong> ${subject || '—'}</p>
    <p><strong>Тема:</strong> ${topic || '—'}</p>
    <p><strong>Уровень:</strong> ${level || '—'}</p>
  </div>

  <!-- Вопросы здесь -->
  
  <div class="teacher-answers-only">
    <h2>ОТВЕТЫ (ДЛЯ УЧИТЕЛЯ)</h2>
    <table class="answers-table">
      <tr><th>№</th><th>Верный ответ</th></tr>
      <!-- Строки ответов -->
    </table>
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
