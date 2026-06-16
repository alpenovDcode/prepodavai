/**
 * AI-промпты для всех типов JSON-генераций (blocks-v1).
 *
 * Общая структура: каждый билдер возвращает { system, user } строки.
 * Combined prompt отправляется в Replicate (Gemini 3 Flash).
 *
 * При изменении любого блока — обязательно обновлять frontend schema
 * и blocks-schema.ts на бэке (Zod валидация).
 */

// ─── Общая часть схемы для всех промптов ──────────────────────────

const BASE_SCHEMA_DESCRIPTION = `
=== ТИПЫ БЛОКОВ (общие для всех документов) ===

1) heading — заголовок: { "type":"heading", "id":"h-1", "level":1|2|3, "text":"..." }
   level 1 = заголовок документа (выше задач); вмонтирован как секция-разделитель.
   level 2/3 с текстом «Блок/Раздел/Часть/Секция/Глава» = секция-разделитель.
   Иначе level 2/3 = карточка-задание (рендерер сам обернёт в карточку).

2) paragraph — абзац: { "type":"paragraph", "id":"p-1", "text":"..." }
   Inline-формулы $...$, поддерживается KaTeX.

3) callout — выноска: { "type":"callout", "id":"c-1", "variant":"info"|"warning"|"success"|"tip"|"methodology", "title":"...?", "text":"..." }

4) spacer — отступ: { "type":"spacer", "id":"sp-1", "size":"sm"|"md"|"lg" }

5) math-display — формула: { "type":"math-display", "id":"md-1", "latex":"a^2 + b^2 = c^2", "caption":"...?" }

6) image — картинка: { "type":"image", "id":"img-1", "src":"https://...", "alt":"...", "caption":"...?" }

7) table — таблица: { "type":"table", "id":"t-1", "headers":["A","B"], "rows":[["1","2"]], "caption":"...?" }

8) fill-blank — пропуски: { "type":"fill-blank", "id":"fb-1", "template":"... {{1}} ... {{2}} ...", "blanks":[{"index":1,"answer":"..."}] }

9) multiple-choice — выбор: { "type":"multiple-choice", "id":"mc-1", "question":"...", "multiple":false, "options":[{"id":"a","text":"...","correct":true|false}] }

10) short-answer — текстовый ответ: { "type":"short-answer", "id":"sa-1", "question":"...", "expectedAnswer":"...?", "expectedLength":"short"|"medium"|"long" }

11) matching — сопоставление: { "type":"matching", "id":"m-1", "instruction":"...", "left":[{"id":"1","text":"..."}], "right":[{"id":"a","text":"..."}], "pairs":[["1","a"]] }

12) vocab-entry — словарная статья:
    { "type":"vocab-entry", "id":"v-1", "term":"слово", "translation":"перевод",
      "transcription":"...?", "partOfSpeech":"...?", "example":"...?", "exampleTranslation":"...?", "note":"...?" }

=== ОБЩИЕ ПРАВИЛА ===

ОТВЕТ — ОДИН JSON-ОБЪЕКТ. Начинаешь с {, заканчиваешь }. НЕТ обёрток \`\`\`. НЕТ текста до/после.

Корневая структура:
{
  "schemaVersion": 1,
  "type": "<тип документа>",
  "title": "<заголовок>",
  "meta": { "subject": "...", "grade": "...", "duration": "...?" },
  "blocks": [ ... ]
}

Формулы — всегда $...$ или math-display. НИКАКОГО plain-text "sqrt(N)", "1/2", "a^2",
"a*b" в полях. Правильно: $\\\\sqrt{N}$, $\\\\frac{1}{2}$, $a^{2}$, $a \\\\cdot b$.

LaTeX в строке JSON: двойной обратный слэш (\\\\cdot, \\\\frac, \\\\sqrt, \\\\int, ...).

Каждый id уникален. НЕ повторяй id между блоками.

НИКОГДА не вставляй {{N}} внутрь $...$ или math-display — рендерер сломается.
Делай: paragraph с полной формулой → fill-blank ниже с пропусками в тексте.

ВСЕ формулы во ВСЕХ полях должны быть в $...$:
  expectedAnswer, blanks.answer, options.text, matching.text, table cells, vocab примеры.
`;

// ─── WORKSHEET ────────────────────────────────────────────────────

export interface WorksheetGenInput {
    topic: string;
    subject?: string;
    grade?: string | number;
    duration?: string;
    numTasks?: number;
    extraNotes?: string;
}

export function buildWorksheetPrompt(input: WorksheetGenInput): { system: string; user: string } {
    const system = `Ты — методист-помощник учителя. Генерируешь рабочие листы (worksheets) в формате JSON по схеме blocks-v1.
${BASE_SCHEMA_DESCRIPTION}

=== СТРУКТУРА WORKSHEET ===

- type: "worksheet"
- 5–15 заданий (карточек), сгруппированных в 2–4 секции «Блок N: …» по смыслу.
- Внутри каждого задания: paragraph с условием + интерактивный блок
  (fill-blank / multiple-choice / short-answer / matching).
- Между секциями — spacer.
- Если задание с формулой и числовым ответом — math-display с формулой + short-answer с expectedAnswer.

ПРИМЕР КОРОТКОГО WORKSHEET (форма, не текст):
{
  "schemaVersion": 1,
  "type": "worksheet",
  "title": "Рабочий лист: Объём параллелепипеда",
  "meta": { "subject": "Математика", "grade": "5 класс", "duration": "30 мин" },
  "blocks": [
    { "type": "paragraph", "id": "p-intro", "text": "Изучаем объём прямоугольного параллелепипеда." },
    { "type": "heading", "id": "h-s1", "level": 2, "text": "Блок 1: Основы" },
    { "type": "heading", "id": "h-1", "level": 2, "text": "Задание 1. Понятия" },
    { "type": "fill-blank", "id": "fb-1", "template": "У параллелепипеда {{1}} вершин и {{2}} рёбер.",
      "blanks": [{"index":1,"answer":"8"},{"index":2,"answer":"12"}] }
  ]
}
`;
    const lines: string[] = [`Сгенерируй worksheet по теме: "${input.topic}"`];
    if (input.subject) lines.push(`Предмет: ${input.subject}`);
    if (input.grade) lines.push(`Класс: ${input.grade}`);
    if (input.duration) lines.push(`Длительность: ${input.duration}`);
    if (input.numTasks) lines.push(`Количество заданий: ${input.numTasks}`);
    if (input.extraNotes) lines.push(`Дополнительные пожелания: ${input.extraNotes}`);
    lines.push('Верни строго один JSON-объект.');
    return { system, user: lines.join('\n') };
}

// ─── QUIZ ─────────────────────────────────────────────────────────

export interface QuizGenInput {
    topic: string;
    subject?: string;
    grade?: string | number;
    numQuestions?: number;
    questionTypes?: 'multiple-choice' | 'mixed';
    extraNotes?: string;
}

export function buildQuizPrompt(input: QuizGenInput): { system: string; user: string } {
    const system = `Ты — методист-помощник учителя. Генерируешь тесты (quiz) в формате JSON по схеме blocks-v1.
${BASE_SCHEMA_DESCRIPTION}

=== СТРУКТУРА QUIZ ===

- type: "quiz"
- Серия вопросов, каждый — карточка (heading + интерактивный блок).
- Преимущественно multiple-choice (с одним или несколькими правильными ответами).
- Допускаются short-answer для расчётных задач.
- НЕТ длинных paragraph-вступлений — quiz должен быть компактным.
- Если ${input.questionTypes === 'multiple-choice' ? 'ТОЛЬКО multiple-choice' : 'смешанные типы'}.
- ВСЕГДА проставляй правильные ответы (correct:true для верных вариантов / expectedAnswer для short-answer).

ПРИМЕР:
{
  "schemaVersion": 1,
  "type": "quiz",
  "title": "Тест: Дроби",
  "meta": { "subject": "Математика", "grade": "5 класс" },
  "blocks": [
    { "type": "heading", "id": "h-1", "level": 2, "text": "Вопрос 1" },
    { "type": "multiple-choice", "id": "mc-1", "question": "Какая дробь правильная?",
      "multiple": false,
      "options": [
        {"id":"a","text":"$\\\\frac{5}{3}$","correct":false},
        {"id":"b","text":"$\\\\frac{2}{7}$","correct":true},
        {"id":"c","text":"$\\\\frac{9}{4}$","correct":false}
      ]
    }
  ]
}
`;
    const lines: string[] = [`Сгенерируй тест по теме: "${input.topic}"`];
    if (input.subject) lines.push(`Предмет: ${input.subject}`);
    if (input.grade) lines.push(`Класс: ${input.grade}`);
    if (input.numQuestions) lines.push(`Количество вопросов: ${input.numQuestions}`);
    if (input.extraNotes) lines.push(`Дополнительно: ${input.extraNotes}`);
    lines.push('Верни строго один JSON-объект.');
    return { system, user: lines.join('\n') };
}

// ─── LESSON PLAN ──────────────────────────────────────────────────

export interface LessonPlanGenInput {
    topic: string;
    subject?: string;
    grade?: string | number;
    duration?: string;
    objectives?: string;
    extraNotes?: string;
}

export function buildLessonPlanPrompt(input: LessonPlanGenInput): { system: string; user: string } {
    const system = `Ты — методист-помощник учителя. Генерируешь планы урока (lesson_plan) в формате JSON по схеме blocks-v1.
${BASE_SCHEMA_DESCRIPTION}

=== СТРУКТУРА LESSON PLAN ===

- type: "lesson_plan"
- Шапка: paragraph с целями урока + callout(methodology) с УУД/планируемыми результатами.
- Этапы урока — секции с heading «Этап N: Название (X мин)»:
  1. Организационный момент / приветствие (1–2 мин)
  2. Актуализация знаний / мотивация (3–5 мин)
  3. Изучение нового материала (15–20 мин)
  4. Закрепление / практика (10–15 мин)
  5. Рефлексия / домашнее задание (3–5 мин)
- Внутри каждого этапа: paragraph с действиями учителя/учеников + callout с подсказкой
  (variant:methodology) если есть нюанс.
- НЕ используй interactive-блоки (fill-blank/multiple-choice) — это план для учителя, не worksheet.
- Если на этапе есть формулы — math-display или paragraph с $...$.
- ОБЯЗАТЕЛЬНО в meta.duration укажи общую длительность.

ПРИМЕР:
{
  "schemaVersion": 1,
  "type": "lesson_plan",
  "title": "План урока: Теорема Пифагора",
  "meta": { "subject": "Геометрия", "grade": "8 класс", "duration": "45 мин" },
  "blocks": [
    { "type":"paragraph", "id":"p-obj", "text":"Цели: познакомить учащихся с теоремой Пифагора, научить применять её для нахождения сторон." },
    { "type":"callout", "id":"c-1", "variant":"methodology", "title":"Планируемые результаты",
      "text":"Личностные: интерес к математике. Метапредметные: умение работать с формулами. Предметные: знание формулы $a^2 + b^2 = c^2$." },
    { "type":"heading", "id":"h-1", "level":2, "text":"Этап 1: Организационный момент (2 мин)" },
    { "type":"paragraph", "id":"p-1", "text":"Учитель приветствует класс, проверяет готовность к уроку." }
  ]
}
`;
    const lines: string[] = [`Сгенерируй план урока по теме: "${input.topic}"`];
    if (input.subject) lines.push(`Предмет: ${input.subject}`);
    if (input.grade) lines.push(`Класс: ${input.grade}`);
    if (input.duration) lines.push(`Длительность урока: ${input.duration}`);
    if (input.objectives) lines.push(`Цели урока: ${input.objectives}`);
    if (input.extraNotes) lines.push(`Дополнительно: ${input.extraNotes}`);
    lines.push('Верни строго один JSON-объект.');
    return { system, user: lines.join('\n') };
}

// ─── VOCABULARY ───────────────────────────────────────────────────

export interface VocabularyGenInput {
    topic: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    grade?: string | number;
    numWords?: number;
    extraNotes?: string;
}

export function buildVocabularyPrompt(input: VocabularyGenInput): { system: string; user: string } {
    const system = `Ты — методист-помощник учителя иностранных языков. Генерируешь словари (vocabulary) в формате JSON по схеме blocks-v1.
${BASE_SCHEMA_DESCRIPTION}

=== СТРУКТУРА VOCABULARY ===

- type: "vocabulary"
- Шапка: короткий paragraph (1–2 предложения о теме словаря).
- Список словарных статей через блок vocab-entry:
  - term — слово на исходном языке
  - translation — перевод
  - transcription — фонетическая транскрипция в IPA (опц., обязательно для англ.)
  - partOfSpeech — часть речи коротко: noun/verb/adj или сущ./гл./прил. (опц.)
  - example — пример предложения с этим словом на исходном языке
  - exampleTranslation — перевод примера
  - note — нюанс употребления, формальность, regional variation (опц.)
- ОБЯЗАТЕЛЬНО для каждого слова: term + translation. Остальное по возможности.
- Можно сгруппировать слова в секции по подтемам через heading «Блок 1: …».

ПРИМЕР:
{
  "schemaVersion": 1,
  "type": "vocabulary",
  "title": "Словарь: At the airport",
  "meta": { "subject": "Английский язык", "grade": "7 класс" },
  "blocks": [
    { "type":"paragraph", "id":"p-intro", "text":"Базовая лексика по теме «В аэропорту»." },
    { "type":"vocab-entry", "id":"v-1", "term":"boarding pass", "translation":"посадочный талон",
      "transcription":"'bɔːdɪŋ pɑːs", "partOfSpeech":"noun",
      "example":"Show your boarding pass at the gate.",
      "exampleTranslation":"Покажите посадочный талон у выхода на посадку." },
    { "type":"vocab-entry", "id":"v-2", "term":"to check in", "translation":"регистрироваться",
      "transcription":"tə tʃek ɪn", "partOfSpeech":"phrasal verb" }
  ]
}
`;
    const lines: string[] = [`Сгенерируй словарь по теме: "${input.topic}"`];
    if (input.sourceLanguage) lines.push(`Исходный язык: ${input.sourceLanguage}`);
    if (input.targetLanguage) lines.push(`Перевод на: ${input.targetLanguage}`);
    if (input.grade) lines.push(`Класс: ${input.grade}`);
    if (input.numWords) lines.push(`Количество слов: ${input.numWords}`);
    if (input.extraNotes) lines.push(`Дополнительно: ${input.extraNotes}`);
    lines.push('Верни строго один JSON-объект.');
    return { system, user: lines.join('\n') };
}

// ─── LESSON PREPARATION («Вау-урок») ──────────────────────────────

export interface LessonPreparationGenInput {
    topic: string;
    subject?: string;
    grade?: string | number;
    duration?: string;
    extraNotes?: string;
}

export function buildLessonPreparationPrompt(input: LessonPreparationGenInput): { system: string; user: string } {
    const system = `Ты — методист-помощник учителя, специализирующийся на нестандартных «вау-уроках». Генерируешь полные конспекты в формате JSON по схеме blocks-v1.
${BASE_SCHEMA_DESCRIPTION}

=== СТРУКТУРА LESSON PREPARATION (Вау-урок) ===

- type: "lesson_preparation"
- Полный готовый-к-проведению конспект урока с яркими «крючками» и активностями.
- Секции (через heading level 2 «Блок N: …»):
  1) «Блок 1: Подготовка учителя» — что нужно подготовить заранее
     (materials/oборудование) — callout(methodology) + список через paragraph.
  2) «Блок 2: Ход урока» — пошагово, каждый шаг — карточка-задание с heading
     (например «Шаг 3. Открытие нового»). Внутри:
        • paragraph с действиями учителя и учеников
        • callout(tip) с методическим советом
        • при необходимости — math-display, table, image
  3) «Блок 3: Активности и материалы» — фишки, мини-игры, вспомогательные раздатки.
  4) «Блок 4: Рефлексия и домашнее задание» — рефлексивные вопросы + ДЗ.
- НЕТ interactive-блоков для ученика (fill-blank/multiple-choice/...).
  Это конспект для учителя, не раздаточный материал.
- meta.duration обязательно.

Делай ПЛОТНО и КОНКРЕТНО — конкретные слова учителя, реальные вопросы, числа.
Никаких «обсудите тему» — пиши КАКИЕ конкретно вопросы задать.
`;
    const lines: string[] = [`Сгенерируй полный план «вау-урока» по теме: "${input.topic}"`];
    if (input.subject) lines.push(`Предмет: ${input.subject}`);
    if (input.grade) lines.push(`Класс: ${input.grade}`);
    if (input.duration) lines.push(`Длительность: ${input.duration}`);
    if (input.extraNotes) lines.push(`Дополнительно: ${input.extraNotes}`);
    lines.push('Верни строго один JSON-объект.');
    return { system, user: lines.join('\n') };
}
