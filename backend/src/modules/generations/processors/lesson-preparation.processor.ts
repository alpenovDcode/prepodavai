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
            const sections: { title: string; content: string }[] = [];
            const previousContext: string[] = [];

            // Iterate through each requested type and generate content
            for (const type of generationTypes) {
                this.logger.log(`Generating section: ${type}`);

                // 1. Generate content for this specific type
                const sectionRawContent = await this.generateSection(
                    type,
                    subject,
                    topic,
                    level,
                    interests,
                    previousContext.join('\n\n')
                );

                // 2. Process images
                const contentWithImages = await this.processImageTags(sectionRawContent);

                // 3. Format to HTML
                const typeLabel = this.getTypeLabel(type);
                const htmlContent = this.formatToHtml(contentWithImages, `${topic} - ${typeLabel}`);

                // 4. Add to sections list
                sections.push({
                    title: typeLabel,
                    content: htmlContent
                });

                // 5. Update context for next generations (keep it brief to avoid token limits)
                // We keep the raw content of previous sections to maintain consistency
                previousContext.push(`Context from ${typeLabel}:\n${sectionRawContent.slice(0, 1000)}...`);

                // 6. Update progress in DB
                const outputData = {
                    provider: 'Replicate',
                    mode: 'lessonPreparation',
                    content: null,
                    sections: sections,
                    htmlResult: sections.map(s => s.content).join('\n\n'),
                    completedAt: null, // Not finished yet
                };

                await this.generationHelpers.updateProgress(generationRequestId, outputData);
                this.logger.log(`Updated progress for ${type}`);
            }

            // Final completion
            const finalOutputData = {
                provider: 'Replicate',
                mode: 'lessonPreparation',
                content: null,
                sections: sections,
                htmlResult: sections.map(s => s.content).join('\n\n'),
                completedAt: new Date().toISOString(),
            };

            await this.generationHelpers.completeGeneration(generationRequestId, finalOutputData);
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

    private getTypeLabel(type: string): string {
        const map: Record<string, string> = {
            lessonPlan: 'План урока',
            worksheet: 'Рабочий лист',
            presentation: 'Структура презентации',
            quest: 'Сценарий квеста',
            visuals: 'Тематические изображения',
            quiz: 'Тест'
        };
        return map[type] || type;
    }

    private async generateSection(
        targetType: string,
        subject: string,
        topic: string,
        level: string,
        interests: string | undefined,
        context: string
    ): Promise<string> {
        const interestsStr = interests ? `Student Interests: ${interests}` : '';
        const typeLabel = this.getTypeLabel(targetType);

        const prompt = `
You are a world-class expert teacher.
Goal: Create a **${typeLabel}** for a lesson.

Lesson Details:
- Subject: ${subject}
- Topic: ${topic}
- Target Grade/Level: ${level}
${interestsStr}

CONTEXT from previous parts of this lesson:
${context}

INSTRUCTIONS:
1. Create ONLY the **${typeLabel}**. Do not create other materials.
2. **Quality**: Pedagogically sound, engaging, ready for classroom.
3. **Personalization**: Weave in interests (${interests || 'none'}).
4. **Visuals**: Suggest images using format: [IMAGE: <detailed prompt>].
   - Insert tags where images logically appear.
5. **Format**: Use clean Markdown.

Output ONLY the content for ${typeLabel}.
`;

        const prediction = await this.runReplicatePrediction('anthropic/claude-3.5-sonnet', {
            prompt: prompt,
            max_tokens: 2000,
            system_prompt: "You are a helpful educational assistant.",
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
