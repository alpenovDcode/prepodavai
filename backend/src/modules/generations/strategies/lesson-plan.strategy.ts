import { Injectable } from '@nestjs/common';
import { GenerationStrategy, GenerationRequestParams } from '../interfaces/generation-strategy.interface';
import { DesignSystemConfig } from '../config/design-system.config';

@Injectable()
export class LessonPlanStrategy implements GenerationStrategy {
  supports(type: string): boolean {
    return ['lesson-plan', 'lesson_plan', 'lessonPreparation', 'lesson_preparation'].includes(type);
  }

  async generate(params: GenerationRequestParams): Promise<{ systemPrompt: string; userPrompt: string }> {
    const { subject, topic, level, duration, objectives, customPrompt } = params;

    const systemPrompt = `
${DesignSystemConfig.PROMPT_MODULES.SYSTEM_INTRO}
Генерируешь структурированные планы уроков в формате HTML.

${DesignSystemConfig.PROMPT_MODULES.MATHJAX_RULES}
${DesignSystemConfig.PROMPT_MODULES.CRITICAL_OUTPUT_RULES}

ВАЖНО: Документ предназначен для учителя, НЕ для ученика. Интерактивные поля ввода НЕ нужны.

СТРУКТУРА ПЛАНА:
1. Используй <table> для таблицы "Ход урока" (Этап, Время, Деятельность).
2. Четко выделяй цели и задачи.
3. Включай блок для домашнего задания.
`;

    const userPrompt = `<MAIN_TOPIC>${topic || '—'}</MAIN_TOPIC>
<SUBJECT>${subject || '—'}</SUBJECT>

🎯 ГЛАВНОЕ ПРАВИЛО ЭТОЙ ГЕНЕРАЦИИ:
ВЕСЬ контент строго и исключительно по теме <MAIN_TOPIC>${topic || '—'}</MAIN_TOPIC>.
Не уходи в смежные темы. Не подменяй тему на родственную. Не давай «общий обзор предмета».
Если параметры противоречат теме — приоритет за темой.

ПРОТОКОЛ ПЕРЕД ГЕНЕРАЦИЕЙ (выполни мысленно):
1. Сформулируй для себя 3–5 ключевых подпонятий темы «${topic || '—'}».
2. Каждый этап / активность / задание должно проходить тест: «Это про <MAIN_TOPIC>?». Если нет — переделай.

# ТВОЯ ЗАДАЧА (ГЛАВНОЕ)
Создай план урока по следующим параметрам:
Предмет: ${subject || '—'}
Тема: ${topic || '—'}  ← весь план строго по этой теме
Класс/Уровень: ${level || 'Средняя школа'}
Длительность: ${duration || 45} мин.
Цели: ${objectives || 'Сформулируй стандартные образовательные цели'}

<html_skeleton>
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>План урока — ${topic || 'Новая тема'}</title>
${DesignSystemConfig.STYLES}
${DesignSystemConfig.MATHJAX_SCRIPTS}
</head>
<body>
<div class="container">
  ${DesignSystemConfig.COMPONENTS.HEADER('План занятия')}

  <div class="meta-info">
    <p><strong>Предмет:</strong> ${subject || '—'}</p>
    <p><strong>Тема:</strong> ${topic || '—'}</p>
    <p><strong>Класс:</strong> ${level || '—'}</p>
    <p><strong>Время:</strong> ${duration || 45} мин.</p>
  </div>

  <h2>Цели и задачи</h2>
  <!-- Содержимое здесь -->

  <h2>Ход урока</h2>
  <table>
    <thead>
      <tr><th>Этап</th><th>Время</th><th>Деятельность учителя и учеников</th></tr>
    </thead>
    <tbody>
      <!-- Строки таблицы -->
    </tbody>
  </table>

  ${DesignSystemConfig.COMPONENTS.FOOTER}
</div>
</body>
</html>
</html_skeleton>

⚠️ САМОПРОВЕРКА (выполни перед выводом):
□ Для каждого этапа урока задай себе вопрос: «Это этап урока именно по теме <MAIN_TOPIC>${topic || '—'}</MAIN_TOPIC>, а не по смежной?». Если хоть один — нет, перепиши.
□ Подсчитай: сколько активностей / заданий прямо опираются на ключевые понятия темы. Должно быть ≥ 80%.
□ Если ты пишешь что-то «вообще про предмет ${subject || '—'}», а не про конкретно <MAIN_TOPIC> — остановись и перепиши.
□ Длительность урока — ${duration || 45} мин.
${customPrompt ? `ДОПОЛНИТЕЛЬНЫЕ ИНСТРУКЦИИ (выполни обязательно): ${customPrompt}` : ''}

Начинай вывод сразу с <!DOCTYPE html>.`;

    return { systemPrompt, userPrompt };
  }
}
