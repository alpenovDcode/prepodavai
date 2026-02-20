import { Processor, WorkerHost, OnWorkerEvent, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GenerationHelpersService } from '../generation-helpers.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HtmlExportService } from '../../../common/services/html-export.service';
import { FilesService } from '../../files/files.service';

export interface ReplicatePresentationJobData {
    generationRequestId: string;
    inputText: string;
    numCards: number;
}

interface Slide {
    title: string;
    content: string;
    imagePrompt: string;
    imageUrl?: string;
}

interface PresentationStructure {
    title: string;
    slides: Slide[];
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
        const { generationRequestId, inputText, numCards } = job.data;
        this.logger.log(`Processing Replicate presentation generation for request ${generationRequestId}`);

        try {
            // 1. Generate text content
            const presentationData = await this.generatePresentationContent(inputText, numCards);
            this.logger.log(`Generated presentation structure: ${JSON.stringify(presentationData, null, 2)}`);

            // 2. Generate images for each slide
            const slidesWithImages = await Promise.all(
                presentationData.slides.map(async (slide) => {
                    if (slide.imagePrompt) {
                        try {
                            const imageUrl = await this.generateImage(slide.imagePrompt);
                            return { ...slide, imageUrl };
                        } catch (imgError: any) {
                            this.logger.error(`Failed to generate image for slide "${slide.title}": ${imgError.message}`);
                            return { ...slide, imageUrl: null };
                        }
                    }
                    return slide;
                })
            );

            const finalPresentation = {
                ...presentationData,
                slides: slidesWithImages,
            };

            this.logger.log(`Final presentation data: ${JSON.stringify(finalPresentation, null, 2)}`);

            // 3. Generate PDF
            let pdfUrl: string | undefined;
            let exportUrl: string | undefined;

            try {
                this.logger.log(`Generating PDF for request ${generationRequestId}`);
                const html = this.generatePresentationHtml(finalPresentation);
                const pdfBuffer = await this.htmlExportService.htmlToPdf(html);

                const fileData = await this.filesService.saveBuffer(pdfBuffer, 'presentation.pdf');
                pdfUrl = fileData.url;
                exportUrl = fileData.url; // Use same URL for export
                this.logger.log(`PDF generated and saved: ${pdfUrl}`);
            } catch (pdfError: any) {
                this.logger.error(`Failed to generate PDF: ${pdfError.message}`, pdfError.stack);
                // Continue without PDF if it fails
            }

            // 4. Save result and complete generation
            const outputData = {
                provider: 'Replicate',
                mode: 'presentation',
                presentation: finalPresentation,
                pdfUrl,
                exportUrl,
                inputText,
                completedAt: new Date().toISOString(),
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

    private async generatePresentationContent(inputText: string, numCards: number): Promise<PresentationStructure> {
        const prompt = `
You are an expert presentation creator. Create a comprehensive and detailed presentation structure based on the following topic/text: "${inputText}".
The presentation MUST have exactly ${numCards} cards/slides.

STRICT INSTRUCTIONS:
1.  **Narrative Flow:** Ensure a logical flow from introduction to conclusion across the slides.
2.  **Detailed Content:** For each slide, "content" must provide substantial, well-written text explaining the points fully. Do not just use short bullet points; write cohesive paragraphs or detailed lists that can serve as the speaker's main content or detailed slide text. The text should be educational and engaging.
3.  **Visual Context:** The "imagePrompt" for each slide must be highly descriptive and specifically tailored to visually represent the content of that slide.
4.  **Slide Count:** You must generate exactly ${numCards} slides. Plan the content distribution accordingly.

Output ONLY valid JSON in the following format, without any markdown formatting or extra text:
{
  "title": "Presentation Main Title",
  "slides": [
    {
      "title": "Slide Title",
      "content": "Detailed text content for the slide. Explain the concepts clearly and thoroughly.",
      "imagePrompt": "A detailed, descriptive prompt for an AI image generator to create a relevant illustration for this slide."
    }
  ]
}
`;
        const prediction = await this.runReplicatePrediction('anthropic/claude-3.7-sonnet', {
            prompt: prompt,
            max_tokens: 2000,
            system_prompt: "You are a helpful assistant that outputs only JSON.",
        });

        let rawOutput = "";
        if (Array.isArray(prediction.output)) {
            rawOutput = prediction.output.join('');
        } else if (typeof prediction.output === 'string') {
            rawOutput = prediction.output;
        }

        rawOutput = rawOutput.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            return JSON.parse(rawOutput) as PresentationStructure;
        } catch (e) {
            this.logger.error(`Failed to parse Claude output: ${rawOutput}`);
            throw new Error("Failed to parse generated presentation JSON");
        }
    }


    private async generateImage(imagePrompt: string): Promise<string> {
        const prediction = await this.runReplicatePrediction('google/nano-banana', {
            prompt: imagePrompt,
            num_inference_steps: 20,
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
            throw new Error(`Replicate prediction failed: ${prediction.error}`);
        }

        return prediction;
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

    private generatePresentationHtml(data: PresentationStructure): string {
        const slidesHtml = data.slides.map((slide, index) => {
            const imageUrl = slide.imageUrl ? `<div class="image-container"><img src="${slide.imageUrl}" alt="Slide Image" crossorigin="anonymous"></div>` : '';
            // Convert newline-separated bullet points to HTML list if possible, or just preserve newlines
            const contentHtml = slide.content.split('\n').map(line => `<p>${line}</p>`).join('');

            return `
            <div class="slide">
                <div class="slide-content">
                    <h2>${slide.title}</h2>
                    <div class="text-content">
                        ${contentHtml}
                    </div>
                    ${imageUrl}
                </div>
                <div class="page-number">${index + 1} / ${data.slides.length}</div>
            </div>
            `;
        }).join('');

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                @page {
                    size: A4 landscape;
                    margin: 0;
                }
                body {
                    margin: 0;
                    font-family: 'Segoe UI', opt, Arial, sans-serif;
                    background: #f0f0f0;
                }
                .slide {
                    width: 297mm;
                    height: 210mm;
                    page-break-after: always;
                    background: white;
                    position: relative;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    padding: 40px;
                    box-sizing: border-box;
                }
                .slide-content {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                }
                h1 {
                    font-size: 48px;
                    color: #333;
                    text-align: center;
                    margin-bottom: 40px;
                }
                h2 {
                    font-size: 36px;
                    color: #2c3e50;
                    margin-top: 0;
                    margin-bottom: 30px;
                    border-bottom: 2px solid #3498db;
                    padding-bottom: 10px;
                }
                .text-content {
                    font-size: 24px;
                    color: #555;
                    line-height: 1.5;
                    flex: 1;
                }
                .image-container {
                    margin-top: 20px;
                    height: 400px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    background: #f9f9f9;
                    border-radius: 8px;
                    overflow: hidden;
                }
                img {
                    max-width: 100%;
                    max-height: 100%;
                    object-fit: contain;
                }
                .page-number {
                    position: absolute;
                    bottom: 20px;
                    right: 20px;
                    font-size: 14px;
                    color: #999;
                }
                /* Title Slide Style */
                .slide:first-child {
                    background: linear-gradient(135deg, #3498db, #2c3e50);
                    color: white;
                    align-items: center;
                    text-align: center;
                }
                .slide:first-child h2 {
                    border: none;
                    color: white;
                    font-size: 56px;
                    margin-bottom: 20px;
                }
                .slide:first-child .text-content {
                    color: #ecf0f1;
                    font-size: 28px;
                    flex: 0;
                }
                .slide:first-child .image-container {
                    display: none; /* Hide image on title slide generally, or verify if we want it */
                } 
                /* Override image display for first slide if we want */
            </style>
        </head>
        <body>
            <!-- Title Slide (Optional, constructed from main title) -->
            <div class="slide">
                <div class="slide-content" style="justify-content: center; align-items: center;">
                    <h2>${data.title}</h2>
                    <div class="text-content">
                        ${data.slides.length} Slides
                    </div>
                </div>
            </div>
            ${slidesHtml}
        </body>
        </html>
        `;
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
