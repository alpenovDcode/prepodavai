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
3. Обязательно в конце — раздел с ответами для учителя.
`;
    
    const userPrompt = `<MAIN_TOPIC>${topic || '—'}</MAIN_TOPIC>
<SUBJECT>${subject || '—'}</SUBJECT>

🎯 ГЛАВНОЕ ПРАВИЛО ЭТОЙ ГЕНЕРАЦИИ:
ВЕСЬ контент строго и исключительно по теме <MAIN_TOPIC>${topic || '—'}</MAIN_TOPIC>.
Не уходи в смежные темы. Не подменяй тему на родственную. Не давай «общий обзор предмета».
Если параметры противоречат теме — приоритет за темой.

ПРОТОКОЛ ПЕРЕД ГЕНЕРАЦИЕЙ (выполни мысленно):
1. Сформулируй для себя 3–5 ключевых подпонятий темы «${topic || '—'}».
2. Каждое задание должно проходить тест: «Это про <MAIN_TOPIC>?». Если нет — переделай.

# ТВОЯ ЗАДАЧА (ГЛАВНОЕ)
Создай рабочий лист по следующим параметрам:
Предмет: ${subject || '—'}
Тема: ${topic || '—'}  ← все задания строго по этой теме
Класс/Уровень: ${level || '—'}
Количество заданий: ${questionsCount || 7}

Задания должны охватывать разные аспекты темы, включать теорию и практику.

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

⚠️ САМОПРОВЕРКА (выполни перед выводом):
□ Для каждого задания задай себе вопрос: «Это задание именно по теме <MAIN_TOPIC>${topic || '—'}</MAIN_TOPIC>, а не по смежной?». Если хоть одно — нет, перепиши его.
□ Подсчитай: сколько заданий прямо опираются на ключевые понятия темы. Должно быть ≥ 80%.
□ Если ты пишешь что-то «вообще про предмет ${subject || '—'}», а не про конкретно <MAIN_TOPIC> — остановись и перепиши.
ПОЖЕЛАНИЯ ПОЛЬЗОВАТЕЛЯ (выполни обязательно): ${preferences || 'не указаны'}
${customPrompt ? `ДОПОЛНИТЕЛЬНЫЕ ИНСТРУКЦИИ: ${customPrompt}` : ''}

Начинай вывод сразу с <!DOCTYPE html>.`;

    return { systemPrompt, userPrompt };
  }
}
