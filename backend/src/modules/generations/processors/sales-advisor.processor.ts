import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GenerationHelpersService } from '../generation-helpers.service';
import { LOGO_BASE64 } from '../generation.constants';

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
Используй теги <h3> для разделов, <ul> и <li> для списков.
Используй <strong> для выделения важных мыслей.
Можешь использовать <div class="highlight-box">...</div> для особо важных рекомендаций или выводов.
Не используй markdown, только чистый HTML.
Не добавляй теги html, head, body - только контент.

МАТЕМАТИЧЕСКИЕ ФОРМУЛЫ (ЕСЛИ НУЖНЫ):
- Строчные: \`\\(...\\)\`. ЗАПРЕЩЕНО использовать \`$\`!
- Блочные: \`\\[...\\]\`. ЗАПРЕЩЕНО использовать \`$$\`!`;

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
     * Analyzes images sequentially and combines results
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
                return this.runReplicatePrediction('anthropic/claude-3.7-sonnet', {
                    prompt: userPrompt,
                    system_prompt: systemPrompt,
                    max_tokens: 3000,
                    image: imageUrls[0],
                });
            }

            // For multiple images, analyze each one sequentially and combine results
            this.logger.log(`Analyzing ${imageUrls.length} images sequentially...`);

            const analyses: string[] = [];

            for (let i = 0; i < imageUrls.length; i++) {
                const imageNumber = i + 1;
                this.logger.log(`Analyzing image ${imageNumber}/${imageUrls.length}`);

                const imagePrompt = `Это скриншот ${imageNumber} из ${imageUrls.length} (в хронологическом порядке).
                
Проанализируй ТОЛЬКО этот скриншот и опиши:
1. Что происходит на этом этапе диалога
2. Ключевые моменты и фразы
3. Реакция клиента
4. Действия менеджера

Будь кратким, это промежуточный анализ.`;

                const analysis = await this.runReplicatePrediction('anthropic/claude-3.7-sonnet', {
                    prompt: imagePrompt,
                    system_prompt: 'Ты эксперт по анализу диалогов продаж. Анализируй скриншоты переписки.',
                    max_tokens: 1000,
                    image: imageUrls[i],
                });

                analyses.push(`### Скриншот ${imageNumber}/${imageUrls.length}\n\n${analysis}`);
            }

            // Now combine all analyses into final comprehensive analysis
            this.logger.log(`Combining ${analyses.length} analyses into final report`);

            const combinedContext = analyses.join('\n\n---\n\n');

            const finalPrompt = `Ты получил анализ ${imageUrls.length} скриншотов диалога с клиентом (в хронологическом порядке).

ПРОМЕЖУТОЧНЫЕ АНАЛИЗЫ:
${combinedContext}

Теперь на основе ВСЕХ этих скриншотов предоставь ИТОГОВЫЙ комплексный анализ всего диалога целиком:

${userPrompt}`;

            const finalAnalysis = await this.runReplicatePrediction('anthropic/claude-3.7-sonnet', {
                prompt: finalPrompt,
                system_prompt: systemPrompt,
                max_tokens: 3000,
            });

            return finalAnalysis;
        } catch (error: any) {
            this.logger.error(`Error in runReplicatePredictionWithMultipleImages: ${error.message}`);
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
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 900px;
                    margin: 0 auto;
                    padding: 40px;
                    background-color: #fff;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 3px solid #FF7E58;
                    padding-bottom: 20px;
                    margin-bottom: 40px;
                }
                .header-logo {
                    max-height: 70px;
                }
                .header-title {
                    font-size: 28px;
                    color: #2d3748;
                    font-weight: 700;
                    margin: 0;
                    text-align: right;
                }
                .content {
                    font-size: 16px;
                }
                h3 {
                    color: #FF7E58;
                    font-size: 22px;
                    margin-top: 30px;
                    margin-bottom: 15px;
                    border-left: 4px solid #FF7E58;
                    padding-left: 15px;
                }
                h4 {
                    color: #4a5568;
                    font-size: 18px;
                    margin-top: 20px;
                    margin-bottom: 10px;
                }
                ul {
                    padding-left: 20px;
                    margin-bottom: 20px;
                }
                li {
                    margin-bottom: 8px;
                }
                strong {
                    color: #2d3748;
                }
                .footer {
                    margin-top: 60px;
                    padding-top: 20px;
                    border-top: 1px solid #eee;
                    display: flex;
                    justify-content: flex-end;
                    align-items: center;
                }
                .footer-logo {
                    max-height: 40px;
                    opacity: 0.6;
                }
                .highlight-box {
                    background-color: #f7fafc;
                    border-radius: 8px;
                    padding: 20px;
                    margin: 20px 0;
                    border: 1px solid #e2e8f0;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <img src="${LOGO_BASE64}" alt="PrepodavAI" class="header-logo" />
                <h1 class="header-title">Анализ диалога продаж</h1>
            </div>
            
            <div class="content">
                ${analysis}
            </div>

            <div class="footer">
                <img src="${LOGO_BASE64}" alt="PrepodavAI" class="footer-logo" />
            </div>
        </body>
        </html>
        `;
    }
}
