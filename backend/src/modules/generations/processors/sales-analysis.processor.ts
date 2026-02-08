
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GenerationHelpersService } from '../generation-helpers.service';
import { LOGO_BASE64 } from '../generations.service';

export interface SalesAnalysisJobData {
    generationRequestId: string;
    imageUrl: string; // Public URL resolved by service
}

@Processor('sales-analysis')
export class SalesAnalysisProcessor extends WorkerHost {
    private readonly logger = new Logger(SalesAnalysisProcessor.name);
    private readonly replicateToken: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly generationHelpers: GenerationHelpersService,
    ) {
        super();
        this.replicateToken = this.configService.get<string>('REPLICATE_API_TOKEN');
    }

    async process(job: Job<SalesAnalysisJobData>): Promise<void> {
        const { generationRequestId, imageUrl } = job.data;
        this.logger.log(`Processing Sales Analysis for ${generationRequestId}`);

        try {
            await this.generationHelpers.updateProgress(generationRequestId, {
                percent: 10,
                message: 'Анализ скриншота...'
            });

            // 1. Generate Analysis via Replicate
            const analysis = await this.generateAnalysis(imageUrl);

            // 2. Format Result with Logo
            const htmlResult = `
                <div class="sales-analysis-result" style="font-family: sans-serif; max-width: 800px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <img src="${LOGO_BASE64}" alt="Logo" style="max-height: 80px;" />
                    </div>
                    
                    ${analysis}

                    <div style="text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
                        <img src="${LOGO_BASE64}" alt="Logo" style="max-height: 50px; opacity: 0.7;" />
                    </div>
                </div>
            `;

            // 3. Complete
            await this.generationHelpers.completeGeneration(generationRequestId, {
                htmlResult,
                sections: [
                    { title: 'Анализ продаж', content: analysis },
                ]
            });

        } catch (error: any) {
            this.logger.error(`Sales Analysis failed: ${error.message}`, error.stack);
            await this.generationHelpers.failGeneration(generationRequestId, error.message);
            throw error;
        }
    }

    private async generateAnalysis(imageUrl: string): Promise<string> {
        const systemPrompt = "Ты — профессиональный тренер по продажам и эксперт по переписке в мессенджерах. Твоя задача — проанализировать скриншот чата, определить контекст, выявить ошибки продавца (если есть) и дать конкретные рекомендации по ответу для закрытия сделки. Твой тон — конструктивный, мотивирующий и предельно конкретный.";

        const userPrompt = `
ПРОАНАЛИЗИРУЙ ЭТОТ СКРИНШОТ ПЕРЕПИСКИ.

Твоя задача — вернуть **ТОЛЬКО HTML-КОД** готового отчета. Не пиши никаких вступительных слов.

СТРУКТУРА ОТЧЕТА:

1.  **🔍 ЧТО ПРОИСХОДИТ?**
    *   Кратко опиши ситуацию: кто пишет, на каком этапе сделка, есть ли явные возражения.

2.  **🛑 ОШИБКИ И РИСКИ (Если есть):**
    *   Что продавец сделал не так? (Долгие ответы, нет вопросов, давление, "сухость").
    *   Если всё хорошо, отметь это.

3.  **🚀 КАК ОТВЕТИТЬ ПРЯМО СЕЙЧАС:**
    *   Напиши 2-3 варианта конкретного ответа (Сообщения), которые можно скопировать и отправить.
    *   Поясни, почему этот ответ сработает (психологический триггер).

4.  **💡 СОВЕТ НА БУДУЩЕЕ:**
    *   Один сильный совет по ведению подобных диалогов.

ТРЕБОВАНИЯ К ОФОРМЛЕНИЮ:
*   Используй **ЭМОДЗИ** 🎨.
*   Используй теги <h3>, <h4> для заголовков.
*   Используй <ul>, <li> для списков.
*   Варианты ответов выдели блоками <div style="background: #e6f7ff; padding: 15px; border-left: 4px solid #1890ff; margin: 10px 0; font-style: italic;">
*   **НЕ ИСПОЛЬЗУЙ** теги <html>, <head>, <body>. Верни только содержимое.
`;

        // Using Llama-3.2-11b-Vision-Instruct or similar multimodal model
        // Input format might vary slightly depending on the specific Replicate model version
        // Standard Llama Vision input usually takes 'prompt' and 'image'

        return this.runReplicatePrediction('meta/llama-3.2-11b-vision-instruct', {
            prompt: `${systemPrompt}\n\n${userPrompt}`,
            image: imageUrl,
            max_tokens: 2000
        });
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
                        'Prefer': 'wait' // Long polling
                    }
                }
            );

            let prediction = response.data;
            const predictionId = prediction.id;

            // Simple polling if 'Prefer: wait' didn't finish or wasn't respected
            let attempts = 0;
            while (['starting', 'processing'].includes(prediction.status) && attempts < 60) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const statusRes = await axios.get(
                    `https://api.replicate.com/v1/predictions/${predictionId}`,
                    {
                        headers: { 'Authorization': `Bearer ${this.replicateToken}` }
                    }
                );
                prediction = statusRes.data;
                attempts++;
            }

            if (prediction.status === 'succeeded') {
                return Array.isArray(prediction.output) ? prediction.output.join('') : prediction.output;
            } else {
                throw new Error(`Replicate failed: ${prediction.error || prediction.status}`);
            }
        } catch (error: any) {
            this.logger.error(`Replicate API Error: ${error.message}`);
            throw error;
        }
    }
}
