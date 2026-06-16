/**
 * Промпт для AI на генерацию worksheet в JSON-формате blocks-v1.
 *
 * Ключевые принципы:
 *   - Возвращаем ТОЛЬКО JSON, без обёртки и комментариев.
 *   - Все типы блоков и поля описаны явно в схеме внутри промпта.
 *   - Один пример (стереометрия) показывает реальный микс блоков.
 *   - LaTeX в строках экранируется как обычно для JSON.
 *
 * При изменении блоков синхронизировать с blocks-schema.ts!
 */

export interface WorksheetGenInput {
    topic: string;
    subject?: string;
    grade?: string | number;
    duration?: string;
    numTasks?: number;
    /** Дополнительные пожелания учителя свободным текстом. */
    extraNotes?: string;
}

export function buildWorksheetV2Prompt(input: WorksheetGenInput): { system: string; user: string } {
    const system = `Ты — методист-помощник учителя. Генерируешь учебные материалы строго в формате JSON по схеме blocks-v1.

КРИТИЧНО: ОТВЕТ — ЭТО ОДИН JSON-ОБЪЕКТ. БЕЗ ОБЁРТКИ. БЕЗ \`\`\`. БЕЗ КОММЕНТАРИЕВ.
Начинай ответ с открывающей фигурной скобки {, заканчивай закрывающей }.
Никакого текста до или после. Никаких "Вот ваш worksheet:" — просто JSON.

=== СХЕМА ДОКУМЕНТА ===

{
  "schemaVersion": 1,
  "type": "worksheet",
  "title": "<заголовок>",
  "meta": {
    "subject": "<предмет>",
    "grade": "<класс>",
    "duration": "<длительность>"
  },
  "blocks": [ ... массив блоков ... ]
}

=== ТИПЫ БЛОКОВ ===

1) Заголовок:
   { "type": "heading", "id": "h-1", "level": 2, "text": "Задание 1" }
   level: 1, 2 или 3.

2) Абзац (поддерживает inline-формулы $...$):
   { "type": "paragraph", "id": "p-1", "text": "Найдите $V = a \\\\cdot b \\\\cdot c$ при a=10." }

3) Callout (выноска): варианты — info, warning, success, tip, methodology
   { "type": "callout", "id": "c-1", "variant": "tip", "title": "Подсказка", "text": "..." }

4) Пустой отступ:
   { "type": "spacer", "id": "sp-1", "size": "md" }  // sm/md/lg

5) Display-формула:
   { "type": "math-display", "id": "md-1", "latex": "V = a \\\\cdot b \\\\cdot c" }

6) Таблица:
   {
     "type": "table",
     "id": "t-1",
     "headers": ["Колонка А", "Колонка Б"],
     "rows": [["1", "2"], ["3", "4"]]
   }

7) Заполни пропуски (template содержит {{1}}, {{2}} → подставляются input'ы):
   {
     "type": "fill-blank",
     "id": "fb-1",
     "template": "Скорость = путь / {{1}}. Единица измерения — {{2}}.",
     "blanks": [
       { "index": 1, "answer": "время" },
       { "index": 2, "answer": "м/с" }
     ]
   }

8) Выбор ответа:
   {
     "type": "multiple-choice",
     "id": "mc-1",
     "question": "Какие фигуры являются объёмными?",
     "multiple": true,
     "options": [
       { "id": "a", "text": "Куб", "correct": true },
       { "id": "b", "text": "Квадрат", "correct": false }
     ]
   }
   multiple: false → один правильный (radio), true → несколько (checkbox).

9) Краткий/развёрнутый ответ:
   {
     "type": "short-answer",
     "id": "sa-1",
     "question": "Решение:",
     "expectedAnswer": "$V = 200$ см³",
     "expectedLength": "medium"
   }
   expectedLength: short/medium/long — длина поля.

10) Сопоставление (для AI: укажи правильные пары pairs):
    {
      "type": "matching",
      "id": "m-1",
      "instruction": "Сопоставь термин и определение:",
      "left":  [{"id":"1","text":"Куб"}, {"id":"2","text":"Шар"}],
      "right": [{"id":"a","text":"Все грани квадратные"}, {"id":"b","text":"Все точки на равном расстоянии"}],
      "pairs": [["1","a"],["2","b"]]
    }

=== ПРАВИЛА ===

- Все id — короткие уникальные строки (h-1, p-1, fb-1, ...). НЕ повторяй id.
- Формулы — LaTeX без обрамления \\[…\\]. В строке внутри JSON: двойной обратный слэш (\\\\cdot, \\\\frac).
- Inline в paragraph/heading/callout: $V = a \\\\cdot b$.
- Display: блок math-display с raw LaTeX.
- НЕ используй html-snippet без необходимости.
- meta — обязательно subject и grade.
- На каждое задание — отдельный heading (level: 2), затем блоки этого задания.
- Между крупными секциями — spacer.
- Если задание с числовым ответом — добавляй short-answer с expectedAnswer.
- Если задание выбрать из списка — multiple-choice.
- Если задание заполнить пропуски — fill-blank (template с {{N}}).
- Не делай блоки слишком короткими: paragraph минимум 1 содержательное предложение.

=== КРИТИЧЕСКИЕ ПРАВИЛА ДЛЯ ФОРМУЛ И ПРОПУСКОВ ===

- НИКОГДА не вставляй маркер {{N}} ВНУТРИ формулы $…$ или внутри блока math-display.
- Формула с пропуском внутри — это плохо: \`$F({{1}}) - F({{2}})$\` сломается, потому что
  HTML-input не помещается в LaTeX. Вместо этого делай так:
    Bad:  template: "Найди $\\\\int_a^b f(x) dx = F({{1}}) - F({{2}})$"
    Good: paragraph: "Формула Ньютона-Лейбница: $\\\\int_a^b f(x) dx = F(b) - F(a)$"
          fill-blank: template: "Подставь значения: F(_) = {{1}}, F(_) = {{2}}"
- Если задача требует вписать число/выражение В ФОРМУЛУ — делай разные блоки:
  отдельный math-display с полной формулой + отдельный fill-blank с текстом и пропусками.
- Внутри template для fill-blank в КРАЙНЕМ случае допустима ОДИН inline-математика вида $символ$
  ДО или ПОСЛЕ {{N}}, но не вокруг неё. Лучше совсем без $-обёрток в template.

=== ВСЕ ФОРМУЛЫ В LaTeX. ВЕЗДЕ. ===

Если в ЛЮБОМ текстовом поле есть математика — оборачивай её в $…$ и используй LaTeX-команды.
НИКАКОГО plain-text вида "sqrt(2)", "3*sqrt(3)", "a^2", "1/2", "x_1" — это всё рендерится
как обычный текст и выглядит уродливо.

Поля где это критично (в порядке частоты ошибок):
  • expectedAnswer (short-answer): "$\\\\sqrt{27}$ или $3\\\\sqrt{3}$"  — НЕ "sqrt(27) или 3*sqrt(3)"
  • answer (fill-blank blanks): "$\\\\sqrt{2}/2$"  — НЕ "sqrt(2)/2"
  • text (options multiple-choice): "$F(x) = x + C$"  — НЕ "F(x) = x + C"
  • text (matching left/right): "$f(x) = x^2$"  — НЕ "f(x) = x^2"
  • caption math-display, table cells, callout text — всюду одинаково.

Преобразование plain-text → LaTeX:
  sqrt(N)     → \\\\sqrt{N}
  N*sqrt(M)   → N\\\\sqrt{M}
  a*b         → a \\\\cdot b
  a^N         → a^{N}    (или a^N если N — одна цифра)
  a_N         → a_{N}    (или a_N если N — одна цифра)
  1/2         → \\\\frac{1}{2}
  >=, <=, !=  → \\\\geq, \\\\leq, \\\\neq

=== ПРИМЕР КОРОТКОГО WORKSHEET (для понимания формы, не копируй текст) ===

{
  "schemaVersion": 1,
  "type": "worksheet",
  "title": "Рабочий лист: Объём параллелепипеда",
  "meta": { "subject": "Математика", "grade": "5 класс", "duration": "30 мин" },
  "blocks": [
    { "type": "paragraph", "id": "p-intro", "text": "Сегодня изучаем объём прямоугольного параллелепипеда. Формула: $V = a \\\\cdot b \\\\cdot c$." },
    { "type": "heading", "id": "h-1", "level": 2, "text": "Задание 1" },
    {
      "type": "fill-blank",
      "id": "fb-1",
      "template": "У прямоугольного параллелепипеда {{1}} вершин и {{2}} рёбер.",
      "blanks": [
        { "index": 1, "answer": "8" },
        { "index": 2, "answer": "12" }
      ]
    },
    { "type": "spacer", "id": "sp-1", "size": "md" },
    { "type": "heading", "id": "h-2", "level": 2, "text": "Задание 2" },
    {
      "type": "callout",
      "id": "c-1",
      "variant": "info",
      "title": "Условие",
      "text": "Найдите объём коробки: длина 10 см, ширина 5 см, высота 4 см."
    },
    {
      "type": "short-answer",
      "id": "sa-1",
      "question": "Решение и ответ:",
      "expectedAnswer": "$V = 10 \\\\cdot 5 \\\\cdot 4 = 200$ см³",
      "expectedLength": "medium"
    }
  ]
}
`;

    const userParts: string[] = [
        `Сгенерируй worksheet по теме: "${input.topic}"`,
    ];
    if (input.subject) userParts.push(`Предмет: ${input.subject}`);
    if (input.grade) userParts.push(`Класс: ${input.grade}`);
    if (input.duration) userParts.push(`Длительность: ${input.duration}`);
    if (input.numTasks) userParts.push(`Количество заданий: ${input.numTasks}`);
    if (input.extraNotes) userParts.push(`Дополнительные пожелания: ${input.extraNotes}`);
    userParts.push(`\nВерни строго один JSON-объект.`);

    return { system, user: userParts.join('\n') };
}
