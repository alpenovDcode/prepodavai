import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { GenerationHelpersService } from '../generation-helpers.service';
import { LessonsService } from '../../lessons/lessons.service';
import { ReplicateService } from '../../replicate/replicate.service';
import { buildWorksheetV2Prompt, WorksheetGenInput } from './worksheet-v2.prompt';
import { GenerationDocument, JSON_BLOCKS_FORMAT, type GenerationDocumentT } from './blocks-schema';

/**
 * Сервис для генерации worksheet в JSON-формате (blocks-v1).
 *
 * Использует тот же путь, что и остальные текстовые генерации:
 *   ReplicateService.createCompletion → google/gemini-3-flash.
 * Это значит общий REPLICATE_API_TOKEN, общая квота, единый pipeline ошибок.
 *
 * Отличие от старого worksheet-flow:
 *   - В промпте требуем строго JSON (никакого markdown / fences).
 *   - Парсим + Zod-валидация, 1 retry с feedback'ом при ошибке.
 *   - Сохраняем в outputData в виде { format: 'json-blocks-v1', outputDoc }.
 *
 * Фронт после успеха сразу открывает DocumentRenderer — никакого polling'а.
 */
@Injectable()
export class WorksheetV2Service {
    private readonly logger = new Logger(WorksheetV2Service.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly generationHelpers: GenerationHelpersService,
        private readonly lessonsService: LessonsService,
        private readonly replicateService: ReplicateService,
    ) {}

    /**
     * Полный цикл генерации worksheet в JSON-формате.
     */
    async generate(userId: string, input: WorksheetGenInput, lessonId?: string) {
        if (!input.topic || !input.topic.trim()) {
            throw new BadRequestException('topic обязателен');
        }

        // 1) Резолвим default-урок, как делает основной createGeneration.
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
            generationType: 'worksheet',
            inputParams: { ...input, _format: JSON_BLOCKS_FORMAT },
            model: 'google/gemini-3-flash',
            lessonId: resolvedLessonId,
        });

        // 2) AI-вызов + Zod, до 2 попыток.
        try {
            const doc = await this.generateAndValidate(input);
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
            this.logger.error(`worksheet-v2 generation failed: ${err?.message}`, err?.stack);
            await this.generationHelpers.failGeneration(
                generationRequest.id,
                err?.message || 'AI generation failed',
            );
            throw new BadRequestException(err?.message || 'AI generation failed');
        }
    }

    private async generateAndValidate(input: WorksheetGenInput): Promise<GenerationDocumentT> {
        const { system, user } = buildWorksheetV2Prompt(input);
        const combinedPrompt = `${system}\n\n${user}`;

        // Первая попытка.
        const first = await this.replicateService.createCompletion(
            combinedPrompt,
            'google/gemini-3-flash',
            { max_tokens: 16384, temperature: 0.4 },
        );
        const validated = this.tryParse(first);
        if (validated.ok === true) return validated.doc;

        this.logger.warn(`worksheet-v2: first attempt invalid, retrying. errors: ${validated.errors}`);
        const retryPrompt = `${combinedPrompt}\n\nПРЕДЫДУЩАЯ ПОПЫТКА НЕ ПРОШЛА ВАЛИДАЦИЮ. ОШИБКИ:\n${validated.errors}\n\nИсправь и верни ТОЛЬКО валидный JSON-объект.`;
        const second = await this.replicateService.createCompletion(
            retryPrompt,
            'google/gemini-3-flash',
            { max_tokens: 16384, temperature: 0.2 },
        );
        const retryValidated = this.tryParse(second);
        if (retryValidated.ok === true) return retryValidated.doc;

        throw new Error(`AI вернул невалидный JSON после повтора: ${retryValidated.errors}`);
    }

    /**
     * Снимает markdown-fences (` ```json ... ``` `), парсит JSON и валидирует Zod-схемой.
     */
    private tryParse(raw: string): { ok: true; doc: GenerationDocumentT } | { ok: false; errors: string } {
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
        try {
            // .parse() с try/catch — в zod 3.x narrowing на safeParse не везде
            // срабатывает корректно в TS-резолюции workspaces (см. issue).
            const doc = GenerationDocument.parse(parsed);
            return { ok: true, doc };
        } catch (e: any) {
            const issues = Array.isArray(e?.issues)
                ? e.issues
                      .slice(0, 10)
                      .map((iss: any) => `  - ${(iss.path || []).join('.')}: ${iss.message}`)
                      .join('\n')
                : e?.message || String(e);
            return { ok: false, errors: issues };
        }
    }
}

/**
 * AI часто оборачивает ответ в ```json ... ``` несмотря на инструкции.
 * Также может добавить text-преамбулу. Достаём только то, что между фигурными скобками.
 */
function stripJsonFences(raw: string): string {
    let s = raw.trim();
    // Code-fence обрамление.
    if (s.startsWith('```')) {
        s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    }
    // Если перед { есть преамбула — режем до первого {.
    const firstBrace = s.indexOf('{');
    const lastBrace = s.lastIndexOf('}');
    if (firstBrace > 0 && lastBrace > firstBrace) {
        s = s.slice(firstBrace, lastBrace + 1);
    }
    return s;
}
