import { Injectable } from '@nestjs/common';
import { GenerationStrategy, GenerationRequestParams } from '../interfaces/generation-strategy.interface';
import { DesignSystemConfig } from '../config/design-system.config';

@Injectable()
export class VocabularyStrategy implements GenerationStrategy {
  supports(type: string): boolean {
    return type === 'vocabulary';
  }

  async generate(params: GenerationRequestParams): Promise<{ systemPrompt: string; userPrompt: string }> {
    const { subject, topic, language, wordsCount, level, customPrompt } = params;
    const languageNames: Record<string, string> = {
      en: 'английский',
      de: 'немецкий',
      fr: 'французский',
      es: 'испанский',
      it: 'итальянский',
      ru: 'русский',
    };
    const langName = languageNames[language || ''] || language || 'не указан';

    const systemPrompt = `
${DesignSystemConfig.PROMPT_MODULES.SYSTEM_INTRO}
Генерируешь интерактивные словари и глоссарии в формате HTML.

${DesignSystemConfig.PROMPT_MODULES.MATHJAX_RULES}
${DesignSystemConfig.PROMPT_MODULES.INTERACTIVE_RULES}
${DesignSystemConfig.PROMPT_MODULES.CRITICAL_OUTPUT_RULES}

СТРУКТУРА СЛОВАРЯ:
1. Используй <table> или список определений для терминов.
2. Для каждого термина: Слово -> Транскрипция -> Перевод -> Определение -> Пример.
3. Добавляй раздел с упражнениями в конце.
`;

    const userPrompt = `<MAIN_TOPIC>${topic}</MAIN_TOPIC>
<SUBJECT>${subject || '—'}</SUBJECT>
<LANGUAGE>${langName}</LANGUAGE>

🎯 ГЛАВНОЕ ПРАВИЛО ЭТОЙ ГЕНЕРАЦИИ:
ВЕСЬ контент строго и исключительно по теме <MAIN_TOPIC>${topic}</MAIN_TOPIC>.
Не уходи в смежные темы. Не подменяй тему на родственную. Не давай «общую лексику предмета».
Если параметры противоречат теме — приоритет за темой.

ПРОТОКОЛ ПЕРЕД ГЕНЕРАЦИЕЙ (выполни мысленно):
1. Сформулируй для себя 3–5 ключевых подпонятий темы «${topic}».
2. Каждое слово / термин должно проходить тест: «Это слово про <MAIN_TOPIC>?». Если нет — замени.

# ТВОЯ ЗАДАЧА (ГЛАВНОЕ)
Создай словарь/глоссарий по следующим параметрам:
Тема: ${topic}  ← все слова строго по этой теме
Предмет: ${subject || '—'}
Язык: ${langName}
Уровень: ${level || 'базовый'}
Количество слов: ${wordsCount || 20}

Для каждого термина: слово → транскрипция → перевод → определение → пример использования.
В конце добавь упражнения на закрепление.

<html_skeleton>
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Словарь — ${topic || 'Новые слова'}</title>
${DesignSystemConfig.STYLES}
${DesignSystemConfig.MATHJAX_SCRIPTS}
</head>
<body>
<div class="container">
  ${DesignSystemConfig.COMPONENTS.HEADER('Словарь и Глоссарий')}

  <div class="meta-info">
    <p><strong>Тема:</strong> ${topic || '—'}</p>
    <p><strong>Язык:</strong> ${langName}</p>
    <p><strong>Уровень:</strong> ${level || '—'}</p>
  </div>

  <h2>Список терминов</h2>
  <!-- Содержимое здесь -->

  <h2>Упражнения на закрепление</h2>
  <!-- Упражнения с input полями здесь -->

  ${DesignSystemConfig.COMPONENTS.FOOTER}
</div>
</body>
</html>
</html_skeleton>

⚠️ САМОПРОВЕРКА (выполни перед выводом):
□ Для каждого слова / термина задай себе вопрос: «Это слово относится именно к теме <MAIN_TOPIC>${topic}</MAIN_TOPIC>, а не к смежной?». Если хоть одно — нет, замени.
□ Подсчитай: сколько слов прямо связаны с ключевыми понятиями темы. Должно быть ≥ 80%.
□ Язык изучения: ${langName}. Не подменяй язык.
□ Если ты пишешь общую лексику предмета «${subject || '—'}», а не лексику по <MAIN_TOPIC> — остановись и перепиши.
${customPrompt ? `ДОПОЛНИТЕЛЬНЫЕ ИНСТРУКЦИИ (выполни обязательно): ${customPrompt}` : ''}

Начинай вывод сразу с <!DOCTYPE html>.`;

    return { systemPrompt, userPrompt };
  }
}
