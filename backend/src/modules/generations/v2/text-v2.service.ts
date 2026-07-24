import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
    extractTaskRange,
    replaceTaskRange,
    reassignBlockIds,
    collectIds,
    parseBlocksArray,
    type RawBlock,
} from './regenerate-task.util';
import { GenerationHelpersService } from '../generation-helpers.service';
import { LessonsService } from '../../lessons/lessons.service';
import { ReplicateService } from '../../replicate/replicate.service';
import {
    buildWorksheetPrompt, WorksheetGenInput,
    buildQuizPrompt, QuizGenInput,
    buildLessonPlanPrompt, LessonPlanGenInput,
    buildVocabularyPrompt, VocabularyGenInput,
    buildLessonPreparationPrompt, LessonPreparationGenInput,
} from './prompts';
import { GenerationDocument, JSON_BLOCKS_FORMAT, type GenerationDocumentT } from './blocks-schema';
import {
    validateBlocksContent,
    fixBlocksContent,
    formatContentIssues,
    sanitizeRawBlocks,
    type ContentIssue,
} from './blocks-content-validator';

/**
 * Универсальный сервис генерации в JSON-формате blocks-v1 для всех
 * текстовых типов: worksheet, quiz, lesson_plan, vocabulary, lesson_preparation.
 *
 * Один pipeline:
 *   1) builder промпта по типу
 *   2) Replicate (Gemini 3 Flash) с json-инструкциями
 *   3) Zod-валидация + 1 retry с feedback'ом ошибок
 *   4) Сохранение в outputData в виде { format, outputDoc }
 *
 * Прежний WorksheetV2Service — частный случай, оставлен для обратной
 * совместимости (routes: POST /generate/v2/worksheet).
 */
@Injectable()
export class TextV2Service {
    private readonly logger = new Logger(TextV2Service.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly generationHelpers: GenerationHelpersService,
        private readonly lessonsService: LessonsService,
        private readonly replicateService: ReplicateService,
    ) {}

    async generateWorksheet(userId: string, input: WorksheetGenInput, lessonId?: string) {
        return this.run(userId, 'worksheet', input, lessonId, buildWorksheetPrompt(input), {
            expectedTaskCount: input.numTasks,
        });
    }
    async generateQuiz(userId: string, input: QuizGenInput, lessonId?: string) {
        return this.run(userId, 'quiz', input, lessonId, buildQuizPrompt(input));
    }
    async generateLessonPlan(userId: string, input: LessonPlanGenInput, lessonId?: string) {
        return this.run(userId, 'lesson-plan', input, lessonId, buildLessonPlanPrompt(input));
    }
    async generateVocabulary(userId: string, input: VocabularyGenInput, lessonId?: string) {
        return this.run(userId, 'vocabulary', input, lessonId, buildVocabularyPrompt(input));
    }
    async generateLessonPreparation(userId: string, input: LessonPreparationGenInput, lessonId?: string) {
        return this.run(userId, 'lesson_preparation', input, lessonId, buildLessonPreparationPrompt(input));
    }

    private async run(
        userId: string,
        generationType: string,
        input: Record<string, any>,
        lessonId: string | undefined,
        prompt: { system: string; user: string },
        validateOpts: { expectedTaskCount?: number } = {},
    ) {
        const topic = input?.topic;
        if (!topic || typeof topic !== 'string' || !topic.trim()) {
            throw new BadRequestException('topic обязателен');
        }

        let resolvedLessonId = lessonId;
        if (!resolvedLessonId) {
            try {
                const def = await this.lessonsService.findOrCreateDefaultLesson(userId);
                resolvedLessonId = def.id;
            } catch (e: any) {
                this.logger.warn(`default lesson resolve failed: ${e?.message}`);
            }
        }

        const { generationRequest, userGeneration } = await this.generationHelpers.createGeneration({
            userId,
            generationType,
            inputParams: { ...input, _format: JSON_BLOCKS_FORMAT },
            model: 'meta/llama-4-maverick-instruct',
            lessonId: resolvedLessonId,
        });

        try {
            const doc = await this.generateAndValidate(prompt, validateOpts);
            const outputData = { format: JSON_BLOCKS_FORMAT, outputDoc: doc };
            await this.generationHelpers.completeGeneration(generationRequest.id, outputData);

            return {
                success: true,
                generationId: userGeneration.id,
                generationRequestId: generationRequest.id,
                status: 'completed',
                format: JSON_BLOCKS_FORMAT,
                outputDoc: doc,
            };
        } catch (err: any) {
            this.logger.error(`v2 ${generationType} generation failed: ${err?.message}`, err?.stack);
            await this.generationHelpers.failGeneration(
                generationRequest.id,
                err?.message || 'AI generation failed',
            );
            throw new BadRequestException(err?.message || 'AI generation failed');
        }
    }

    private async generateAndValidate(
        prompt: { system: string; user: string },
        validateOpts: { expectedTaskCount?: number } = {},
    ): Promise<GenerationDocumentT> {
        const combinedPrompt = `${prompt.system}\n\n${prompt.user}`;
        const first = await this.replicateService.createCompletion(
            combinedPrompt,
            'meta/llama-4-maverick-instruct',
            { max_tokens: 16384, temperature: 0.4 },
        );
        const validated = this.tryParseAndValidate(first, validateOpts);
        if (validated.ok === true) return validated.doc;

        this.logger.warn(`v2: first attempt invalid, retrying. errors: ${validated.errors}`);
        const retryPrompt = `${combinedPrompt}\n\nПРЕДЫДУЩАЯ ПОПЫТКА НЕ ПРОШЛА ВАЛИДАЦИЮ. ОШИБКИ:\n${validated.errors}\n\nИсправь и верни ТОЛЬКО валидный JSON-объект.`;
        const second = await this.replicateService.createCompletion(
            retryPrompt,
            'meta/llama-4-maverick-instruct',
            { max_tokens: 16384, temperature: 0.2 },
        );
        const retryValidated = this.tryParseAndValidate(second, validateOpts);
        if (retryValidated.ok === true) return retryValidated.doc;

        // Last-resort auto-fix: если JSON+Zod прошли, но контент всё ещё нарушает
        // правила формул — программно чиним $..{{N}}..$ → $..$ {{N}} $..$
        // (стратегия A в blocks-content-validator.ts).
        // ВАЖНО: счётчик заданий валидируем БЕЗ expectedTaskCount — недобор
        // заданий мы автоматически починить не можем (новые задания LLM-only),
        // так что отдаём что есть, чтобы пользователь не получил 500.
        const fallbackDoc = retryValidated.doc ?? validated.doc;
        if (fallbackDoc) {
            this.logger.warn(
                `v2: applying deterministic auto-fix after retry. content issues remained: ${retryValidated.errors}`,
            );
            const fixed = fixBlocksContent(fallbackDoc);
            const residual = validateBlocksContent(fixed);
            if (residual.length === 0) return fixed;
            this.logger.error(
                `v2: auto-fix did not remove all issues: ${formatContentIssues(residual)}`,
            );
            return fixed;
        }

        throw new Error(`AI вернул невалидный JSON после повтора: ${retryValidated.errors}`);
    }

    private tryParseAndValidate(
        raw: string,
        validateOpts: { expectedTaskCount?: number } = {},
    ): { ok: true; doc: GenerationDocumentT } | { ok: false; errors: string; doc?: GenerationDocumentT } {
        const cleaned = stripJsonFences(raw);
        let parsed: unknown;
        try {
            parsed = JSON.parse(cleaned);
        } catch (e: any) {
            return {
                ok: false,
                errors: `Невалидный JSON: ${e?.message}. Начало ответа: ${cleaned.slice(0, 200)}`,
            };
        }
        // Детерминированная чистка пустых блоков-пустышек (напр. math-display
        // с пустым latex) ДО Zod: иначе min(1) роняет всю генерацию.
        parsed = sanitizeRawBlocks(parsed);
        let doc: GenerationDocumentT;
        try {
            doc = GenerationDocument.parse(parsed);
        } catch (e: any) {
            const issues = Array.isArray(e?.issues)
                ? e.issues
                      .slice(0, 10)
                      .map((iss: any) => `  - ${(iss.path || []).join('.')}: ${iss.message}`)
                      .join('\n')
                : e?.message || String(e);
            return { ok: false, errors: issues };
        }
        const contentIssues: ContentIssue[] = validateBlocksContent(doc, validateOpts);
        if (contentIssues.length > 0) {
            return {
                ok: false,
                errors: `Нарушения контент-валидации:\n${formatContentIssues(contentIssues)}`,
                doc,
            };
        }
        return { ok: true, doc };
    }

    /**
     * Перегенерирует ОДНО задание в существующем blocks-v1 документе.
     * Заголовок задания («Задание N» / «Вопрос N») сохраняем — меняем только
     * тело (условие + интерактивный блок). Так номер задания не сбивается,
     * а остальные задания остаются нетронутыми.
     */
    async regenerateTask(userId: string, generationId: string, headingId: string) {
        let gen = await this.prisma.userGeneration.findUnique({ where: { id: generationId } });
        if (!gen) {
            gen = await this.prisma.userGeneration.findUnique({
                where: { generationRequestId: generationId },
            });
        }
        if (!gen) throw new NotFoundException('Генерация не найдена');
        if (gen.userId !== userId) throw new ForbiddenException('Доступ запрещён');

        const output = (gen.outputData as any) ?? {};
        if (output.format !== JSON_BLOCKS_FORMAT || !output.outputDoc?.blocks) {
            throw new BadRequestException('Этот материал не поддерживает перегенерацию задания');
        }
        const doc = output.outputDoc as GenerationDocumentT;
        const blocks = doc.blocks as RawBlock[];

        const range = extractTaskRange(blocks, headingId);
        if (!range) throw new BadRequestException('Задание не найдено');

        const heading = blocks[range.start];
        const bodyBlocks = blocks.slice(range.start + 1, range.end + 1);

        const prompt = buildRegenerateBodyPrompt(doc, heading, bodyBlocks);
        const raw = await this.replicateService.createCompletion(
            prompt,
            'meta/llama-4-maverick-instruct',
            { max_tokens: 4096, temperature: 0.6 },
        );

        const parsed = parseBlocksArray(raw).filter(
            (b) => b && typeof b.type === 'string' && b.type !== 'heading',
        );
        if (parsed.length === 0) {
            this.logger.warn(
                `regenerateTask: не распарсил тело. raw[0..500]: ${String(raw).slice(0, 500)}`,
            );
            throw new BadRequestException('ИИ вернул пустой результат. Попробуйте ещё раз.');
        }

        // Тело меняем: [range.start+1 .. range.end] → новые блоки (heading сохраняем).
        const newBody = reassignBlockIds(parsed, collectIds(blocks));
        const merged = replaceTaskRange(blocks, range.start + 1, range.end, newBody);
        const nextDoc = { ...doc, blocks: merged };

        // Валидируем ВЕСЬ документ Zod'ом ДО сохранения — если LLM вернул мусор,
        // не портим сохранённый материал, а просим повторить.
        let validDoc: GenerationDocumentT;
        try {
            validDoc = GenerationDocument.parse(nextDoc);
        } catch {
            throw new BadRequestException('Не удалось собрать новое задание. Попробуйте ещё раз.');
        }

        const issues = validateBlocksContent(validDoc);
        const finalDoc = issues.length > 0 ? fixBlocksContent(validDoc) : validDoc;

        const newOutput = { ...output, outputDoc: finalDoc };
        await this.prisma.userGeneration.update({
            where: { id: gen.id },
            data: { outputData: newOutput },
        });
        if (gen.generationRequestId) {
            await this.prisma.generationRequest
                .update({ where: { id: gen.generationRequestId }, data: { result: newOutput } })
                .catch(() => undefined);
        }

        return { success: true as const, outputDoc: finalDoc };
    }
}

/** Промпт на перегенерацию тела одного задания (без heading-заголовка). */
function buildRegenerateBodyPrompt(
    doc: GenerationDocumentT,
    heading: RawBlock,
    bodyBlocks: RawBlock[],
): string {
    const meta = (doc as any).meta ?? {};
    const kind = doc.type === 'quiz' ? 'вопрос теста' : 'задание рабочего листа';
    return `Ты — методист. Есть ${kind} по теме "${doc.title}"${meta.subject ? `, предмет: ${meta.subject}` : ''}${meta.grade ? `, класс: ${meta.grade}` : ''}.

Заголовок задания (НЕ меняй его, он останется как есть): "${heading.text ?? ''}"

Текущее ТЕЛО задания (JSON-блоки схемы blocks-v1):
${JSON.stringify(bodyBlocks, null, 0)}

Сгенерируй ДРУГОЙ вариант ЭТОГО ЖЕ задания: та же подтема и те же типы блоков, что сейчас (${bodyBlocks.map((b) => b.type).join(', ') || 'paragraph + интерактивный блок'}), но с НОВОЙ формулировкой, другими числами/вариантами.

ТРЕБОВАНИЯ:
- Верни ТОЛЬКО JSON-МАССИВ блоков тела (без heading-заголовка). Начни с [ и закончи ].
- Формулы — в LaTeX внутри $...$, двойной обратный слэш в JSON (\\\\cdot, \\\\frac).
- НЕ вставляй маркер {{N}} внутрь формулы $...$.
- Проставляй правильные ответы: correct:true у верного варианта multiple-choice, expectedAnswer у short-answer, answer у fill-blank.
- Без markdown, без комментариев, без \`\`\`. Только JSON-массив.`;
}


function stripJsonFences(raw: string): string {
    let s = raw.trim();
    if (s.startsWith('```')) {
        s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    }
    const firstBrace = s.indexOf('{');
    const lastBrace = s.lastIndexOf('}');
    if (firstBrace > 0 && lastBrace > firstBrace) {
        s = s.slice(firstBrace, lastBrace + 1);
    }
    return s;
}
