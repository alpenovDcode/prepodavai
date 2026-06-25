import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
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
        return this.run(userId, 'worksheet', input, lessonId, buildWorksheetPrompt(input));
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
            const doc = await this.generateAndValidate(prompt);
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

    private async generateAndValidate(prompt: { system: string; user: string }): Promise<GenerationDocumentT> {
        const combinedPrompt = `${prompt.system}\n\n${prompt.user}`;
        const first = await this.replicateService.createCompletion(
            combinedPrompt,
            'meta/llama-4-maverick-instruct',
            { max_tokens: 16384, temperature: 0.4 },
        );
        const validated = this.tryParseAndValidate(first);
        if (validated.ok === true) return validated.doc;

        this.logger.warn(`v2: first attempt invalid, retrying. errors: ${validated.errors}`);
        const retryPrompt = `${combinedPrompt}\n\nПРЕДЫДУЩАЯ ПОПЫТКА НЕ ПРОШЛА ВАЛИДАЦИЮ. ОШИБКИ:\n${validated.errors}\n\nИсправь и верни ТОЛЬКО валидный JSON-объект.`;
        const second = await this.replicateService.createCompletion(
            retryPrompt,
            'meta/llama-4-maverick-instruct',
            { max_tokens: 16384, temperature: 0.2 },
        );
        const retryValidated = this.tryParseAndValidate(second);
        if (retryValidated.ok === true) return retryValidated.doc;

        // Last-resort auto-fix: если JSON+Zod прошли, но контент всё ещё нарушает
        // правила формул — программно чиним $..{{N}}..$ → $..$ {{N}} $..$
        // (стратегия A в blocks-content-validator.ts).
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
            // Возвращаем починенный док всё равно — это лучше, чем сырой LaTeX
            // в UI. Оставшиеся «швы» рендерятся клиентским фолбэком (Math.tsx).
            return fixed;
        }

        throw new Error(`AI вернул невалидный JSON после повтора: ${retryValidated.errors}`);
    }

    private tryParseAndValidate(
        raw: string,
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
        const contentIssues: ContentIssue[] = validateBlocksContent(doc);
        if (contentIssues.length > 0) {
            return {
                ok: false,
                errors: `Нарушения правил формул:\n${formatContentIssues(contentIssues)}`,
                doc,
            };
        }
        return { ok: true, doc };
    }
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
