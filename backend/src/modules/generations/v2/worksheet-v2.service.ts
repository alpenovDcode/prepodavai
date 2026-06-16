import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { GenerationHelpersService } from '../generation-helpers.service';
import { LessonsService } from '../../lessons/lessons.service';
import { buildWorksheetV2Prompt, WorksheetGenInput } from './worksheet-v2.prompt';
import { GenerationDocument, JSON_BLOCKS_FORMAT, type GenerationDocumentT } from './blocks-schema';

/**
 * Сервис для генерации worksheet в JSON-формате (blocks-v1).
 *
 * Отличия от старого пайплайна:
 *   - Синхронный AI-вызов (не через n8n webhook).
 *   - Прямой OpenAI client с json_object режимом.
 *   - Zod-валидация ответа + 1 retry с feedback при ошибке.
 *   - Сохраняем в outputData как { format: 'json-blocks-v1', outputDoc: <doc> }.
 *
 * При успешной валидации возвращаем id генерации — фронт сразу
 * открывает превью без polling'а статуса.
 */
@Injectable()
export class WorksheetV2Service {
    private readonly logger = new Logger(WorksheetV2Service.name);
    private openai: OpenAI | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
        private readonly generationHelpers: GenerationHelpersService,
        private readonly lessonsService: LessonsService,
    ) {}

    private getClient(): OpenAI {
        if (this.openai) return this.openai;
        const apiKey = this.configService.get<string>('OPENAI_API_KEY');
        if (!apiKey) {
            throw new InternalServerErrorException('OPENAI_API_KEY не настроен');
        }
        this.openai = new OpenAI({ apiKey });
        return this.openai;
    }

    /**
     * Полный цикл генерации worksheet в JSON-формате.
     */
    async generate(userId: string, input: WorksheetGenInput, lessonId?: string) {
        if (!input.topic || !input.topic.trim()) {
            throw new BadRequestException('topic обязателен');
        }

        // 1) Подготовка БД-записей (как в createGeneration основного сервиса)
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
            model: 'gpt-4o-mini',
            lessonId: resolvedLessonId,
        });

        // 2) AI-вызов с retry на validation-fail
        try {
            const doc = await this.generateAndValidate(input);

            // 3) Сохранение в outputData в специальной обёртке для маршрутизации.
            //    Параллельно дублируем outputDoc в generationRequest.result как backup.
            const outputData = {
                format: JSON_BLOCKS_FORMAT,
                outputDoc: doc,
            };
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

    /**
     * AI-вызов + Zod валидация + 1 retry с feedback.
     */
    private async generateAndValidate(input: WorksheetGenInput): Promise<GenerationDocumentT> {
        const { system, user } = buildWorksheetV2Prompt(input);
        const client = this.getClient();

        // Первая попытка.
        const first = await this.callAi(client, system, user);
        const validated = this.tryParse(first);
        if (validated.ok === true) return validated.doc;

        const firstErrors = validated.errors;
        // Retry с feedback об ошибках валидации.
        this.logger.warn(`worksheet-v2: first AI response invalid, retrying. errors: ${firstErrors}`);
        const retryUser = `${user}\n\nПРЕДЫДУЩАЯ ПОПЫТКА НЕ ПРОШЛА ВАЛИДАЦИЮ:\n${firstErrors}\n\nИсправь ошибки и верни валидный JSON.`;
        const second = await this.callAi(client, system, retryUser);
        const retryValidated = this.tryParse(second);
        if (retryValidated.ok === true) return retryValidated.doc;

        throw new Error(`AI returned invalid JSON after retry: ${retryValidated.errors}`);
    }

    private async callAi(client: OpenAI, system: string, user: string): Promise<string> {
        const completion = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
            ],
            temperature: 0.7,
            max_tokens: 4000,
        });
        const text = completion.choices[0]?.message?.content || '';
        if (!text.trim()) throw new Error('AI returned empty response');
        return text;
    }

    private tryParse(raw: string): { ok: true; doc: GenerationDocumentT } | { ok: false; errors: string } {
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch (e: any) {
            return { ok: false, errors: `Invalid JSON: ${e?.message}` };
        }
        const result = GenerationDocument.safeParse(parsed);
        if (!result.success) {
            // Сжатый формат ошибок для feedback'а в retry-промпт.
            const issues = result.error.issues
                .slice(0, 10)
                .map((iss) => `  - ${iss.path.join('.')}: ${iss.message}`)
                .join('\n');
            return { ok: false, errors: issues };
        }
        return { ok: true, doc: result.data };
    }
}
