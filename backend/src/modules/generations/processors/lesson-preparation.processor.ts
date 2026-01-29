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

    private readonly logoUrl = "https://fs.cdn-chatium.io/thumbnail/image_gc_AmbUAlw8Yq.1024x1024.png/s/128x";

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
            quiz: 'Тест',
            vocabulary: 'Словарь (глоссарий)',
            content: 'Учебный материал',
            feedback: 'Критерии и рубрики оценки',
            message: 'Сообщение для рассылки',
            game: 'Идеи сценариев игр'
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

        // Use class property instead of hardcoded
        const logoUrl = this.logoUrl;

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { 
                    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
                    max-width: 900px; 
                    margin: 0 auto; 
                    padding: 40px; 
                    line-height: 1.6; 
                    white-space: pre-wrap; 
                    color: #333;
                    background-color: #fff;
                    position: relative;
                }
                
                /* Header Layout */
                .header-container {
                    display: flex;
                    align-items: center;
                    gap: 30px;
                    margin-bottom: 40px;
                    border-bottom: 2px solid #FF7E58;
                    padding-bottom: 20px;
                }
                .header-logo {
                    height: 120px;
                    flex-shrink: 0;
                }
                h1.main-title { 
                    font-size: 2.5em; 
                    color: #1a202c; 
                    margin: 0; 
                    line-height: 1.2;
                    flex-grow: 1;
                }

                /* Footer Layout */
                .footer-container {
                    margin-top: 80px;
                    border-top: 1px solid #eee;
                    padding-top: 30px;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end; /* Align right */
                    text-align: right;
                }
                .footer-logo {
                    height: 80px;
                    opacity: 0.8;
                    margin-bottom: 10px;
                }
                .footer-text {
                    font-size: 12px; 
                    color: #888;
                }
                
                h2, h3 { color: #2d3748; margin-top: 1.5em; margin-bottom: 0.5em; }
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
            <div class="header-container">
                <img src="${logoUrl}" alt="PrepodavAI Logo" class="header-logo" />
                <h1>${title}</h1>
            </div>
            
            ${formattedBody}
            
            <div class="footer-container">
                <img src="${logoUrl}" alt="PrepodavAI Logo" class="footer-logo" />
                <div class="footer-text">Сгенерировано с помощью PrepodavAI</div>
            </div>
        </body>
        </html>
        `;
    }

    private getSpecializedPrompt(type: string, subject: string, topic: string, level: string): { systemPrompt: string, userPrompt: string } | null {
        const logoUrlStr = this.logoUrl;

        switch (type) {
            case 'quiz':
                return {
                    systemPrompt: `Ты — профессиональный технический генератор кода. Твоя единственная функция — выдавать чистый HTML-код.
ЗАДАЧА: Сгенерировать полноценный HTML-документ с ТЕСТОМ (QUIZ).
КРИТИЧЕСКИЕ ПРАВИЛА:
1. Только код (начинается с <!DOCTYPE html>).
2. Никакого текста до или после.
3. Вставь скрипт MathJax.
ТРЕБОВАНИЯ К ДИЗАЙНУ:
- Контейнер max-width: 720px, центрирование.
- Логотип в шапке (слева) и футере (справа). URL логотипа: "${logoUrlStr}"
- Стиль: строгий, профессиональный.
`,
                    userPrompt: `Сгенерируй HTML-код теста.
Предмет: ${subject}
Тема: ${topic}
Уровень: ${level}
Количество вопросов: 10
Вариантов ответа: 4

СТРУКТУРА:
1. Шапка: Логотип слева ("${logoUrlStr}"), заголовок теста справа.
2. Список вопросов.
3. Ключи с ответами в конце.
4. Футер: Логотип справ ("${logoUrlStr}") в самом низу.
`
                };

            case 'vocabulary':
                return {
                    systemPrompt: `Ты — профессиональный генератор учебных материалов. Выдай чистый HTML-код СЛОВАРЯ.
URL Логотипа: "${logoUrlStr}"
ТРЕБОВАНИЯ:
- Полный HTML документ.
- Красивый, строгий дизайн (энциклопедический стиль).
- Логотип в шапке и футере.
`,
                    userPrompt: `Сгенерируй словарь терминов.
Тема: ${topic}
Предмет: ${subject}
Уровень: ${level}
Количество слов: 15-20

Формат: Термин - Определение - Пример.
Оформи как красивую HTML страницу с логотипом ("${logoUrlStr}").`
                };

            case 'content':
                return {
                    systemPrompt: `Ты — методист. Сгенерируй учебный материал в формате HTML.
URL Логотипа: "${logoUrlStr}"
Дизайн: Минималистичный, как техническая спецификация или учебник.
`,
                    userPrompt: `Создай учебный материал (конспект) по теме:
Предмет: ${subject}
Тема: ${topic}
Уровень: ${level}

Структурируй материал, добавь примеры. Оформи в HTML с логотипом ("${logoUrlStr}") в шапке и футере.
`
                };

            case 'feedback':
                return {
                    systemPrompt: `Ты — педагог-эксперт. Сгенерируй шаблон фидбека (критерии оценки) в формате HTML.
URL Логотипа: "${logoUrlStr}"
Стиль: Профессиональный аудит.
`,
                    userPrompt: `Создай критерии оценки и рубрикатор для темы: "${topic}" (${subject}, ${level}).
Опиши, как оценивать работу ученика.
Оформи как HTML документ с логотипом ("${logoUrlStr}").`
                };

            case 'message':
                return {
                    systemPrompt: `Ты — учитель. Сгенерируй сообщение для чата/рассылки в формате HTML (как красивое письмо).
URL Логотипа: "${logoUrlStr}"
Стиль: Официально-деловой, вежливый.
`,
                    userPrompt: `Напиши сообщение родителям/ученикам по теме: "${topic}" (${subject}).
Важные моменты: подготовка к уроку, домашнее задание или организационные вопросы.
Оформи как HTML письмо с логотипом ("${logoUrlStr}").`
                };

            case 'game':
                return {
                    systemPrompt: `Ты — геймдизайнер образовательных игр. Сгенерируй ДИЗАЙН-ДОКУМЕНТ игры в формате HTML.
URL Логотипа: "${logoUrlStr}"
Задача: Придумать интересную игру или викторину по теме и оформить контент (вопросы, карточки) в виде красивой таблицы или списков.
НЕ генерируй сложный JS код, генерируй КОНТЕНТ игры (текст и правила), который можно распечатать или использовать в классе.
`,
                    userPrompt: `Придумай игру по теме "${topic}" (${subject}, ${level}).
Тип: Викторина, Квест или Ролевая игра.
Дай полное описание правил и СПИСОК ВОПРОСОВ/ЗАДАНИЙ с ответами.
Оформи как красивый HTML документ с логотипом ("${logoUrlStr}") в шапке и футере.`
                };

            default:
                return null;
        }
    }

    private async generateSection(
        targetType: string,
        subject: string,
        topic: string,
        level: string,
        interests: string | undefined,
        context: string
    ): Promise<string> {

        // Check for specialized prompt
        const specialized = this.getSpecializedPrompt(targetType, subject, topic, level);

        if (specialized) {
            this.logger.log(`Using specialized prompt for ${targetType}`);
            const prediction = await this.runReplicatePrediction('anthropic/claude-3.5-sonnet', {
                prompt: specialized.userPrompt,
                max_tokens: 5000,
                system_prompt: specialized.systemPrompt,
            });
            let rawOutput = "";
            if (Array.isArray(prediction.output)) {
                rawOutput = prediction.output.join('');
            } else if (typeof prediction.output === 'string') {
                rawOutput = prediction.output;
            }
            return rawOutput;
        }

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

        // Process strictly max 3 images
        for (let i = 0; i < matches.length; i++) {
            const m = matches[i];

            if (i >= 3) {
                // Remove extra image tags
                newContent = newContent.replace(m.full, '');
                continue;
            }

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
                // Remove failed tags or show error (removing is cleaner for production)
                newContent = newContent.replace(m.full, '');
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
