import { z } from 'zod';

/**
 * Backend-зеркало frontend/src/lib/blocks/schema.ts.
 * Любое изменение схемы — синхронизировать с фронтом!
 *
 * Используется для:
 *   1) Валидации ответа AI (json_object → парс → Zod parse).
 *   2) Валидации payload'ов от фронта в PATCH /generate/:id с outputDoc.
 *   3) Сохранения в outputData.outputDoc.
 *
 * Дискриминатор формата: outputData.format === 'json-blocks-v1'.
 */

const id = z.string().min(1);

const HeadingBlock = z.object({
    type: z.literal('heading'),
    id,
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    text: z.string().min(1),
});

const ParagraphBlock = z.object({
    type: z.literal('paragraph'),
    id,
    text: z.string().min(1),
});

const CalloutBlock = z.object({
    type: z.literal('callout'),
    id,
    variant: z.enum(['info', 'warning', 'success', 'tip', 'methodology']),
    title: z.string().optional(),
    text: z.string().min(1),
});

const SpacerBlock = z.object({
    type: z.literal('spacer'),
    id,
    size: z.enum(['sm', 'md', 'lg']).default('md'),
});

const MathDisplayBlock = z.object({
    type: z.literal('math-display'),
    id,
    latex: z.string().min(1),
    caption: z.string().optional(),
});

const ImageBlock = z.object({
    type: z.literal('image'),
    id,
    src: z.string().url(),
    alt: z.string().default(''),
    caption: z.string().optional(),
});

const TableBlock = z.object({
    type: z.literal('table'),
    id,
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    caption: z.string().optional(),
});

const FillBlankBlock = z.object({
    type: z.literal('fill-blank'),
    id,
    template: z.string().min(1),
    blanks: z.array(z.object({
        index: z.number().int().min(1),
        answer: z.string(),
        hint: z.string().optional(),
    })).min(1),
});

const MultipleChoiceBlock = z.object({
    type: z.literal('multiple-choice'),
    id,
    question: z.string().min(1),
    options: z.array(z.object({
        id,
        text: z.string().min(1),
        correct: z.boolean().default(false),
    })).min(2),
    multiple: z.boolean().default(false),
});

const ShortAnswerBlock = z.object({
    type: z.literal('short-answer'),
    id,
    question: z.string().min(1),
    expectedAnswer: z.string().optional(),
    expectedLength: z.enum(['short', 'medium', 'long']).default('short'),
});

const MatchingBlock = z.object({
    type: z.literal('matching'),
    id,
    instruction: z.string().min(1),
    left: z.array(z.object({ id, text: z.string().min(1) })).min(2),
    right: z.array(z.object({ id, text: z.string().min(1) })).min(2),
    pairs: z.array(z.tuple([z.string(), z.string()])),
});

const HtmlSnippetBlock = z.object({
    type: z.literal('html-snippet'),
    id,
    html: z.string().min(1),
});

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
]);

export const DocumentMeta = z.object({
    subject: z.string().optional(),
    grade: z.string().optional(),
    duration: z.string().optional(),
    studentName: z.string().optional(),
    date: z.string().optional(),
    extra: z.record(z.string()).optional(),
});

export const GenerationDocument = z.object({
    schemaVersion: z.literal(1),
    type: z.enum([
        'worksheet', 'quiz', 'lesson_plan', 'vocabulary',
        'lesson_preparation', 'content_adaptation', 'message', 'feedback',
    ]),
    title: z.string().min(1),
    meta: DocumentMeta.default({}),
    blocks: z.array(BlockSchema).min(1),
    answers: z.record(z.unknown()).optional(),
});

export type GenerationDocumentT = z.infer<typeof GenerationDocument>;
export type BlockT = z.infer<typeof BlockSchema>;

export const JSON_BLOCKS_FORMAT = 'json-blocks-v1' as const;
