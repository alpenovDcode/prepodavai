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

    private formatToHtml(markdownContent: string, title: string): string {
        // Basic Markdown to HTML conversion
        const formattedBody = markdownContent
            .replace(/^# (.*$)/gim, '<h1 class="main-title">$1</h1>')
            .replace(/^## (.*$)/gim, '<h2 class="section-title">$1</h2>')
            .replace(/^### (.*$)/gim, '<h3 class="subsection-title">$1</h3>')
            .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
            .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>');

        const logoUrl = "https://fs.cdn-chatium.io/thumbnail/image_gc_AmbUAlw8Yq.1024x1024.png/s/128x";

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { 
                    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
                    max-width: 800px; 
                    margin: 0 auto; 
                    padding: 40px; 
                    line-height: 1.6; 
                    white-space: pre-wrap; 
                    color: #333;
                    background-color: #fff;
                    position: relative;
                }
                .logo-header, .logo-footer {
                    text-align: center;
                    margin-bottom: 40px;
                    opacity: 0.8;
                }
                .logo-header img, .logo-footer img {
                    height: 200px;
                }
                .logo-footer {
                    margin-top: 60px;
                    border-top: 1px solid #eee;
                    padding-top: 20px;
                }
                
                h1, h2, h3 { color: #2d3748; margin-top: 1.5em; margin-bottom: 0.5em; }
                h1.main-title { font-size: 2.5em; border-bottom: 2px solid #FF7E58; padding-bottom: 10px; color: #1a202c; }
                h2.section-title { font-size: 1.8em; color: #2c5282; margin-top: 2em; }
                h3.subsection-title { font-size: 1.3em; color: #4a5568; }
                
                .generated-image-container { 
                    margin: 30px 0; 
                    text-align: center; 
                    transition: transform 0.3s ease;
                }
                .generated-image-container:hover {
                    transform: scale(1.01);
                }
                .generated-image-container img { 
                    max-width: 100%; 
                    border-radius: 12px; 
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                    border: 1px solid #e2e8f0;
                }
                
                ul, ol { margin-left: 20px; }
                li { margin-bottom: 8px; }
                strong { color: #2b6cb0; }
            </style>
            <!-- MathJax Configuration -->
            <script>
            window.MathJax = {
              tex: {
                inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
                displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
                processEscapes: true
              },
              svg: {
                fontCache: 'global'
              }
            };
            </script>
            <script type="text/javascript" id="MathJax-script" async
              src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js">
            </script>
        </head>
        <body>
            <div class="logo-header">
                <img src="${logoUrl}" alt="PrepodavAI Logo" />
            </div>
            
            <h1>${title}</h1>
            ${formattedBody}
            
            <div class="logo-footer">
                <img src="${logoUrl}" alt="PrepodavAI Logo" />
                <p style="font-size: 12px; color: #888;">Сгенерировано с помощью PrepodavAI</p>
            </div>
        </body>
        </html>
        `;
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
You are a WORLD-CLASS Award-Winning Curriculum Designer and Creative Director.
Your name is "PrepodavAI Genius".
Your goal is to create a **"WOW-EFFECT" ${typeLabel}** that will amaze both the teacher and the students.

**CRITICAL: LANGUAGE SETTINGS**
- **OUTPUT LANGUAGE: STRICTLY RUSSIAN (Русский язык).** All content must be in Russian.
- **Formulas:** MUST use LaTeX format wrapped in \`$\` for inline and \`$$\` for block equations. Example: $E=mc^2$ or $$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$.
- **Images:** Any text inside generated images must be in Russian.

DETAILS:
- Subject: ${subject}
- Topic: ${topic}
- Target Level: ${level}
${interestsStr}

CONTEXT from previous sections:
${context}

--------
CREATIVE DIRECTION (THE "WOW" FACTOR):
1. **Tone**: Inspiring, modern, energetic, and pedagogically deeply sound. Avoid boring academic dry text.
2. **Visual Storytelling**: The content MUST be visually rich. Do not write walls of text. Break it up!
3. **Personalization**: If interests are provided (${interests || 'none'}), weave them seamlessly into metaphors, examples, and scenarios. Make the student feel this was written JUST for them.

IMAGE INSTRUCTIONS (CRITICAL):
You act as an Art Director. You MUST insert image placeholders where they add value (at least 2-3 images per section).
Format: [IMAGE: <style description> | <detailed visual prompt>]
- Styles to use: "Pixar style 3D", "Detailed scientific illustration", "Minimalist modern vector", "Watercolor educational poster", "National Geographic photography".
- **Vary the styles** based on the content needs.
- **IMPORTANT**: If the image requires text, specify "text in Russian".
- Examples:
  - [IMAGE: Pixar style 3D | A happy robot teaching math to a group of diverse students, bright colors]
  - [IMAGE: Educational Poster | Diagram of a cell with Russian labels, clean vector style]

STRUCTURE & FORMATTING:
- Use Markdown.
- Use Emojis 🌟 where appropriate.
- **Headings**: Catchy and intriguing (In Russian).
- **Micro-learning**: Short paragraphs, bullet points.

OUTPUT GOAL:
Create the content for **${typeLabel}** ONLY (In Russian).
Make it shine. Make it look expensive and professional.
--------
`;

        const prediction = await this.runReplicatePrediction('anthropic/claude-3.5-sonnet', {
            prompt: prompt,
            max_tokens: 3000,
            system_prompt: "You are a creative educational genius. You create content STRICTLY IN RUSSIAN.",
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
        const matches: { full: string, content: string }[] = [];
        while ((match = imageRegex.exec(content)) !== null) {
            matches.push({ full: match[0], content: match[1] });
        }

        // Process sequentially
        for (const m of matches) {
            try {
                // Handle "Style | Prompt" format
                let finalPrompt = m.content;
                const parts = m.content.split('|');
                if (parts.length > 1) {
                    const style = parts[0].trim();
                    const prompt = parts.slice(1).join('|').trim();
                    finalPrompt = `${style}, ${prompt}, high quality, detailed, 4k`;
                } else {
                    finalPrompt = `${m.content}, high quality, educational illustration`;
                }

                const imageUrl = await this.generateImage(finalPrompt);

                // Enhanced HTML for image
                const imageHtml = `
                <div class="generated-image-container">
                    <img src="${imageUrl}" alt="${finalPrompt}" />
                </div>`;

                newContent = newContent.replace(m.full, imageHtml);
            } catch (e) {
                this.logger.error(`Failed to generate image for prompt "${m.content}": ${e}`);
                newContent = newContent.replace(m.full, `<div style="color:red; font-size:10px;">(Image error: ${m.content})</div>`);
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



    @OnWorkerEvent('completed')
    onCompleted(job: Job<LessonPreparationJobData>) {
        this.logger.log(`Lesson preparation job completed: ${job.id}`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<LessonPreparationJobData>, error: Error) {
        this.logger.error(`Lesson preparation job failed: ${job.id}, error: ${error.message}`);
    }
}
