import { Processor, WorkerHost, OnWorkerEvent, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GenerationHelpersService } from '../generation-helpers.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HtmlExportService } from '../../../common/services/html-export.service';
import { FilesService } from '../../files/files.service';

export interface LessonPreparationJobData {
    generationRequestId: string;
    subject: string;
    topic: string;
    level: string;
    interests?: string;
    generationTypes: string[];
}

@Processor('lesson-preparation')
export class LessonPreparationProcessor extends WorkerHost {
    private readonly logger = new Logger(LessonPreparationProcessor.name);
    private readonly replicateToken: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly generationHelpers: GenerationHelpersService,
        private readonly prisma: PrismaService,
        private readonly htmlExportService: HtmlExportService,
        private readonly filesService: FilesService,
        @InjectQueue('lesson-preparation') private readonly lessonQueue: Queue,
    ) {
        super();
        this.replicateToken = this.configService.get<string>('REPLICATE_API_TOKEN');
        if (!this.replicateToken) {
            this.logger.warn('REPLICATE_API_TOKEN is not configured. Lesson preparation generation will not work.');
        }
    }

    async process(job: Job<LessonPreparationJobData>): Promise<void> {
        const { generationRequestId, subject, topic, level, interests, generationTypes } = job.data;
        this.logger.log(`Processing Lesson Preparation for request ${generationRequestId}`);

        try {
            // 1. Generate text content
            const content = await this.generateLessonContent(subject, topic, level, interests, generationTypes);
            this.logger.log(`Generated lesson content structure`);

            // 2. Generate images if needed (we will parse the content for image prompts)
            // For now, let's assume the content generation returns a structure including image prompts
            // But to keep it simple and compatible with "text" result, we will specific format.
            // As per requirements: "Generate thematic images... using google/nano-banana"
            // We will ask Claude to include [IMAGE: prompt] tags, and we will replace them.

            const contentWithImages = await this.processImageTags(content);

            // 3. Convert to HTML/Markdown for result
            // Since WebAppIndex expects "content", we just return the processed string.
            // If we want a PDF, we can generate it similar to presentation.
            // For now, let's return HTML string which can be downloaded.

            const htmlContent = this.formatToHtml(contentWithImages, topic);

            // 4. Save result
            const outputData = {
                provider: 'Replicate',
                mode: 'lessonPreparation',
                content: htmlContent,
                // pdfUrl, // If we decide to generate PDF later
                completedAt: new Date().toISOString(),
            };

            await this.generationHelpers.completeGeneration(generationRequestId, outputData);
            this.logger.log(`Generation request ${generationRequestId} completed successfully`);

        } catch (error: any) {
            this.logger.error(`Lesson preparation generation failed: ${error.message}`, error.stack);
            await this.generationHelpers.failGeneration(
                generationRequestId,
                error.message || 'Lesson preparation generation failed',
            );
            throw error;
        }
    }

    private async generateLessonContent(
        subject: string,
        topic: string,
        level: string,
        interests: string | undefined,
        generationTypes: string[]
    ): Promise<string> {
        const typesList = generationTypes.join(', ');
        const interestsStr = interests ? `Student Interests: ${interests}` : '';

        const prompt = `
You are a world-class expert teacher and creative curriculum designer known for creating engaging, high-quality, and modern educational materials.
Your goal is to create a "WOW-lesson" preparation package.

Lesson Details:
- Subject: ${subject}
- Topic: ${topic}
- Target Grade/Level: ${level}
${interestsStr}

Requested Materials: ${typesList}

INSTRUCTIONS:
1. **Structure**: For each requested material type, provide a dedicated section with a clear Markdown header (e.g., "## Lesson Plan", "## Quiz", "## Visual Aids Guide").
2. **Quality**: The content must be pedagogically sound, engaging, and directly ready to use in a classroom.
3. **Personalization**: If student interests are provided, deeply weave them into examples, analogies, and problem scenarios.
4. **Visuals**: You MUST suggest relevant, high-quality images to visually support the lesson. Insert them using exactly this format: [IMAGE: <detailed, descriptive prompt for an AI image generator>].
   - The image prompt should describe the scene visually (e.g., "A colorful educational illustration of...", "A realistic diagram of...").
   - Place these tags where the images should logically appear.

FORMATTING:
- Use clean Markdown.
- Use bullet points and numbered lists where appropriate.
`;

        const prediction = await this.runReplicatePrediction('anthropic/claude-3.5-sonnet', {
            prompt: prompt,
            max_tokens: 4000,
            system_prompt: "You are a helpful and creative educational assistant.",
        });

        let rawOutput = "";
        if (Array.isArray(prediction.output)) {
            rawOutput = prediction.output.join('');
        } else if (typeof prediction.output === 'string') {
            rawOutput = prediction.output;
        }
        return rawOutput;
    }

    private async processImageTags(content: string): Promise<string> {
        const imageRegex = /\[IMAGE:\s*(.*?)\]/g;
        let match;
        let newContent = content;

        // We find all matches first
        const matches: { full: string, prompt: string }[] = [];
        while ((match = imageRegex.exec(content)) !== null) {
            matches.push({ full: match[0], prompt: match[1] });
        }

        // Process sequentially (or parallel)
        for (const m of matches) {
            try {
                const imageUrl = await this.generateImage(m.prompt);
                const imageHtml = `<div class="generated-image"><img src="${imageUrl}" alt="${m.prompt}" style="max-width: 100%; border-radius: 8px; margin: 10px 0;" /></div>`;
                newContent = newContent.replace(m.full, imageHtml);
            } catch (e) {
                this.logger.error(`Failed to generate image for prompt "${m.prompt}": ${e}`);
                // Replace with nothing or error text
                newContent = newContent.replace(m.full, `(Image generation failed: ${m.prompt})`);
            }
        }

        return newContent;
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

    private formatToHtml(markdownContent: string, title: string): string {
        // Basic Markdown to HTML conversion (simplified)
        // In a real app we might want to use a library like 'marked' or 'showdown'
        // But for now, preserving line breaks and basic formatting is enough if the frontend displays it as HTML
        // Wait, the frontend might expect HTML.
        // Let's do a simple wrap.

        const formattedBody = markdownContent
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
            .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>');

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; white-space: pre-wrap; }
                h1, h2, h3 { color: #333; }
                img { max-width: 100%; }
                .generated-image { margin: 20px 0; text-align: center; }
            </style>
        </head>
        <body>
            <h1>Lesson Preparation: ${title}</h1>
            ${formattedBody}
        </body>
        </html>
        `;
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<LessonPreparationJobData>) {
        this.logger.log(`Lesson preparation job completed: ${job.id}`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<LessonPreparationJobData>, error: Error) {
        this.logger.error(`Lesson preparation job failed: ${job.id}, error: ${error.message}`);
    }
}
