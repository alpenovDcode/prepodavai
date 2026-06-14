import { Injectable } from '@nestjs/common';
import { GenerationStrategy, GenerationRequestParams } from '../interfaces/generation-strategy.interface';
import { DesignSystemConfig } from '../config/design-system.config';

@Injectable()
export class VocabularyStrategy implements GenerationStrategy {
  supports(type: string): boolean {
    return type === 'vocabulary';
  }

  async generate(params: GenerationRequestParams): Promise<{ systemPrompt: string; userPrompt: string }> {
    const {
      subject,
      topic,
      language,
      wordsCount,
      level,
      customPrompt,
      transcription,
      exampleSentence,
      antonymsSynonyms,
    } = params as GenerationRequestParams & {
      transcription?: boolean;
      exampleSentence?: boolean;
      antonymsSynonyms?: boolean;
    };

    const languageNames: Record<string, string> = {
      en: 'английский',
      de: 'немецкий',
      fr: 'французский',
      es: 'испанский',
      it: 'итальянский',
      ru: 'русский',
      zh: 'китайский',
      ja: 'японский',
      ko: 'корейский',
      ar: 'арабский',
      pt: 'португальский',
      hi: 'хинди',
      tr: 'турецкий',
      vi: 'вьетнамский',
      pl: 'польский',
      he: 'иврит',
    };
    const langName = languageNames[language || ''] || language || 'не указан';

    const wantTranscription = transcription !== false;
    const wantExample = exampleSentence !== false;
    const wantSynAnt = antonymsSynonyms === true;

    const columnsList = [
      'Слово (на языке изучения)',
      'Перевод (на русский)',
      wantTranscription ? 'Транскрипция (IPA в квадратных скобках)' : null,
      wantExample ? 'Пример в предложении (на языке изучения + перевод)' : null,
      wantSynAnt ? 'Синонимы и антонимы (2–3 шт. с пометками син./ант.)' : null,
    ].filter(Boolean) as string[];

    const optionsBlock = `
ВКЛЮЧИ ДЛЯ КАЖДОГО СЛОВА:
${columnsList.map((c, i) => `${i + 1}. ${c}`).join('\n')}

НЕ ДОБАВЛЯЙ ПОЛЯ, КОТОРЫХ НЕТ В СПИСКЕ ВЫШЕ.
${!wantTranscription ? '⚠️ Транскрипцию НЕ выводить (поле выключено пользователем).' : ''}
${!wantExample ? '⚠️ Примеры в предложениях НЕ выводить (поле выключено).' : ''}
${!wantSynAnt ? '⚠️ Синонимы/антонимы НЕ выводить (поле выключено).' : ''}`;

    const systemPrompt = `
${DesignSystemConfig.PROMPT_MODULES.SYSTEM_INTRO}
Генерируешь интерактивные словари и глоссарии в формате HTML.

${DesignSystemConfig.PROMPT_MODULES.MATHJAX_RULES}
${DesignSystemConfig.PROMPT_MODULES.INTERACTIVE_RULES}
${DesignSystemConfig.PROMPT_MODULES.CRITICAL_OUTPUT_RULES}

СТРУКТУРА СЛОВАРЯ:
1. Используй <table> с колонками строго по списку полей, указанному в задаче.
2. Колонки таблицы должны соответствовать выбранным пользователем полям — не больше и не меньше.
3. Добавляй раздел с упражнениями в конце.
`;

    const userPrompt = `<MAIN_TOPIC>${topic}</MAIN_TOPIC>
<SUBJECT>${subject || '—'}</SUBJECT>
<LANGUAGE>${langName}</LANGUAGE>
<LEVEL>${level || 'базовый'}</LEVEL>

🎯 ГЛАВНОЕ ПРАВИЛО ЭТОЙ ГЕНЕРАЦИИ:
ВЕСЬ контент строго и исключительно по теме <MAIN_TOPIC>${topic}</MAIN_TOPIC>.
Не уходи в смежные темы. Не подменяй тему на родственную. Не давай «общую лексику предмета».
Если параметры противоречат теме — приоритет за темой.

ПРОТОКОЛ ПЕРЕД ГЕНЕРАЦИЕЙ (выполни мысленно):
1. Сформулируй для себя 3–5 ключевых подпонятий темы «${topic}».
2. Каждое слово / термин должно проходить тест: «Это слово про <MAIN_TOPIC>?». Если нет — замени.
3. Подбирай лексику строго под уровень CEFR ${level || 'A2'} — не сложнее и не проще.

# ТВОЯ ЗАДАЧА (ГЛАВНОЕ)
Создай словарь/глоссарий по следующим параметрам:
Тема: ${topic}  ← все слова строго по этой теме
Предмет: ${subject || '—'}
Язык: ${langName}
Уровень: ${level || 'A2'} (CEFR)
Количество слов: ${wordsCount || 15}

${optionsBlock}

В конце добавь упражнения на закрепление (3–5 заданий: вставить слово, сопоставить, перевести).

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
    <p><strong>Уровень:</strong> ${level || 'A2'}</p>
  </div>

  <h2>Список терминов</h2>
  <!-- Таблица со словами здесь. Колонки строго по списку выше. -->

  <h2>Упражнения на закрепление</h2>
  <!-- Упражнения с input полями здесь -->

  ${DesignSystemConfig.COMPONENTS.FOOTER}
</div>
</body>
</html>
</html_skeleton>

⚠️ САМОПРОВЕРКА (выполни перед выводом):
□ Для каждого слова: «Это слово относится именно к теме <MAIN_TOPIC>${topic}</MAIN_TOPIC>?». Если нет — замени.
□ Подсчитай: сколько слов прямо связаны с ключевыми понятиями темы. Должно быть ≥ 80%.
□ Колонки таблицы соответствуют выбранным полям (${columnsList.length} штук).
□ Уровень сложности слов соответствует ${level || 'A2'}.
□ Язык изучения: ${langName}. Не подменяй язык.
${customPrompt ? `ДОПОЛНИТЕЛЬНЫЕ ИНСТРУКЦИИ (выполни обязательно): ${customPrompt}` : ''}

Начинай вывод сразу с <!DOCTYPE html>.`;

    return { systemPrompt, userPrompt };
  }
}
