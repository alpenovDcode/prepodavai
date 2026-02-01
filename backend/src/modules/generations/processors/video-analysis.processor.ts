
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GenerationHelpersService } from '../generation-helpers.service';
import { AssemblyAiService } from '../../integrations/assemblyai.service';

export interface VideoAnalysisJobData {
    generationRequestId: string;
    videoHash: string;
    videoUrl: string; // Public URL resolved by service
    analysisType: 'sales' | 'methodological'; // 'sales' or 'methodological'
}

@Processor('video-analysis')
export class VideoAnalysisProcessor extends WorkerHost {
    private readonly logger = new Logger(VideoAnalysisProcessor.name);
    private readonly replicateToken: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly generationHelpers: GenerationHelpersService,
        private readonly assemblyAiService: AssemblyAiService,
    ) {
        super();
        this.replicateToken = this.configService.get<string>('REPLICATE_API_TOKEN');
    }

    async process(job: Job<VideoAnalysisJobData>): Promise<void> {
        const { generationRequestId, videoUrl, analysisType } = job.data;
        this.logger.log(`Processing Video Analysis for ${generationRequestId} (${analysisType})`);

        try {
            // 1. Transcribe Video
            this.logger.log(`Starting transcription for ${videoUrl}`);
            await this.generationHelpers.updateProgress(generationRequestId, {
                percent: 10,
                message: 'Транскрибация видео...'
            });

            const transcript = await this.assemblyAiService.transcribeFile(videoUrl);
            this.logger.log(`Transcription completed. Length: ${transcript.length}`);

            await this.generationHelpers.updateProgress(generationRequestId, {
                percent: 40,
                message: 'Анализ текста...'
            });

            // 2. Generate Analysis via Replicate
            const analysis = await this.generateAnalysis(transcript, analysisType);

            // 3. Format Result
            const htmlResult = `
                <div class="video-analysis-result">
                    <h2>Видео Разбор (${analysisType === 'sales' ? 'Продажи' : 'Методический'})</h2>
                    <div class="analysis-content">
                        ${analysis}
                    </div>
                    <details>
                        <summary>Транскрипция (Сырой текст)</summary>
                        <pre style="white-space: pre-wrap; background: #f5f5f5; padding: 10px; border-radius: 5px; font-size: 0.8em;">${transcript}</pre>
                    </details>
                </div>
            `;

            // 4. Complete
            await this.generationHelpers.completeGeneration(generationRequestId, {
                htmlResult,
                sections: [
                    { title: 'Анализ', content: analysis },
                    { title: 'Транскрипция', content: transcript }
                ]
            });

        } catch (error: any) {
            this.logger.error(`Video Analysis failed: ${error.message}`, error.stack);
            await this.generationHelpers.failGeneration(generationRequestId, error.message);
            throw error;
        }
    }

    private async generateAnalysis(transcript: string, type: 'sales' | 'methodological'): Promise<string> {
        const systemPrompt = type === 'sales'
            ? "Ты эксперт по продажам в онлайн-образовании. Твоя цель — проанализировать транскрипцию пробного урока и дать рекомендации по увеличению конверсии в покупку."
            : "Ты эксперт-методист. Твоя цель — проанализировать транскрипцию урока с точки зрения педагогического дизайна, структуры занятия и взаимодействия учитель-ученик.";

        const userPrompt = `
Проанализируй следующую транскрипцию видео-урока.

ТИП АНАЛИЗА: ${type === 'sales' ? 'ПРОДАЖА (Фокус на конверсию)' : 'МЕТОДИЧЕСКИЙ (Фокус на структуру и педагогику)'}

${type === 'sales' ? `
КРИТЕРИИ АНАЛИЗА:
1. Установление контакта и выявление потребностей.
2. Презентация ценности продукта/уроков.
3. Работа с возражениями и страхами ученика.
4. Призыв к действию (Close).
5. Общие ошибки в коммуникации, мешающие продаже.
` : `
КРИТЕРИИ АНАЛИЗА:
1. Структура урока (Введение, Основная часть, Заключение).
2. Качество объяснения материала.
3. Вовлечение ученика и интерактивность.
4. Тайминг и темп речи.
5. Правильность выбранной роли учителя.
`}

ФОРМАТ ВЫВОДА:
Верни ответ в формате HTML (без markdown-оберток).
Используй заголовки <h3>, маркированные списки <ul>, выделение жирным <strong>.
Будь конкретен, приводи примеры цитат из текста и предлагай улучшения.
Тон: Профессиональный, конструктивный, поддерживающий.

ТРАНСКРИПЦИЯ:
${transcript.substring(0, 25000)} {/* Truncate to avoid context limit issues if massive */}
`;

        return this.runReplicatePrediction('anthropic/claude-3.5-sonnet', {
            system_prompt: systemPrompt,
            prompt: userPrompt,
            max_tokens: 3000
        });
    }

    private async runReplicatePrediction(version: string, input: any): Promise<string> {
        // Re-using logic similar to LessonPreparationProcessor
        // Ideally this should be in a shared service, but for now copying is safer than refactoring the massive service
        try {
            const response = await axios.post(
                'https://api.replicate.com/v1/models/anthropic/claude-3.5-sonnet/predictions',
                {
                    input: input,
                    stream: false
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.replicateToken}`,
                        'Content-Type': 'application/json',
                    }
                }
            );

            let prediction = response.data;
            const predictionId = prediction.id;

            // Poll
            while (['starting', 'processing'].includes(prediction.status)) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const statusRes = await axios.get(
                    `https://api.replicate.com/v1/predictions/${predictionId}`,
                    {
                        headers: { 'Authorization': `Bearer ${this.replicateToken}` }
                    }
                );
                prediction = statusRes.data;
            }

            if (prediction.status === 'succeeded') {
                return Array.isArray(prediction.output) ? prediction.output.join('') : prediction.output;
            } else {
                throw new Error(`Replicate failed: ${prediction.error}`);
            }
        } catch (error: any) {
            this.logger.error(`Replicate API Error: ${error.message}`);
            throw error;
        }
    }
}
