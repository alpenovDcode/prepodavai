import { Processor, WorkerHost, OnWorkerEvent, InjectQueue } from '@nestjs/bullmq';
import { Logger, BadRequestException } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GenerationHelpersService } from '../generation-helpers.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HtmlExportService } from '../../../common/services/html-export.service';
import { FilesService } from '../../files/files.service';

export interface ReplicatePresentationJobData {
    generationRequestId: string;
    topic: string;
    duration?: string;
    style?: string;
    targetAudience?: string;
    numCards?: number;
}

interface Slide {
    id: string;
    html: string;
    css: string;
    js: string;
    imagePrompt?: string;
}

@Processor('replicate-presentation')
export class ReplicatePresentationProcessor extends WorkerHost {
    private readonly logger = new Logger(ReplicatePresentationProcessor.name);
    private readonly replicateToken: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly generationHelpers: GenerationHelpersService,
        private readonly prisma: PrismaService,
        private readonly htmlExportService: HtmlExportService,
        private readonly filesService: FilesService,
        @InjectQueue('replicate-presentation') private readonly presentationQueue: Queue,
    ) {
        super();
        this.replicateToken = this.configService.get<string>('REPLICATE_API_TOKEN');
        if (!this.replicateToken) {
            this.logger.warn('REPLICATE_API_TOKEN is not configured. Replicate presentation generation will not work.');
        }
    }

    async process(job: Job<ReplicatePresentationJobData>): Promise<void> {
        const { generationRequestId, topic, duration, style, targetAudience, numCards = 7 } = job.data;
        this.logger.log(`Processing Replicate presentation generation for request ${generationRequestId}: topic="${topic}"`);

        try {
            // 1. Generate text content (slides JSON)
            const slides = await this.generatePresentationSlides(topic, { duration, style, targetAudience, numCards });
            this.logger.log(`Generated ${slides.length} slides for request ${generationRequestId}`);

            // 2. Generate images for each slide (sequential to avoid rate limits)
            for (let i = 0; i < slides.length; i++) {
                const slide = slides[i];
                if (this.replicateToken && slide.imagePrompt && slide.html.includes('IMAGE_PLACEHOLDER')) {
                    try {
                        this.logger.log(`Generating image for slide ${i + 1}/${slides.length}...`);
                        const imageUrl = await this.generateImage(slide.imagePrompt);
                        slide.html = slide.html.replace('IMAGE_PLACEHOLDER', imageUrl);
                    } catch (imgError: any) {
                        this.logger.error(`Failed to generate image for slide ${i + 1}: ${imgError.message}`);
                        slide.html = slide.html.replace('IMAGE_PLACEHOLDER', `https://picsum.photos/800/450?sig=${Math.random()}`);
                    }
                } else {
                    slide.html = slide.html.replace('IMAGE_PLACEHOLDER', `https://picsum.photos/800/450?sig=${Math.random()}`);
                }
            }

            const finalResult = {
                provider: this.replicateToken ? 'Replicate' : 'GigaChat',
                mode: 'presentation',
                slides: slides,
                completedAt: new Date().toISOString(),
            };

            // 3. Generate PDF
            let pdfUrl: string | undefined;
            let exportUrl: string | undefined;

            try {
                this.logger.log(`Generating PDF for request ${generationRequestId}`);
                const pdfHtml = `<html><body style="background:#0f172a; color:white; padding:40px;">${slides.map(s => s.html).join('<div style="page-break-after:always;"></div>')}</body></html>`;
                const pdfBuffer = await this.htmlExportService.htmlToPdf(pdfHtml);

                const fileData = await this.filesService.saveBuffer(pdfBuffer, 'presentation.pdf');
                pdfUrl = fileData.url;
                exportUrl = fileData.url;
                this.logger.log(`PDF generated and saved: ${pdfUrl}`);
            } catch (pdfError: any) {
                this.logger.error(`Failed to generate PDF: ${pdfError.message}`, pdfError.stack);
            }

            // 4. Save result and complete generation
            const outputData = {
                ...finalResult,
                pdfUrl,
                exportUrl,
                topic,
            };

            await this.generationHelpers.completeGeneration(generationRequestId, outputData);
            this.logger.log(`Generation request ${generationRequestId} completed successfully`);

        } catch (error: any) {
            this.logger.error(`Replicate presentation generation failed: ${error.message}`, error.stack);
            await this.generationHelpers.failGeneration(
                generationRequestId,
                error.message || 'Replicate presentation generation failed',
            );
            throw error;
        }
    }

    private async generatePresentationSlides(topic: string, params: any): Promise<Slide[]> {
        const numCards = params.numCards || 7;
        const grade = params.targetAudience || 'General Audience';
        const duration = params.duration || '15';
        const style = params.style || 'modern';

        const prompt = `
      Ты — топовый методист и Senior Frontend-разработчик. Создай презентацию на языке: Русский.
      Тема: "${topic}". Целевая аудитория: ${grade}. Длительность: ${duration} мин. Стиль: ${style}.

      ТРЕБОВАНИЯ К ФОРМАТУ (КРИТИЧНО):
      Верни СТРОГО валидный JSON-массив объектов. Никакого лишнего текста до или после.
      Каждый объект должен иметь поля:
      - "html": Строка с HTML-версткой слайда.
      - "imagePrompt": Детальный английский промпт для генерации фонового/тематического изображения (high-quality, professional).

      ТРЕБОВАНИЯ К ВЕРСТКЕ:
      1. Используй ТОЛЬКО инлайн-стили (атрибут style="...").
      2. ЗАПРЕЩЕНО использовать классы (class) и тег <style>.
      3. Слайд должен иметь:
         - Темный фон (например, #0f172a или #1e293b).
         - Размер: width: 100vw; height: 100vh; overflow: hidden; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 40px; box-sizing: border-box; font-family: sans-serif;
      4. Вставь тег <img src="IMAGE_PLACEHOLDER" style="max-width: 80%; max-height: 50%; border-radius: 12px; margin-top: 20px; object-fit: cover;"> там, где нужно изображение.

      Пример структуры:
      [
        {
          "html": "<div style=\"background: #0f172a; color: white; ...\"><h1 style=\"...\">Заголовок</h1><p style=\"...\">Текст</p><img src=\"IMAGE_PLACEHOLDER\" style=\"...\"></div>",
          "imagePrompt": "A futuristic classroom with AI holograms, cinematic lighting, 8k"
        }
      ]

      Сгенерируй ровно ${numCards} слайдов.
    `;

        const prediction = await this.runReplicatePrediction('google/gemini-3-flash', {
            prompt: prompt,
            max_tokens: 4000,
            system_prompt: "You are a helpful assistant that outputs only valid JSON array of slides.",
        });

        let rawOutput = "";
        if (Array.isArray(prediction.output)) {
            rawOutput = prediction.output.join('');
        } else if (typeof prediction.output === 'string') {
            rawOutput = prediction.output;
        }

        rawOutput = rawOutput.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            const parsed = JSON.parse(rawOutput) as any[];
            return parsed.map(item => ({
                id: 'slide_' + Math.random().toString(36).substring(2, 11),
                html: item.html || '',
                css: '',
                js: '',
                imagePrompt: item.imagePrompt || ''
            }));
        } catch (e) {
            this.logger.error(`Failed to parse AI output: ${rawOutput}`);
            throw new Error("Failed to parse generated presentation JSON");
        }
    }

    private async generateImage(imagePrompt: string): Promise<string> {
        const prediction = await this.runReplicatePrediction('bytedance/seedream-4', {
            prompt: imagePrompt,
            aspect_ratio: '4:3',
        });

        if (Array.isArray(prediction.output) && prediction.output.length > 0) {
            return prediction.output[0];
        }
        if (typeof prediction.output === 'string') {
            return prediction.output;
        }

        throw new Error("No image URL in output");
    }

    private async runReplicatePrediction(model: string, input: any): Promise<any> {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                const response = await axios.post(
                    `https://api.replicate.com/v1/models/${model}/predictions`,
                    {
                        input: input,
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${this.replicateToken}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'wait',
                        },
                    }
                );

                let prediction = response.data;

                if (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled') {
                    prediction = await this.pollPrediction(prediction.id);
                }

                if (prediction.status === 'failed' || prediction.status === 'canceled') {
                    if (prediction.error && prediction.error.includes('E004')) {
                        throw new Error(`Replicate temporary error (E004): ${prediction.error}`);
                    }
                    throw new Error(`Replicate prediction failed: ${prediction.error}`);
                }

                return prediction;
            } catch (error: any) {
                attempts++;
                this.logger.warn(`runReplicatePrediction attempt ${attempts} failed: ${error.message}`);
                if (attempts >= maxAttempts) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
            }
        }
        throw new Error("Replicate prediction failed after max attempts");
    }

    private async pollPrediction(predictionId: string): Promise<any> {
        const maxAttempts = 60;
        const delayMs = 2000;

        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, delayMs));

            const response = await axios.get(
                `https://api.replicate.com/v1/predictions/${predictionId}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.replicateToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            const prediction = response.data;
            if (prediction.status === 'succeeded' || prediction.status === 'failed' || prediction.status === 'canceled') {
                return prediction;
            }
        }
        throw new Error("Prediction timed out");
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<ReplicatePresentationJobData>) {
        this.logger.log(`Replicate presentation job completed: ${job.id}`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<ReplicatePresentationJobData>, error: Error) {
        this.logger.error(`Replicate presentation job failed: ${job.id}, error: ${error.message}`);
    }
}
