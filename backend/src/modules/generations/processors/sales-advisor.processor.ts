import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GenerationHelpersService } from '../generation-helpers.service';
import { LOGO_BASE64 } from '../generations.service';

export interface SalesAdvisorJobData {
    generationRequestId: string;
    imageHashes: string[];
    imageUrls: string[]; // Public URLs of the uploaded screenshots (up to 6)
}

@Processor('sales-advisor')
export class SalesAdvisorProcessor extends WorkerHost {
    private readonly logger = new Logger(SalesAdvisorProcessor.name);
    private readonly replicateToken: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly generationHelpers: GenerationHelpersService,
    ) {
        super();
        this.replicateToken = this.configService.get<string>('REPLICATE_API_TOKEN');
    }

    async process(job: Job<SalesAdvisorJobData>): Promise<void> {
        const { generationRequestId, imageUrls } = job.data;
        const imageCount = imageUrls.length;
        this.logger.log(`Processing Sales Advisor analysis for ${generationRequestId} with ${imageCount} image(s)`);

        try {
            // 1. Update progress
            await this.generationHelpers.updateProgress(generationRequestId, {
                percent: 10,
                message: `Анализ ${imageCount} скриншот(ов) диалога...`
            });

            // 2. Analyze dialog using Claude Vision
            const analysis = await this.analyzeDialog(imageUrls);

            await this.generationHelpers.updateProgress(generationRequestId, {
                percent: 80,
                message: 'Формирование рекомендаций...'
            });

            // 3. Format result to HTML
            const htmlResult = this.formatToHtml(analysis);

            // 4. Complete generation
            await this.generationHelpers.completeGeneration(generationRequestId, {
                htmlResult,
                sections: [
                    { title: 'Анализ и рекомендации', content: analysis }
                ]
            });

            this.logger.log(`Sales Advisor analysis completed for ${generationRequestId}`);

        } catch (error: any) {
            this.logger.error(`Sales Advisor analysis failed: ${error.message}`, error.stack);
            await this.generationHelpers.failGeneration(generationRequestId, error.message);
            throw error;
        }
    }

    private async analyzeDialog(imageUrls: string[]): Promise<string> {
        const imageCount = imageUrls.length;
        const systemPrompt = `Ты — опытный директор по продажам и эксперт по переговорам в EdTech индустрии.

Твоя задача — провести профессиональный анализ диалога между менеджером и потенциальным клиентом, выявить ошибки, возражения и дать конкретные рекомендации для закрытия сделки.

ТВОЙ ПОДХОД:
- Используй фреймворки продаж: SPIN, BANT, Challenger Sale
- Анализируй психологию клиента и его истинные потребности
- Выявляй скрытые возражения за словами
- Даешь конкретные, готовые к использованию формулировки

ФОРМАТ ОТВЕТА (HTML):
Используй теги <h3>, <h4>, <ul>, <li>, <strong>, <em> для структурирования.
НЕ используй теги <html>, <head>, <body> — только содержимое.
Используй эмодзи для визуальной привлекательности.`;

        const userPrompt = imageCount > 1
            ? `Проанализируй ${imageCount} скриншота диалога с клиентом (они идут в хронологическом порядке) и предоставь детальный разбор ВСЕГО диалога целиком.`
            : `Проанализируй скриншот диалога с клиентом и предоставь детальный разбор.

СТРУКТУРА АНАЛИЗА:

<h3>📊 Общая оценка диалога</h3>
- Краткая оценка качества ведения переговоров (1-10)
- Ключевые сильные и слабые стороны менеджера

<h3>✅ Что сделано хорошо</h3>
- Конкретные примеры удачных фраз и техник
- Что стоит повторять в будущем

<h3>❌ Критические ошибки</h3>
- Что НЕ нужно было говорить/делать
- Упущенные возможности

<h3>🎯 Анализ возражений клиента</h3>
- Какие возражения были озвучены
- Истинные причины возражений (что стоит за словами)
- Как правильно было бы отработать каждое возражение

<h3>💡 Конкретные рекомендации</h3>
- Готовые фразы для следующего контакта
- Стратегия дальнейшей работы с этим клиентом
- Что изменить в подходе

ВАЖНО:
- Будь конкретным, избегай общих фраз
- Давай готовые формулировки, а не советы "типа напиши о..."
- Учитывай специфику EdTech (родители, ученики, преподаватели)`;

        return this.runReplicatePredictionWithMultipleImages(imageUrls, userPrompt, systemPrompt);
    }

    /**
     * Run Replicate prediction with support for multiple images
     * Uses Messages API format with base64 encoded images
     */
    private async runReplicatePredictionWithMultipleImages(
        imageUrls: string[],
        userPrompt: string,
        systemPrompt: string
    ): Promise<string> {
        try {
            this.logger.log(`Analyzing ${imageUrls.length} image(s) using Replicate Claude API`);

            // For single image, use simple format
            if (imageUrls.length === 1) {
                return this.runReplicatePrediction('anthropic/claude-3.5-sonnet', {
                    prompt: userPrompt,
                    system_prompt: systemPrompt,
                    max_tokens: 3000,
                    image: imageUrls[0],
                });
            }

            // For multiple images, we need to download them and convert to base64
            // Then use Messages API format
            this.logger.log(`Downloading and converting ${imageUrls.length} images to base64...`);

            const imageBase64Data: Array<{ type: string; source: { type: string; media_type: string; data: string } }> = [];

            for (let i = 0; i < imageUrls.length; i++) {
                const imageUrl = imageUrls[i];
                this.logger.log(`Downloading image ${i + 1}/${imageUrls.length}: ${imageUrl}`);

                try {
                    // Download image
                    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                    const buffer = Buffer.from(response.data);
                    const base64 = buffer.toString('base64');

                    // Determine media type from content-type header or default to jpeg
                    const contentType = response.headers['content-type'] || 'image/jpeg';

                    imageBase64Data.push({
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: contentType,
                            data: base64
                        }
                    });

                    this.logger.log(`Image ${i + 1} converted to base64 (${Math.round(base64.length / 1024)}KB)`);
                } catch (error) {
                    this.logger.error(`Failed to download image ${i + 1}: ${error.message}`);
                    throw new Error(`Failed to download image ${i + 1}: ${error.message}`);
                }
            }

            // Construct messages array with text prompt and all images
            const messages = [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: userPrompt },
                        ...imageBase64Data
                    ]
                }
            ];

            this.logger.log(`Sending request to Replicate with ${imageUrls.length} images using Messages API format`);

            // Use Messages API format
            return this.runReplicatePredictionWithMessages('anthropic/claude-3.5-sonnet', {
                messages: messages,
                system: systemPrompt,
                max_tokens: 3000,
            });
        } catch (error: any) {
            this.logger.error(`Error in runReplicatePredictionWithMultipleImages: ${error.message}`);
            throw error;
        }
    }

    /**
     * Run Replicate prediction using Messages API format
     */
    private async runReplicatePredictionWithMessages(model: string, input: any): Promise<string> {
        try {
            const response = await axios.post(
                `https://api.replicate.com/v1/models/${model}/predictions`,
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

            // Poll for completion
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
            this.logger.error(`Replicate Messages API Error: ${error.message}`);
            throw error;
        }
    }

    private async runReplicatePrediction(model: string, input: any): Promise<string> {
        try {
            const response = await axios.post(
                `https://api.replicate.com/v1/models/${model}/predictions`,
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

            // Poll for completion
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

    private formatToHtml(analysis: string): string {
        return `
        <div class="sales-advisor-result" style="font-family: sans-serif; max-width: 900px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #FF7E58; padding-bottom: 20px;">
                <img src="${LOGO_BASE64}" alt="Logo" style="max-height: 80px;" />
                <h2 style="color: #2d3748; margin-top: 15px;">ИИ-Продажник: Анализ диалога</h2>
            </div>
            
            <div style="line-height: 1.6; color: #333;">
                ${analysis}
            </div>

            <div style="text-align: center; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
                <img src="${LOGO_BASE64}" alt="Logo" style="max-height: 50px; opacity: 0.7;" />
                <p style="font-size: 12px; color: #888; margin-top: 10px;">Сгенерировано PrepodavAI</p>
            </div>
        </div>
        `;
    }
}
