import { SLIDE_LAYOUTS, SLIDE_THEME_IDS, SlideOutlineItem } from './slide-doc.types';

export interface OutlineParams {
  topic: string;
  audience?: string;
  durationMinutes?: number;
  numSlides: number;
}

export interface SlideContentParams {
  topic: string;
  audience?: string;
  outlineItem: SlideOutlineItem;
  index: number;
  total: number;
  glossary?: Array<{ term: string; definition: string }>;
}

export interface GlossaryParams {
  topic: string;
  audience?: string;
  slideTitles: string[];
}

const LAYOUT_GUIDE = `
ДОСТУПНЫЕ ЛЕЙАУТЫ:
- "title": обложка (только title + subtitle)
- "agenda": список целей урока (title + bullets, 3–5 пунктов)
- "bullets": заголовок + маркированный список (title + bullets, 3–6 пунктов по 6–14 слов)
- "two-column": сравнение двух понятий (title + leftColumn{heading,bullets} + rightColumn{heading,bullets})
- "image-text": текст слева, картинка справа (title + bullets ИЛИ paragraph + image)
- "quote": определение/цитата (title + quote{text,attribution})
- "quiz": вопрос с вариантами (title + quiz{question,options[2-4],answerIndex})
- "summary": итог урока + домашнее задание (title + bullets)
`;

export function buildOutlinePrompt(params: OutlineParams): string {
  const { topic, audience, durationMinutes, numSlides } = params;
  return `Ты — методист и дизайнер образовательных презентаций. Сгенерируй СТРУКТУРУ урока — план слайдов.

КОНТЕКСТ:
- Тема: "${topic}"
- Аудитория: ${audience || 'Школьники'}
- Длительность: ${durationMinutes || 15} мин
- Количество слайдов: ровно ${numSlides}

${LAYOUT_GUIDE}

ПРАВИЛА:
1. Слайд 1 — обязательно "title".
2. Слайд 2 — обычно "agenda" (цели урока).
3. Предпоследний слайд — обычно "quiz" (проверка знаний).
4. Последний — "summary" (итоги, домашнее задание).
5. Между ними — "bullets" / "two-column" / "image-text" / "quote" — чередуй для ритма.
6. needsImage=true только когда визуал реально помогает (схема, объект, исторический контекст). Не более 40% слайдов.
7. imageHint — короткий английский описательный фрагмент (без слова "prompt").

ФОРМАТ ОТВЕТА (СТРОГО):
Верни ТОЛЬКО валидный JSON, без markdown, без пояснений:
{
  "themeId": один из ${JSON.stringify(SLIDE_THEME_IDS)},
  "topic": "${topic.replace(/"/g, '\\"')}",
  "slides": [
    { "layout": один из ${JSON.stringify(SLIDE_LAYOUTS)}, "title": "...", "needsImage": boolean, "imageHint": "..." }
  ]
}

Длина массива slides — ровно ${numSlides}. Ответ начни с {.`;
}

export function buildGlossaryPrompt(params: GlossaryParams): string {
  const { topic, audience, slideTitles } = params;
  return `Перед генерацией контента слайдов зафиксируй ТЕРМИНОЛОГИЮ урока — чтобы все слайды были написаны единым языком.

КОНТЕКСТ:
- Тема: "${topic}"
- Аудитория: ${audience || 'Школьники'}
- План урока (заголовки слайдов):
${slideTitles.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}

ЗАДАЧА:
Выбери 5–10 ключевых терминов/понятий, которые встретятся на нескольких слайдах. Дай им короткое каноническое определение (1 предложение, до 25 слов). На последующих слайдах эти термины должны использоваться единообразно — без синонимов, без переименований.

ФОРМАТ ОТВЕТА (СТРОГО):
Верни ТОЛЬКО валидный JSON, без markdown:
{
  "terms": [
    { "term": "...", "definition": "..." }
  ]
}

Ответ начни с {.`;
}

export function buildSlideContentPrompt(params: SlideContentParams): string {
  const { topic, audience, outlineItem, index, total, glossary } = params;

  const layoutSchemas: Record<string, string> = {
    title: `{ "title": "...", "subtitle": "короткое описание урока" }`,
    agenda: `{ "title": "Цели урока", "bullets": ["цель 1", "цель 2", "цель 3"] }`,
    bullets: `{ "title": "${outlineItem.title}", "bullets": ["..."], "math": ["LaTeX без $"]? }`,
    'two-column': `{ "title": "${outlineItem.title}", "leftColumn": {"heading":"...","bullets":["..."]}, "rightColumn": {"heading":"...","bullets":["..."]} }`,
    'image-text': `{ "title": "${outlineItem.title}", "bullets": ["..."] }`,
    quote: `{ "title": "${outlineItem.title}", "quote": {"text":"...", "attribution":"автор"} }`,
    quiz: `{ "title": "Проверь себя", "quiz": {"question":"...", "options":["A","B","C","D"], "answerIndex": 0} }`,
    summary: `{ "title": "Итоги", "bullets": ["что узнали", "домашнее задание"] }`,
  };

  const glossaryBlock = glossary && glossary.length
    ? `\nГЛОССАРИЙ УРОКА (используй ЭТИ формулировки терминов, не выдумывай синонимов):\n${glossary
        .map((g, i) => `  ${i + 1}. ${g.term} — ${g.definition}`)
        .join('\n')}\n`
    : '';

  return `Сгенерируй СОДЕРЖАНИЕ одного слайда презентации.

КОНТЕКСТ:
- Тема урока: "${topic}"
- Аудитория: ${audience || 'Школьники'}
- Слайд ${index + 1} из ${total}
- Лейаут: "${outlineItem.layout}"
- Заголовок слайда (план): "${outlineItem.title}"
${glossaryBlock}
ПРАВИЛА КОНТЕНТА:
1. Маркеры — короткие, 6–14 слов. Максимум 5 маркеров.
2. Без воды, без "Здравствуйте, дорогие ученики".
3. Математика — LaTeX без долларов: "x^2 + y^2 = r^2". Поле math — массив строк.
4. Кириллица внутри LaTeX-формул запрещена.
5. speakerNotes — 1–2 предложения для учителя.

${outlineItem.needsImage ? `ИЗОБРАЖЕНИЕ:\nВерни image.prompt — короткий английский промпт по подсказке "${outlineItem.imageHint || ''}". Пример: "clean educational diagram, ${outlineItem.imageHint}, flat style, white background, no text".` : 'Изображение НЕ нужно — поле image не возвращай.'}

ФОРМАТ ОТВЕТА (СТРОГО):
Верни ТОЛЬКО валидный JSON, без markdown:
{
  "content": ${layoutSchemas[outlineItem.layout] || layoutSchemas.bullets},
  ${outlineItem.needsImage ? '"image": { "prompt": "...", "alt": "..." },' : ''}
  "speakerNotes": "..."
}

Ответ начни с {.`;
}

export const PRESENTATION_SYSTEM_PROMPT =
  'Ты — методист и дизайнер образовательных презентаций. Отвечаешь СТРОГО валидным JSON по запрошенной схеме. Без markdown, без пояснений.';
