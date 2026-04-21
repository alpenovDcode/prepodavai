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
Генерируешь тесты с выбором одного правильного ответа в формате HTML.

${DesignSystemConfig.PROMPT_MODULES.MATHJAX_RULES}
${DesignSystemConfig.PROMPT_MODULES.CRITICAL_OUTPUT_RULES}

СТРОГИЕ ПРАВИЛА СТРУКТУРЫ ТЕСТА:
1. Каждый вопрос — в <div class="question-block">.
2. Текст вопроса — в <p class="question-text">.
3. Варианты ответа — ИСКЛЮЧИТЕЛЬНО <input type="radio"> с <label>. Ровно ${answersCount || 4} варианта на вопрос.
4. ЗАПРЕЩЕНО добавлять любые поля для ввода текста: input[type=text], textarea, поля для записи ответа.
5. ЗАПРЕЩЕНО добавлять поля типа "впишите ответ", "ваш ответ", открытые вопросы.
6. Каждый вопрос имеет РОВНО ОДИН правильный ответ.
7. Варианты ответов нумеруются: А, Б, В, Г (или А, Б, В, Г, Д если 5 вариантов).
8. В конце — блок ответов для учителя (таблица).
`;

    const userPrompt = `# ТВОЯ ЗАДАЧА (ГЛАВНОЕ)
Создай тест с выбором одного варианта ответа:
Предмет: ${subject || 'Общие знания'}
Тема: ${topic || 'Случайная тема'}  ← все вопросы строго по этой теме
Уровень сложности: ${level || 'Средний'}
Количество вопросов: ${questionsCount || 10}
Вариантов ответа в каждом вопросе: ${answersCount || 4}

ТРЕБОВАНИЯ К СОДЕРЖАНИЮ:
- Все вопросы — закрытые (только выбор одного из вариантов).
- Вопросы охватывают разные аспекты темы «${topic || 'указанной темы'}».
- Дистракторы (неправильные варианты) — правдоподобные.
- Уровень сложности строго соответствует заданному параметру.

<html_skeleton>
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Тест — ${subject || 'Тест'}: ${topic || ''}</title>
${DesignSystemConfig.STYLES}
<style>
  .question-block { margin-bottom: 28px; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fafafa; }
  .question-text { font-weight: 600; margin-bottom: 14px; font-size: 15px; color: #111827; }
  .question-number { display: inline-block; background: #4f46e5; color: white; border-radius: 50%; width: 26px; height: 26px; text-align: center; line-height: 26px; font-size: 13px; font-weight: 700; margin-right: 8px; flex-shrink: 0; }
  .options-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .option-item label { display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 8px 12px; border-radius: 6px; border: 1px solid #e5e7eb; background: white; transition: background 0.15s; font-size: 14px; }
  .option-item label:hover { background: #f0f0ff; border-color: #a5b4fc; }
  .option-item input[type="radio"] { accent-color: #4f46e5; width: 16px; height: 16px; flex-shrink: 0; }
  .option-letter { font-weight: 600; color: #4f46e5; min-width: 18px; }
  .answers-table th { background: #fef2f2; }
  .answers-table td:first-child { font-weight: 600; text-align: center; }
  .answers-table td:last-child { font-weight: 600; color: #16a34a; }
</style>
${DesignSystemConfig.MATHJAX_SCRIPTS}
</head>
<body>
<div class="container">
  ${DesignSystemConfig.COMPONENTS.HEADER(`Тест: ${topic || subject || 'Тест'}`)}

  <div class="meta-info">
    <p><strong>Предмет:</strong> ${subject || '—'} &nbsp;|&nbsp; <strong>Тема:</strong> ${topic || '—'} &nbsp;|&nbsp; <strong>Уровень:</strong> ${level || '—'} &nbsp;|&nbsp; <strong>Вопросов:</strong> ${questionsCount || 10}</p>
  </div>

  <!-- ВОПРОСЫ: каждый question-block содержит question-text и options-list с radio-кнопками -->

  <div class="teacher-answers-only">
    <h2>ОТВЕТЫ (ДЛЯ УЧИТЕЛЯ)</h2>
    <table class="answers-table">
      <thead><tr><th>№</th><th>Правильный ответ</th></tr></thead>
      <tbody>
        <!-- строки ответов -->
      </tbody>
    </table>
  </div>

  ${DesignSystemConfig.COMPONENTS.FOOTER}
</div>
</body>
</html>
</html_skeleton>

⚠️ ПРОВЕРЬ ПЕРЕД ВЫВОДОМ: все вопросы строго по теме «${topic || '—'}», предмет «${subject || '—'}».
${customPrompt ? `ДОПОЛНИТЕЛЬНЫЕ ИНСТРУКЦИИ (выполни обязательно): ${customPrompt}` : ''}

Начинай вывод сразу с <!DOCTYPE html>.`;

    return { systemPrompt, userPrompt };
  }
}
