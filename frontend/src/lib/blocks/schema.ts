import { z } from 'zod'

/**
 * JSON-schema для нового формата генераций («blocks v1»).
 *
 * Контракт:
 *  • Документ = title + meta + список БЛОКОВ.
 *  • Каждый блок — типизированная сущность с известными полями.
 *  • Рендеринг (на экран, в PDF, в DOCX) — детерминирован: блок → React-компонент.
 *  • Хранение в БД — `UserGeneration.outputData.outputDoc` (рядом со старыми
 *    полями `content` / `editedBody`, чтобы не ломать legacy-движок).
 *  • Дискриминатор формата: `outputData.format === 'json-blocks-v1'`.
 *    Если поля нет — legacy HTML рендерится по-старому.
 *
 * Все ID — стабильные строки, генерируются на бэке при первой записи.
 * Это позволяет фронту таргетить блоки в редакторе, а ученику — сабмитить
 * ответы привязанные к конкретному блоку (`{ blockId, answer }`).
 */

const id = z.string().min(1)

// ─── Простые блоки ──────────────────────────────────────────────────────

const HeadingBlock = z.object({
    type: z.literal('heading'),
    id,
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    text: z.string().min(1),
})

const ParagraphBlock = z.object({
    type: z.literal('paragraph'),
    id,
    // Поддерживает inline-math через `$…$`, рендерится KaTeX'ом.
    text: z.string().min(1),
})

const CalloutBlock = z.object({
    type: z.literal('callout'),
    id,
    variant: z.enum(['info', 'warning', 'success', 'tip', 'methodology']),
    title: z.string().optional(),
    text: z.string().min(1),
})

const SpacerBlock = z.object({
    type: z.literal('spacer'),
    id,
    size: z.enum(['sm', 'md', 'lg']).default('md'),
})

const MathDisplayBlock = z.object({
    type: z.literal('math-display'),
    id,
    // Сырая LaTeX-строка. Без обрамления `\[…\]` / `$$…$$` — рендерер сам.
    latex: z.string().min(1),
    caption: z.string().optional(),
})

const ImageBlock = z.object({
    type: z.literal('image'),
    id,
    src: z.string().url(),
    alt: z.string().default(''),
    caption: z.string().optional(),
})

const TableBlock = z.object({
    type: z.literal('table'),
    id,
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    caption: z.string().optional(),
})

// ─── Интерактивные блоки (для worksheet / quiz) ─────────────────────────

const FillBlankBlock = z.object({
    type: z.literal('fill-blank'),
    id,
    // Текст с маркерами `{{1}}`, `{{2}}` — на их место подставляются inputs.
    template: z.string().min(1),
    blanks: z.array(z.object({
        // index должен соответствовать номеру в template ({{1}} → index: 1)
        index: z.number().int().min(1),
        answer: z.string(),
        // Опциональная подсказка для ученика (если включено).
        hint: z.string().optional(),
    })).min(1),
})

const MultipleChoiceBlock = z.object({
    type: z.literal('multiple-choice'),
    id,
    question: z.string().min(1),
    options: z.array(z.object({
        id,
        text: z.string().min(1),
        correct: z.boolean().default(false),
    })).min(2),
    // false → один правильный (radio); true → несколько (checkbox).
    multiple: z.boolean().default(false),
})

const ShortAnswerBlock = z.object({
    type: z.literal('short-answer'),
    id,
    question: z.string().min(1),
    expectedAnswer: z.string().optional(),
    // Подсказка по длине поля для UI.
    expectedLength: z.enum(['short', 'medium', 'long']).default('short'),
})

const MatchingBlock = z.object({
    type: z.literal('matching'),
    id,
    instruction: z.string().min(1),
    left: z.array(z.object({ id, text: z.string().min(1) })).min(2),
    right: z.array(z.object({ id, text: z.string().min(1) })).min(2),
    // Правильные пары [leftId, rightId].
    pairs: z.array(z.tuple([z.string(), z.string()])),
})

// ─── Escape hatch ───────────────────────────────────────────────────────

const HtmlSnippetBlock = z.object({
    type: z.literal('html-snippet'),
    id,
    // Только для редких кейсов. Будет санитайзиться при рендере.
    html: z.string().min(1),
    // Высота не указывается — растёт по контенту.
})

// ─── Vocabulary entry ─────────────────────────────────────────────────
// Словарная статья: иностранное слово + перевод + опц. транскрипция,
// пример, часть речи. Несколько таких блоков подряд = словарь.
const VocabEntryBlock = z.object({
    type: z.literal('vocab-entry'),
    id,
    term: z.string().min(1),
    translation: z.string().min(1),
    transcription: z.string().optional(),
    partOfSpeech: z.string().optional(),
    example: z.string().optional(),
    exampleTranslation: z.string().optional(),
    note: z.string().optional(),
})

// ─── Объединение ────────────────────────────────────────────────────────

export const BlockSchema = z.discriminatedUnion('type', [
    HeadingBlock,
    ParagraphBlock,
    CalloutBlock,
    SpacerBlock,
    MathDisplayBlock,
    ImageBlock,
    TableBlock,
    FillBlankBlock,
    MultipleChoiceBlock,
    ShortAnswerBlock,
    MatchingBlock,
    HtmlSnippetBlock,
    VocabEntryBlock,
])

// ─── Документ ──────────────────────────────────────────────────────────

export const DocumentMeta = z.object({
    subject: z.string().optional(),
    grade: z.string().optional(),
    duration: z.string().optional(),
    studentName: z.string().optional(),
    date: z.string().optional(),
    // Свободные доп-поля (если AI хочет добавить — пусть; не ломает рендер).
    extra: z.record(z.string()).optional(),
})

export const GenerationDocument = z.object({
    schemaVersion: z.literal(1),
    type: z.enum([
        'worksheet', 'quiz', 'lesson_plan', 'vocabulary',
        'lesson_preparation', 'content_adaptation', 'message', 'feedback',
    ]),
    title: z.string().min(1),
    meta: DocumentMeta.default({}),
    blocks: z.array(BlockSchema).min(1),
    // Опциональный ключ ответов учителя — для quiz/worksheet (теневой).
    answers: z.record(z.unknown()).optional(),
})

// ─── Типы ──────────────────────────────────────────────────────────────

export type Block = z.infer<typeof BlockSchema>
export type GenerationDocument = z.infer<typeof GenerationDocument>
export type DocumentMeta = z.infer<typeof DocumentMeta>

// Дискриминатор формата, который кладём в outputData для маршрутизации.
export const JSON_BLOCKS_FORMAT = 'json-blocks-v1' as const

export function isJsonBlocksFormat(outputData: any): boolean {
    return outputData?.format === JSON_BLOCKS_FORMAT && !!outputData?.outputDoc
}
