/**
 * AI-промпты для всех типов JSON-генераций (blocks-v1).
 *
 * Общая структура: каждый билдер возвращает { system, user } строки.
 * Combined prompt отправляется в Replicate (Gemini 3 Flash).
 *
 * При изменении любого блока — обязательно обновлять frontend schema
 * и blocks-schema.ts на бэке (Zod валидация).
 */

import { subjectLanguageDirective } from '../utils/subject-language.util';

// ─── Общая часть схемы для всех промптов ──────────────────────────

const BASE_SCHEMA_DESCRIPTION = `
=== ОБЯЗАТЕЛЬНЫЙ ФОРМАТ ОТВЕТА ===

Возвращаешь ОДИН JSON-объект и БОЛЬШЕ НИЧЕГО.
- Начинаешь с открывающей фигурной скобки {, заканчиваешь закрывающей }.
- Никаких \`\`\`json\`\`\`. Никакого вступительного текста. Никаких комментариев в JSON.
- Перед { и после } не должно быть НИ ОДНОГО символа кроме whitespace.

Корневая структура:
{
  "schemaVersion": 1,
  "type": "<тип документа>",
  "title": "<заголовок>",
  "meta": { "subject": "...", "grade": "...", "duration": "...?" },
  "blocks": [ ... массив блоков ... ]
}

=== ТИПЫ БЛОКОВ ===

1) heading — заголовок:
   { "type":"heading", "id":"h-1", "level":1|2|3, "text":"..." }
   level 1 ИЛИ heading с текстом «Блок/Раздел/Часть/Секция/Глава» = секция-разделитель.
   Иначе level 2/3 = карточка-задание (рендерер автоматически обернёт в карточку).

2) paragraph — абзац (inline-формулы $...$ поддерживаются):
   { "type":"paragraph", "id":"p-1", "text":"..." }

3) callout — выноска:
   { "type":"callout", "id":"c-1", "variant":"info"|"warning"|"success"|"tip"|"methodology",
     "title":"...?", "text":"..." }

4) spacer — пустой отступ (sm/md/lg):
   { "type":"spacer", "id":"sp-1", "size":"md" }

5) math-display — отдельная display-формула:
   { "type":"math-display", "id":"md-1", "latex":"a^2 + b^2 = c^2", "caption":"...?" }
   ⚠️ Поле latex ОБЯЗАНО содержать реальную формулу и НЕ быть пустым.
   Используй math-display ТОЛЬКО когда есть настоящая формула. Для гуманитарных
   предметов (языки, литература, история, обществознание) формулы обычно НЕ нужны —
   тогда НЕ создавай блок math-display вообще.

6) image — картинка (только если у тебя ЕСТЬ реальный URL):
   { "type":"image", "id":"img-1", "src":"https://...", "alt":"...", "caption":"...?" }

7) table — таблица:
   { "type":"table", "id":"t-1", "headers":["A","B"], "rows":[["1","2"]], "caption":"...?" }

8) fill-blank — пропуски ({{N}} в template):
   { "type":"fill-blank", "id":"fb-1",
     "template":"Пример: длина = {{1}}, ширина = {{2}}.",
     "blanks":[{"index":1,"answer":"10"},{"index":2,"answer":"5"}] }

9) multiple-choice — выбор:
   { "type":"multiple-choice", "id":"mc-1", "question":"...", "multiple":false,
     "options":[{"id":"a","text":"...","correct":true},{"id":"b","text":"...","correct":false}] }

10) short-answer — текстовый ответ:
    { "type":"short-answer", "id":"sa-1", "question":"...",
      "expectedAnswer":"...?", "expectedLength":"short"|"medium"|"long" }

11) matching — сопоставление:
    { "type":"matching", "id":"m-1", "instruction":"...",
      "left":[{"id":"1","text":"..."}, {"id":"2","text":"..."}],
      "right":[{"id":"a","text":"..."}, {"id":"b","text":"..."}],
      "pairs":[["1","a"],["2","b"]] }

12) vocab-entry — словарная статья (для словаря):
    { "type":"vocab-entry", "id":"v-1",
      "term":"слово", "translation":"перевод",
      "transcription":"...?", "partOfSpeech":"...?",
      "example":"...?", "exampleTranslation":"...?", "note":"...?" }

=== ОБЩИЕ ПРАВИЛА (нарушение — испорченная вёрстка) ===

#### 1. ID БЛОКОВ
- Все id — короткие латинские слаги: h-1, p-2, fb-3, mc-1, sa-1, m-1, v-1.
- ID УНИКАЛЬНЫ во всём документе.
- НЕ дублируй id (один h-1 на весь документ).

#### 2. ФОРМУЛЫ — ВСЕ В \\$...\\$, НИКОГДА PLAIN TEXT

Plain-text математика рендерится как обычный текст и выглядит уродливо.
ВСЁ что является математикой — оборачиваешь в \\$...\\$ с LaTeX-командами.

Поля где это особенно критично:
  • expectedAnswer (short-answer)
  • answer в blanks (fill-blank)
  • text в options (multiple-choice)
  • text в left/right (matching)
  • cells в table
  • paragraph / heading / callout text — везде где есть числа/символы математики

Преобразование plain → LaTeX:
  BAD                       GOOD
  sqrt(27)             →    $\\\\sqrt{27}$
  sqrt(2)/2            →    $\\\\frac{\\\\sqrt{2}}{2}$
  3*sqrt(3)            →    $3\\\\sqrt{3}$
  a*b                  →    $a \\\\cdot b$
  a^2 (одна цифра)     →    $a^2$
  x_1 (одна цифра)     →    $x_1$
  a^{10}               →    $a^{10}$  (две и более — в фигурных)
  1/2                  →    $\\\\frac{1}{2}$
  pi                   →    $\\\\pi$
  >=, <=, !=           →    $\\\\geq$, $\\\\leq$, $\\\\neq$
  угол 60°             →    угол $60°$ или $60^\\\\circ$
  V = a · b · c        →    $V = a \\\\cdot b \\\\cdot c$

LaTeX в JSON-строке — ДВОЙНОЙ обратный слэш. JSON-парсер ест один:
  Правильно:   "text": "$\\\\frac{1}{2}$"
  Неправильно: "text": "$\\frac{1}{2}$"   (одинарный — JSON parse error)

#### 3. {{N}} ВНУТРИ ФОРМУЛЫ — СТРОГО ЗАПРЕЩЕНО

Маркер {{N}} нельзя помещать между $...$ или $$...$$ — рендерер видит
поломанную LaTeX-строку и выплёвывает сырой текст вокруг прочерков.

ТИПИЧНЫЕ ОШИБКИ (так делать НЕЛЬЗЯ):
  BAD:  "$f'({{1}}) = \\\\tan({{2}})$"
        → ученик увидит: «$f'(____) = \\tan(____)$» сырым текстом.

  BAD:  "$\\\\alpha = {{1}}°$"
        → ученик увидит: «$\\alpha = ____°$» сырым текстом.

  BAD:  "Найди $\\\\int_a^b f(x) dx = F({{1}}) - F({{2}})$"
        → пары $ рвутся когда {{N}} заменяется на input.

ПРАВИЛЬНО (выбирай ОДИН из двух паттернов):

  A) Вынеси {{N}} ЗА пределы формулы:
     "Найди $f'(x_0)$ при $x_0 = {{1}}$ и сравни с $\\\\tan({{2}})$."
     "Угол наклона: $\\\\alpha = $ {{1}} $°$ (если f'(x_0) = 1)."

  B) Разбей на ДВА блока — формула отдельно, пропуски отдельно:
     { "type":"math-display", "id":"md-1", "latex":"f'(x_0) = \\\\tan(\\\\alpha)" },
     { "type":"fill-blank", "id":"fb-1",
       "template":"Здесь x_0 — это {{1}}, а alpha — это {{2}}.",
       "blanks":[ ... ] }

ПРОВЕРКА перед отдачей: если в template есть $, посмотри — нет ли {{N}}
между ним и следующим $. Если есть — переписывай по паттерну A или B.

#### 4. НЕ ИСПОЛЬЗУЙ html-snippet

html-snippet — escape-hatch для аварийных случаев. Если есть ЛЮБОЙ подходящий
типизированный блок (heading/paragraph/callout/...) — используй его.

  BAD:  { "type":"html-snippet", "html":"<h2>Задание</h2><p>Текст</p>" }
  GOOD: { "type":"heading", "level":2, "text":"Задание" } + { "type":"paragraph", ... }

#### 5. ЛОГИКА БЛОКОВ ВНУТРИ ЗАДАНИЯ

В одной карточке-задании обычно идут:
  heading "Задание N. Тема"     ← начинает карточку
  paragraph "Условие задачи"     ← опц. вступление
  math-display "формула"         ← опц. если в условии есть display-формула
  callout "Условие" (info)       ← вместо paragraph для важного условия
  fill-blank / multiple-choice / short-answer / matching   ← интерактивный блок
  callout "Подсказка" (tip)      ← опц. подсказка после задания

#### 6. МЕТА-ДАННЫЕ
- meta.subject обязательно
- meta.grade обязательно
- meta.duration — если применимо (worksheet/lesson_plan/lesson_preparation)
- НЕ дублируй subject/grade в title — они отдельные поля.
`;

const COMMON_TAIL = `
ПОМНИ: один JSON-объект. Никакого текста до или после.
`;

// ─── WORKSHEET ────────────────────────────────────────────────────

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

/**
 * Директива уровня сложности для промпта. Управляется полем формы
 * «Сложность» (легко/средне/сложно) на рабочем листе и тесте.
 */
export function difficultyDirective(d?: DifficultyLevel): string | null {
    switch (d) {
        case 'easy':
            return 'Уровень сложности: ЛЁГКИЙ — базовые задания на прямое применение правила, простые числа, 1 шаг решения. Подходит для отработки и слабых учеников.';
        case 'medium':
            return 'Уровень сложности: СРЕДНИЙ — стандартные задания школьной программы, 2–3 шага решения.';
        case 'hard':
            return 'Уровень сложности: СЛОЖНЫЙ — задания повышенной сложности, многошаговые, олимпиадного или экзаменационного уровня (ОГЭ/ЕГЭ).';
        default:
            return null;
    }
}

export type WorksheetQuestionType =
    | 'mixed'
    | 'multiple-choice'
    | 'short-answer'
    | 'fill-blank';

/** Директива формата заданий рабочего листа. mixed → без ограничения. */
function worksheetTypeDirective(t?: WorksheetQuestionType): string | null {
    switch (t) {
        case 'multiple-choice':
            return 'Формат заданий: используй ТОЛЬКО multiple-choice (тестовые вопросы с вариантами). В КАЖДОМ вопросе РОВНО 4 варианта ответа. НЕ используй fill-blank, short-answer, matching.';
        case 'short-answer':
            return 'Формат заданий: в основном short-answer (открытый развёрнутый ответ с местом для решения). Тестовых вопросов — минимум.';
        case 'fill-blank':
            return 'Формат заданий: в основном fill-blank (заполни пропуски {{N}}). Разбавляй короткими multiple-choice при необходимости.';
        default:
            return null;
    }
}

export interface WorksheetGenInput {
    topic: string;
    subject?: string;
    grade?: string | number;
    duration?: string;
    numTasks?: number;
    difficulty?: DifficultyLevel;
    questionTypes?: WorksheetQuestionType;
    interests?: string;
    extraNotes?: string;
}

export function buildWorksheetPrompt(input: WorksheetGenInput): { system: string; user: string } {
    const tasks = input.numTasks || 10;
    const system = `Ты — методист-помощник учителя. Генерируешь рабочие листы (worksheets) в формате JSON по схеме blocks-v1.

${BASE_SCHEMA_DESCRIPTION}

=== СПЕЦИФИКА WORKSHEET ===

- type: "worksheet"
- РОВНО ${tasks} карточек-заданий — не меньше, не больше. Это ЖЁСТКОЕ требование.
- Каждое задание — отдельная карточка через heading level 2 «Задание N. Краткое название» (N — порядковый номер 1..${tasks}).
- Если ${tasks} ≥ 6 — сгруппируй задания в 2–4 секции через heading level 2 «Блок N: Название» (это секции-разделители, они НЕ считаются заданиями).
- Если ${tasks} ≤ 5 — секции «Блок» не нужны, все задания подряд.
- Внутри каждого задания: paragraph с условием + ОДИН интерактивный блок (fill-blank/multiple-choice/short-answer/matching).
- Между секциями — spacer size:"md".

ПЕРЕД ОТДАЧЕЙ JSON ОБЯЗАТЕЛЬНО ПРОВЕРЬ: количество heading level 2, текст которых начинается с «Задание », должно быть равно ${tasks}. Если меньше — допиши недостающие карточки.
- Если задание с числовым ответом — добавляй short-answer с expectedAnswer (всё в LaTeX).
- Если задание выбрать из списка — multiple-choice. ПО УМОЛЧАНИЮ РОВНО 4 варианта ответа (3 или 5 — только если по смыслу иначе никак).
- Если заполнить пропуски — fill-blank с 1–4 пропусками.
- Если сопоставить — matching с 3–5 левыми и правыми элементами.

=== ПОЛНЫЙ ПРИМЕР WORKSHEET ===

{
  "schemaVersion": 1,
  "type": "worksheet",
  "title": "Рабочий лист: Объём прямоугольного параллелепипеда",
  "meta": { "subject": "Математика", "grade": "5 класс", "duration": "45 мин" },
  "blocks": [
    { "type":"paragraph", "id":"p-intro",
      "text":"Объём прямоугольного параллелепипеда вычисляется по формуле $V = a \\\\cdot b \\\\cdot c$, где $a$, $b$, $c$ — длина, ширина и высота." },
    { "type":"heading", "id":"h-s1", "level":2, "text":"Блок 1: Понятия и формула" },
    { "type":"heading", "id":"h-1", "level":2, "text":"Задание 1. Основные элементы" },
    { "type":"fill-blank", "id":"fb-1",
      "template":"У прямоугольного параллелепипеда {{1}} вершин, {{2}} рёбер и {{3}} граней.",
      "blanks":[{"index":1,"answer":"8"},{"index":2,"answer":"12"},{"index":3,"answer":"6"}] },
    { "type":"heading", "id":"h-2", "level":2, "text":"Задание 2. Выбор формулы" },
    { "type":"multiple-choice", "id":"mc-1",
      "question":"Какая формула верна для объёма прямоугольного параллелепипеда?",
      "multiple":false,
      "options":[
        {"id":"a","text":"$V = a + b + c$","correct":false},
        {"id":"b","text":"$V = a \\\\cdot b \\\\cdot c$","correct":true},
        {"id":"c","text":"$V = 2(a + b + c)$","correct":false}
      ] },
    { "type":"spacer", "id":"sp-1", "size":"md" },
    { "type":"heading", "id":"h-s2", "level":2, "text":"Блок 2: Практические расчёты" },
    { "type":"heading", "id":"h-3", "level":2, "text":"Задание 3. Расчёт объёма" },
    { "type":"callout", "id":"c-1", "variant":"info", "title":"Условие",
      "text":"Найдите объём коробки длиной 10 см, шириной 5 см и высотой 4 см." },
    { "type":"short-answer", "id":"sa-1", "question":"Запишите решение и ответ:",
      "expectedAnswer":"$V = 10 \\\\cdot 5 \\\\cdot 4 = 200$ см³",
      "expectedLength":"medium" }
  ]
}

${COMMON_TAIL}`;

    const lines: string[] = [`Сгенерируй worksheet по теме: "${input.topic}"`];
    if (input.subject) lines.push(`Предмет: ${input.subject}`);
    if (input.subject) {
        const langDirective = subjectLanguageDirective(input.subject);
        if (langDirective) lines.push(langDirective);
    }
    if (input.grade) lines.push(`Класс: ${input.grade}`);
    if (input.duration) lines.push(`Длительность: ${input.duration}`);
    if (input.numTasks) lines.push(`Количество заданий: РОВНО ${input.numTasks} (карточек heading «Задание N. ...»).`);
    const wsDiff = difficultyDirective(input.difficulty);
    if (wsDiff) lines.push(wsDiff);
    const wsType = worksheetTypeDirective(input.questionTypes);
    if (wsType) lines.push(wsType);
    if (input.interests && input.interests.trim()) {
        lines.push(`Интересы учеников (используй в формулировках задач, метафорах, примерах): ${input.interests.trim()}`);
    }
    if (input.extraNotes) lines.push(`Дополнительно: ${input.extraNotes}`);
    lines.push('Верни строго один JSON-объект.');
    return { system, user: lines.join('\n') };
}

// ─── QUIZ ─────────────────────────────────────────────────────────

export interface QuizGenInput {
    topic: string;
    subject?: string;
    grade?: string | number;
    numQuestions?: number;
    numAnswers?: number;
    questionTypes?: 'multiple-choice' | 'mixed';
    difficulty?: DifficultyLevel;
    interests?: string;
    extraNotes?: string;
}

export function buildQuizPrompt(input: QuizGenInput): { system: string; user: string } {
    const n = input.numQuestions || 10;
    const ans = Math.min(6, Math.max(2, input.numAnswers || 4));
    const onlyMC = input.questionTypes === 'multiple-choice';
    const system = `Ты — методист. Генерируешь тесты (quiz) в формате JSON по схеме blocks-v1.

${BASE_SCHEMA_DESCRIPTION}

=== СПЕЦИФИКА QUIZ ===

- type: "quiz"
- РОВНО ${n} вопросов, каждый — отдельная карточка через heading «Вопрос N».
- ${onlyMC ? 'ТОЛЬКО multiple-choice. БЕЗ short-answer.' : 'В основном multiple-choice; допускаются short-answer для числовых задач.'}
- multiple-choice: РОВНО ${ans} вариантов в КАЖДОМ вопросе (не больше, не меньше).
  ОДИН правильный (multiple:false). Варианты — краткие, без длинных формулировок.
- НЕТ длинных paragraph-вступлений перед вопросами.
- ОБЯЗАТЕЛЬНО проставляй correct:true у правильного варианта и expectedAnswer у short-answer.
- НЕТ блоков fill-blank, matching, callout, table — только heading + multiple-choice / short-answer.
- НЕТ секций «Блок N» — тест плоский, стэк вопросов.

=== ПОЛНЫЙ ПРИМЕР QUIZ ===

{
  "schemaVersion": 1,
  "type": "quiz",
  "title": "Тест: Обыкновенные дроби",
  "meta": { "subject": "Математика", "grade": "5 класс" },
  "blocks": [
    { "type":"heading", "id":"h-1", "level":2, "text":"Вопрос 1" },
    { "type":"multiple-choice", "id":"mc-1",
      "question":"Какая дробь правильная?",
      "multiple":false,
      "options":[
        {"id":"a","text":"$\\\\frac{5}{3}$","correct":false},
        {"id":"b","text":"$\\\\frac{2}{7}$","correct":true},
        {"id":"c","text":"$\\\\frac{9}{4}$","correct":false},
        {"id":"d","text":"$\\\\frac{11}{5}$","correct":false}
      ] },
    { "type":"heading", "id":"h-2", "level":2, "text":"Вопрос 2" },
    { "type":"multiple-choice", "id":"mc-2",
      "question":"Сократи дробь $\\\\frac{12}{18}$:",
      "multiple":false,
      "options":[
        {"id":"a","text":"$\\\\frac{1}{2}$","correct":false},
        {"id":"b","text":"$\\\\frac{2}{3}$","correct":true},
        {"id":"c","text":"$\\\\frac{3}{4}$","correct":false},
        {"id":"d","text":"$\\\\frac{6}{9}$","correct":false}
      ] }
  ]
}

${COMMON_TAIL}`;
    const lines: string[] = [`Сгенерируй тест по теме: "${input.topic}"`];
    if (input.subject) lines.push(`Предмет: ${input.subject}`);
    if (input.subject) {
        const langDirective = subjectLanguageDirective(input.subject);
        if (langDirective) lines.push(langDirective);
    }
    if (input.grade) lines.push(`Класс: ${input.grade}`);
    if (input.numQuestions) lines.push(`Количество вопросов: ${input.numQuestions}`);
    const quizDiff = difficultyDirective(input.difficulty);
    if (quizDiff) lines.push(quizDiff);
    if (input.interests && input.interests.trim()) {
        lines.push(`Интересы учеников (используй в формулировках вопросов): ${input.interests.trim()}`);
    }
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
    lessonType?: string;
    workFormat?: string;
    lessonStyle?: string;
    interests?: string;
    depth?: 'short' | 'standard' | 'deep';
    extraNotes?: string;
}

export function buildLessonPlanPrompt(input: LessonPlanGenInput): { system: string; user: string } {
    const system = `Ты — методист. Генерируешь планы урока (lesson_plan) в формате JSON по схеме blocks-v1.

${BASE_SCHEMA_DESCRIPTION}

=== СПЕЦИФИКА LESSON PLAN ===

- type: "lesson_plan"
- meta.duration ОБЯЗАТЕЛЬНО (общая длительность урока).
- Шапка: paragraph с целями + callout(variant:methodology) с планируемыми результатами (УУД).
- 5 этапов урока — каждый отдельная карточка через heading level 2 «Этап N. Название (X мин)»:
  1. Организационный момент (2–3 мин)
  2. Актуализация / мотивация (3–5 мин)
  3. Изучение нового материала (15–20 мин)
  4. Закрепление / практика (10–15 мин)
  5. Рефлексия / домашнее задание (3–5 мин)
- Внутри этапа: paragraph «Учитель: … Ученики: …» + callout(tip) с методическим советом если нужно.
- НЕТ интерактивных блоков (fill-blank/multiple-choice/short-answer/matching) — это план для учителя.
- НЕТ секций «Блок N» — этапы сами являются секциями, рендерятся как карточки.
- math-display для важных формул урока; table для расписания/распределения времени.

=== ПОЛНЫЙ ПРИМЕР LESSON PLAN ===

{
  "schemaVersion": 1,
  "type": "lesson_plan",
  "title": "План урока: Теорема Пифагора",
  "meta": { "subject": "Геометрия", "grade": "8 класс", "duration": "45 мин" },
  "blocks": [
    { "type":"paragraph", "id":"p-obj",
      "text":"Цели урока: познакомить учащихся с теоремой Пифагора, научить применять её для нахождения сторон прямоугольного треугольника." },
    { "type":"callout", "id":"c-results", "variant":"methodology", "title":"Планируемые результаты",
      "text":"Личностные: интерес к математике. Метапредметные: умение работать с формулами. Предметные: знание формулы $a^2 + b^2 = c^2$ и её применение." },
    { "type":"heading", "id":"h-1", "level":2, "text":"Этап 1. Организационный момент (2 мин)" },
    { "type":"paragraph", "id":"p-1",
      "text":"Учитель приветствует класс, проверяет готовность к уроку, отмечает отсутствующих." },
    { "type":"heading", "id":"h-2", "level":2, "text":"Этап 2. Актуализация знаний (5 мин)" },
    { "type":"paragraph", "id":"p-2",
      "text":"Учитель просит вспомнить определение прямоугольного треугольника. Ученики: «Треугольник с прямым углом». Учитель: «Как называются стороны прямоугольного треугольника?» Ученики: «Катеты и гипотенуза»." },
    { "type":"callout", "id":"c-tip2", "variant":"tip",
      "text":"Если ученики затрудняются — нарисовать на доске треугольник и подписать стороны." }
  ]
}

${COMMON_TAIL}`;
    const lines: string[] = [`Сгенерируй план урока по теме: "${input.topic}"`];
    if (input.subject) lines.push(`Предмет: ${input.subject}`);
    if (input.subject) {
        const langDirective = subjectLanguageDirective(input.subject);
        if (langDirective) lines.push(langDirective);
    }
    if (input.grade) lines.push(`Класс: ${input.grade}`);
    if (input.duration) lines.push(`Длительность урока: ${input.duration}`);
    if (input.lessonType) lines.push(`Тип урока: ${input.lessonType}`);
    if (input.workFormat) lines.push(`Формат работы: ${input.workFormat}`);
    if (input.lessonStyle) {
        const styleLabel = input.lessonStyle === 'lecture'
            ? 'лекционный (минимум интерактива, преподаватель ведёт основную часть)'
            : 'интерактивный (вопросы классу, парная/групповая работа, обсуждения)';
        lines.push(`Стиль урока: ${styleLabel}`);
    }
    if (input.objectives) lines.push(`Цели урока: ${input.objectives}`);
    if (input.interests && input.interests.trim()) {
        lines.push(`Интересы учеников (используй в примерах и активностях): ${input.interests.trim()}`);
    }
    if (input.depth) {
        const depthHint = input.depth === 'short'
            ? 'Кратко: 3–4 этапа, без длинных пояснений.'
            : input.depth === 'deep'
                ? 'Подробно: все 5 этапов с расширенными методическими комментариями, ожидаемыми реакциями учеников.'
                : 'Стандарт: 5 этапов, основные реплики.';
        lines.push(`Уровень детализации: ${depthHint}`);
    }
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
    withTranscription?: boolean;
    withExample?: boolean;
    withSynonyms?: boolean;
    practiceFocus?: string;
    extraNotes?: string;
}

export function buildVocabularyPrompt(input: VocabularyGenInput): { system: string; user: string } {
    const n = input.numWords || 15;
    const src = input.sourceLanguage || 'Английский';
    const tgt = input.targetLanguage || 'Русский';
    const system = `Ты — методист-помощник учителя иностранных языков. Генерируешь словари (vocabulary) в формате JSON по схеме blocks-v1.

${BASE_SCHEMA_DESCRIPTION}

=== СПЕЦИФИКА VOCABULARY ===

- type: "vocabulary"
- Шапка: ОДИН короткий paragraph (1–2 предложения о теме словаря).
- РОВНО ${n} словарных статей через блок vocab-entry. ОДНА статья = ОДИН vocab-entry.
- БЕЗ heading'ов между словами — каждое слово сразу как vocab-entry.
- Можно сгруппировать слова в 2–3 подтемы через heading level 2 «Блок N: Подтема» (секция-разделитель).

Поля vocab-entry:
- term — слово/выражение на ${src} языке (ОБЯЗАТЕЛЬНО).
- translation — перевод на ${tgt} (ОБЯЗАТЕЛЬНО).
- transcription — фонетическая транскрипция в IPA (для английского — ВСЕГДА; для остальных — опц.).
- partOfSpeech — короткая часть речи: "noun", "verb", "adj", "adv", "phr.v", или сокращения для других языков.
- example — пример предложения с этим словом НА ИСХОДНОМ ЯЗЫКЕ (опц., но рекомендуется).
- exampleTranslation — перевод примера на ${tgt} (если есть example).
- note — нюанс употребления, formal/informal, regional variation (опц.).

НЕТ блоков fill-blank/multiple-choice/short-answer/matching/math-display.
НЕТ упражнений на словарь.

=== ПОЛНЫЙ ПРИМЕР VOCABULARY ===

{
  "schemaVersion": 1,
  "type": "vocabulary",
  "title": "Словарь: At the airport",
  "meta": { "subject": "Английский язык", "grade": "7 класс" },
  "blocks": [
    { "type":"paragraph", "id":"p-intro",
      "text":"Базовая лексика для общения в аэропорту: регистрация, посадка, багаж." },
    { "type":"heading", "id":"h-s1", "level":2, "text":"Блок 1: До посадки" },
    { "type":"vocab-entry", "id":"v-1",
      "term":"boarding pass", "translation":"посадочный талон",
      "transcription":"'bɔːdɪŋ pɑːs", "partOfSpeech":"noun",
      "example":"Show your boarding pass at the gate.",
      "exampleTranslation":"Покажите посадочный талон у выхода на посадку." },
    { "type":"vocab-entry", "id":"v-2",
      "term":"to check in", "translation":"регистрироваться",
      "transcription":"tə tʃek ɪn", "partOfSpeech":"phr.v",
      "example":"You should check in two hours before the flight.",
      "exampleTranslation":"Вам следует зарегистрироваться за два часа до вылета." },
    { "type":"vocab-entry", "id":"v-3",
      "term":"luggage", "translation":"багаж",
      "transcription":"'lʌgɪdʒ", "partOfSpeech":"noun",
      "note":"Используется как неисчисляемое: a piece of luggage." }
  ]
}

${COMMON_TAIL}`;
    const lines: string[] = [`Сгенерируй словарь по теме: "${input.topic}"`];
    if (input.sourceLanguage) lines.push(`Исходный язык: ${input.sourceLanguage}`);
    if (input.targetLanguage) lines.push(`Перевод на: ${input.targetLanguage}`);
    if (input.grade) lines.push(`Класс: ${input.grade}`);
    if (input.numWords) lines.push(`Количество слов: ${input.numWords}`);
    // Опции включения для каждого слова — проброс из UI-чекбоксов.
    const incl: string[] = [];
    if (input.withTranscription !== undefined) incl.push(input.withTranscription ? 'транскрипцию (IPA) ВСЕГДА' : 'без транскрипции');
    if (input.withExample !== undefined) incl.push(input.withExample ? 'пример предложения (example + exampleTranslation) ОБЯЗАТЕЛЬНО для каждого слова' : 'без поля example');
    if (input.withSynonyms !== undefined) incl.push(input.withSynonyms ? 'синонимы/антонимы в поле note (через "син.:", "ант.:")' : 'без синонимов/антонимов');
    if (incl.length > 0) lines.push(`Включить: ${incl.join('; ')}`);
    if (input.practiceFocus && input.practiceFocus.trim()) {
        lines.push(`После словаря добавь 3–5 коротких упражнений (heading «Упражнения» + блоки fill-blank / multiple-choice / matching / short-answer) с фокусом на: ${input.practiceFocus.trim()}`);
    }
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
    interests?: string;
    depth?: 'short' | 'standard' | 'deep';
    extraNotes?: string;
}

export function buildLessonPreparationPrompt(input: LessonPreparationGenInput): { system: string; user: string } {
    const system = `Ты — методист-помощник учителя, специализирующийся на нестандартных «вау-уроках». Генерируешь полные конспекты в формате JSON по схеме blocks-v1.

${BASE_SCHEMA_DESCRIPTION}

=== СПЕЦИФИКА LESSON PREPARATION (Вау-урок) ===

- type: "lesson_preparation"
- meta.duration ОБЯЗАТЕЛЬНО.
- Полный готовый-к-проведению конспект урока с яркими «крючками» и активностями.
- РОВНО 4 секции через heading level 2 «Блок N: …»:
  1. «Блок 1: Подготовка учителя» — что нужно подготовить заранее
     (paragraph со списком + callout(methodology) с временными затратами).
  2. «Блок 2: Ход урока» — пошагово, каждый шаг = карточка-задание через heading level 2
     (например, «Шаг 3. Открытие нового материала (10 мин)»). Внутри:
       • paragraph с КОНКРЕТНЫМИ словами учителя и ожидаемой реакцией учеников
       • callout(tip) с методическим советом
       • при необходимости math-display / table
  3. «Блок 3: Раздаточные материалы и активности» — описание мини-игр, карточек,
     наглядных пособий, ссылок на ресурсы. paragraph + callout по необходимости.
  4. «Блок 4: Рефлексия и домашнее задание» — рефлексивные вопросы +
     детально описанное ДЗ.

- НЕТ interactive-блоков для ученика (fill-blank/multiple-choice/short-answer/matching) —
  это конспект для учителя, не раздаточный материал.

- КОНКРЕТИКА вместо общих фраз:
  BAD:  "Учитель обсуждает с классом тему."
  GOOD: "Учитель: «Кто видел сегодня радугу? Что вы заметили?» Ожидаемые ответы учеников: «Цвета»,
         «Полукруг», «После дождя». Учитель связывает с темой урока."

- Конспект ДОЛЖЕН быть полностью готов к проведению — никаких заглушек «здесь учитель добавит».

${COMMON_TAIL}`;
    const lines: string[] = [`Сгенерируй полный план «вау-урока» по теме: "${input.topic}"`];
    if (input.subject) lines.push(`Предмет: ${input.subject}`);
    if (input.subject) {
        const langDirective = subjectLanguageDirective(input.subject);
        if (langDirective) lines.push(langDirective);
    }
    if (input.grade) lines.push(`Класс: ${input.grade}`);
    if (input.duration) lines.push(`Длительность: ${input.duration}`);
    if (input.interests && input.interests.trim()) {
        lines.push(`Интересы учеников (используй в «крючках», метафорах, примерах): ${input.interests.trim()}`);
    }
    if (input.depth) {
        const depthHint = input.depth === 'short'
            ? 'Кратко: компактные шаги, без длинных пояснений. Каждый шаг 1–2 коротких абзаца.'
            : input.depth === 'deep'
                ? 'Подробно: расширенные методические комментарии, варианты реплик учителя, альтернативные ходы при разных реакциях класса, риски и как их избежать.'
                : 'Стандартная детализация: основные реплики и активности.';
        lines.push(`Уровень детализации: ${depthHint}`);
    }
    if (input.extraNotes) lines.push(`Дополнительно: ${input.extraNotes}`);
    lines.push('Верни строго один JSON-объект.');
    return { system, user: lines.join('\n') };
}
