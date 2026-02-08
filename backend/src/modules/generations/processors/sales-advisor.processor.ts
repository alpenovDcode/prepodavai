import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GenerationHelpersService } from '../generation-helpers.service';
import { LOGO_BASE64 } from '../generations.service';

export interface SalesAdvisorJobData {
    generationRequestId: string;
    imageHash: string;
    imageUrl: string; // Public URL of the uploaded screenshot
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
        const { generationRequestId, imageUrl } = job.data;
        this.logger.log(`Processing Sales Advisor analysis for ${generationRequestId}`);

        try {
            // 1. Update progress
            await this.generationHelpers.updateProgress(generationRequestId, {
                percent: 10,
                message: 'Анализ диалога...'
            });

            // 2. Analyze dialog using Claude Vision
            const analysis = await this.analyzeDialog(imageUrl);

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

    private async analyzeDialog(imageUrl: string): Promise<string> {
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

        const userPrompt = `Проанализируй скриншот диалога с клиентом и предоставь детальный разбор.

СТРУКТУРА АНАЛИЗА:

1. **📊 ЭКСПРЕСС-ДИАГНОСТИКА**
   - На каком этапе воронки находится клиент? (Холодный контакт / Интерес / Обдумывание / Готовность / Возражения)
   - Общая оценка качества ведения диалога (1-10)
   - Главная проблема в текущем диалоге

2. **🎯 АНАЛИЗ КЛИЕНТА**
   - Какие потребности/боли клиента видны в диалоге?
   - Какие возражения озвучены явно?
   - Какие возражения скрыты (читаются между строк)?
   - Уровень заинтересованности (горячий/теплый/холодный)

3. **⚠️ ОШИБКИ МЕНЕДЖЕРА**
   - Что сделано неправильно?
   - Какие возможности упущены?
   - Что вызвало сопротивление клиента?

4. **✅ ЧТО НАПИСАТЬ ПРЯМО СЕЙЧАС**
   - Конкретный текст следующего сообщения (готовый к копированию)
   - Почему именно эта формулировка сработает
   - Альтернативный вариант (если клиент не ответит)

5. **🔮 СТРАТЕГИЯ ДАЛЬНЕЙШИХ ДЕЙСТВИЙ**
   - Следующие 2-3 шага после ответа клиента
   - Как закрыть на встречу/звонок/покупку
   - Красные флаги (когда стоит отпустить клиента)

ВАЖНО:
- Будь конкретным, избегай общих фраз
- Давай готовые формулировки, а не советы "типа напиши о..."
- Учитывай специфику EdTech (родители, ученики, преподаватели)`;

        return this.runReplicatePrediction('anthropic/claude-3.5-sonnet', {
            prompt: userPrompt,
            system_prompt: systemPrompt,
            max_tokens: 3000,
            image: imageUrl, // Vision API parameter
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
