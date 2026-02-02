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
    subject?: string;
    topic?: string;
    level?: string;
    interests?: string;
    generationTypes: string[];
    [key: string]: any;
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
        const { generationRequestId, subject, topic, level, interests, generationTypes, ...otherData } = job.data;
        this.logger.log(`Processing Lesson Preparation for request ${generationRequestId}`);

        try {
            const sections: { title: string; content: string; fileUrl?: string; fileType?: string }[] = [];
            const previousContext: string[] = [];

            // Iterate through each requested type and generate content
            for (const type of generationTypes) {
                this.logger.log(`Generating section: ${type}`);

                // SPECIAL HANDLER FOR PRESENTATION
                if (type === 'presentation') {
                    const pptxUrl = await this.generatePptx(subject || 'Презентация', topic || '', level || '', interests, previousContext.join('\n\n'));

                    const typeLabel = this.getTypeLabel(type);
                    sections.push({
                        title: typeLabel,
                        content: `<div class="presentation-download">
                            <h3>Готовая презентация</h3>
                            <p>Сгенерирована презентация из 5 слайдов с вашим дизайном.</p>
                            <a href="${pptxUrl}" class="download-btn" target="_blank">📥 Скачать презентацию (PPTX)</a>
                        </div>`,
                        fileUrl: pptxUrl,
                        fileType: 'pptx'
                    });

                    // Add context
                    previousContext.push(`Context from Presentation: Created a 5-slide presentation on ${topic}`);

                    // Update progress
                    await this.generationHelpers.updateProgress(generationRequestId, {
                        sections,
                        htmlResult: sections.map(s => s.content).join('\n\n'),
                    });
                    continue;
                }

                // 1. Generate content for this specific type
                const sectionRawContent = await this.generateSection(
                    type,
                    subject || '',
                    topic || '',
                    level || '',
                    interests,
                    previousContext.join('\n\n'),
                    otherData
                );

                // 2. Process images (only if not specialized HTML)
                let finalContent = sectionRawContent;
                if (!sectionRawContent.trim().startsWith('<!DOCTYPE html>')) {
                    finalContent = await this.processImageTags(sectionRawContent);
                }

                // 3. Format to HTML
                const typeLabel = this.getTypeLabel(type);
                let htmlContent = "";

                if (finalContent.trim().startsWith('<!DOCTYPE html>')) {
                    // It's already a full HTML document, use as is
                    htmlContent = finalContent;
                } else {
                    htmlContent = this.formatToHtml(finalContent, `${topic} - ${typeLabel}`);
                }

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

    private async generatePptx(subject: string, topic: string, level: string, interests: string | undefined, context: string): Promise<string> {
        // 1. Get structured JSON content from AI
        const prompt = `
ТЫ — ЛЕГЕНДАРНЫЙ ВИЗИОНЕР И АРТ-ДИРЕКТОР (уровень Steve Jobs + TED talk).
Твоя задача — спроектировать структуру образовательной презентации, которая вызовет "ВАУ-эффект" и визуальный экстаз.

ВВОДНЫЕ ДАННЫЕ:
- Предмет: ${subject}
- Тема: ${topic}
- Уровень: ${level}
${interests ? `- Интересы аудитории (Интегрируй их в метафоры и стиль!): ${interests}` : ''}

ГЛАВНЫЕ ПРАВИЛА (Mental Model):
1. **MINIMALISM IS KING:** Минимум текста на слайде. Только суть. Никаких "стен текста".
2. **STORYTELLING:** Это не лекция, это история. Используй "Путь героя", интригу, клиффхэнгеры.
3. **VISUAL VARIETY:** Каждый слайд должен иметь свой тип верстки (Layout).

ВЕРНИ СТРОГО ВАЛИДНЫЙ JSON С ТАКОЙ СТРУКТУРОЙ:
{
  "themeColor": "HEX Code (например #FF5733 — выбери цвет под настроение темы)",
  "slides": [
    {
      "layout": "COVER", // Типы: COVER (Титульный), BIG_FACT (Огромная цифра/Фраза), SPLIT (Картинка + Буллиты), CHALLENGE (Задание), QUOTE (Цитата/Вывод)
      "title": "Короткий панчлайн (Русский)",
      "content": ["Тезис 1", "Тезис 2"], // Для BIG_FACT или QUOTE здесь может быть одна строка или массив
      "imagePrompt": "High-end 3D render or vector art description in English...",
      "speakerNotes": "Что сказать учителю на этом слайде (Русский)"
    }
  ]
}

СЦЕНАРИЙ (РОВНО 5 СЛАЙДОВ):
1. **LAYOUT: COVER.** Название, от которого хочется кликнуть. Не скучное "Тема урока", а интрига.
2. **LAYOUT: BIG_FACT.** Разрыв шаблона. Одна гигантская цифра или шокирующий факт. Минимум слов.
3. **LAYOUT: SPLIT.** Объяснение через интерес ученика (игры/фильмы/жизнь). Картинка + 3 коротких буллита.
4. **LAYOUT: CHALLENGE.** Интерактив. Вопрос или мини-игра.
5. **LAYOUT: QUOTE.** Вдохновляющий финал или призыв к действию.

Язык контента: Русский. Стиль: Дерзкий, живой, для Gen Z.
`;

        const prediction = await this.runReplicatePrediction('anthropic/claude-3.5-sonnet', {
            prompt: prompt,
            max_tokens: 3000,
            system_prompt: "Output JSON ONLY.",
        });

        let rawJson = "";
        if (Array.isArray(prediction.output)) {
            rawJson = prediction.output.join('');
        } else {
            rawJson = prediction.output;
        }

        // Clean JSON using regex
        const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
        let parsedData: any;

        try {
            if (jsonMatch) {
                parsedData = JSON.parse(jsonMatch[0]);
            } else {
                parsedData = JSON.parse(rawJson);
            }

            if (!parsedData.slides || !Array.isArray(parsedData.slides)) {
                throw new Error("Invalid structure: missing slides array");
            }
        } catch (e) {
            this.logger.error("Failed to parse PPTX JSON. Raw: " + rawJson + ". Error: " + e.message);
            // Fallback minimal structure if parsing fails significantly
            parsedData = {
                themeColor: '#FF7E58',
                slides: [
                    { layout: 'COVER', title: topic, content: [], imagePrompt: `${topic} abstract art` },
                    { layout: 'BIG_FACT', title: 'Loading...', content: ['Error parsing content'], imagePrompt: null }
                ]
            };
        }

        const slidesData = parsedData.slides;
        const accentColor = parsedData.themeColor ? parsedData.themeColor.replace('#', '') : 'FF7E58';

        // 2. Generate Images
        const presImages: (string | null)[] = [];
        for (const slide of slidesData) {
            if (slide.imagePrompt) {
                try {
                    const styleSuffix = "minimalist, trending on artstation, vivid colors, high quality 3d render, 8k, no text";
                    const imgUrl = await this.generateImage(`${slide.imagePrompt}, ${styleSuffix}`);
                    presImages.push(imgUrl);
                } catch (e) {
                    presImages.push(null);
                }
            } else {
                presImages.push(null);
            }
        }

        // 3. Create PPTX
        const PptxGenJS = require("pptxgenjs");
        const pres = new PptxGenJS();
        pres.layout = 'LAYOUT_16x9';

        pres.defineSlideMaster({
            title: 'MASTER',
            background: { color: 'F4F4F5' },
            objects: [
                { rect: { x: 0, y: 0, w: 0.2, h: '100%', fill: accentColor } },
                { text: { text: 'PrepodavAI', x: 0.4, y: 7.2, fontSize: 10, color: 'AAAAAA', bold: true } }
            ]
        });

        slidesData.forEach((slide: any, index: number) => {
            const s = pres.addSlide({ masterName: 'MASTER' });
            const img = presImages[index];

            switch (slide.layout) {
                case 'COVER':
                    if (img) s.addImage({ path: img, x: 0, y: 0, w: '100%', h: '100%', transparency: 85 });
                    s.addText(slide.title.toUpperCase(), {
                        x: 0.5, y: 2.5, w: '90%', h: 2,
                        fontSize: 64, color: '2D3748', bold: true, align: 'center', fontFace: 'Arial Black'
                    });
                    s.addText(topic, {
                        x: 0.5, y: 4.5, w: '90%', fontSize: 24, color: accentColor, align: 'center'
                    });
                    break;

                case 'BIG_FACT':
                    s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: '50%', h: '100%', fill: accentColor });

                    const factText = Array.isArray(slide.content) ? slide.content[0] : slide.content;
                    s.addText(factText, {
                        x: 0.2, y: 1.5, w: '45%', h: 4,
                        fontSize: 80, color: 'FFFFFF', bold: true, align: 'center'
                    });

                    s.addText(slide.title, {
                        x: 5.5, y: 2.5, w: '45%',
                        fontSize: 32, color: '2D3748', bold: true
                    });
                    break;

                case 'SPLIT':
                    if (img) s.addImage({ path: img, x: 0.5, y: 1.5, w: 4.5, h: 4.5, sizing: { type: 'cover', w: 4.5, h: 4.5, r: 20 } });

                    s.addText(slide.title, {
                        x: 5.2, y: 0.8, w: '50%',
                        fontSize: 32, color: accentColor, bold: true
                    });

                    const bulletsData = Array.isArray(slide.content) ? slide.content : [slide.content];
                    const bullets = bulletsData.map((b: string) => ({ text: b, options: { breakLine: true } }));

                    s.addText(bullets, {
                        x: 5.2, y: 1.8, w: '50%', h: 4,
                        fontSize: 18, color: '4A5568', bullet: { code: '25CF', color: accentColor }, lineSpacing: 35
                    });
                    break;

                case 'CHALLENGE':
                    s.background = { color: '1A202C' };
                    s.addText("CHALLENGE TIME", { x: 0, y: 0.5, w: '100%', align: 'center', color: accentColor, fontSize: 14, bold: true });

                    s.addText(slide.title, {
                        x: 1, y: 1.5, w: '80%', h: 1.5,
                        fontSize: 40, color: 'FFFFFF', bold: true, align: 'center'
                    });

                    if (img) s.addImage({ path: img, x: 3.5, y: 3.2, w: 6, h: 3 });
                    break;

                case 'QUOTE':
                    s.addText("“", { x: 0.5, y: 1.0, fontSize: 100, color: accentColor, fontFace: 'Georgia' });
                    s.addText(slide.title, {
                        x: 1.5, y: 2.0, w: '70%',
                        fontSize: 36, color: '2D3748', italic: true, align: 'center', fontFace: 'Georgia'
                    });
                    const quoteAuthor = Array.isArray(slide.content) ? slide.content[0] : slide.content;
                    s.addText(quoteAuthor, {
                        x: 4, y: 5, w: '50%', fontSize: 18, color: '718096', align: 'right'
                    });
                    break;

                default:
                    s.addText(slide.title, { x: 0.5, y: 0.5, w: '90%', fontSize: 24, bold: true, color: '2D3748' });
                    break;
            }

            if (slide.speakerNotes) {
                s.addNotes(slide.speakerNotes);
            }
        });

        // 4. Save file
        const fileName = `presentation_${Date.now()}.pptx`;
        const buffer = await pres.write({ outputType: 'nodebuffer' });

        // Use FilesService to save the file properly (handles paths, hashing, and URL generation)
        const savedFile = await this.filesService.saveBuffer(buffer as Buffer, fileName);

        this.logger.log(`Presentation saved: ${savedFile.url}`);
        return savedFile.url;
    }

    private getTypeLabel(type: string): string {
        const map: Record<string, string> = {
            lessonPlan: 'План урока',
            worksheet: 'Рабочий лист',
            presentation: 'Структура презентации',
            quest: 'Сценарий квеста',
            visuals: 'Тематические изображения',
            quiz: 'Тест',
            content: 'Учебный материал',
            unpacking: 'Распаковка и Продуктовая линейка'
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

    private getSpecializedPrompt(type: string, subject: string, topic: string, level: string, extraData: any = {}): { systemPrompt: string, userPrompt: string } | null {
        const logoUrlStr = this.logoUrl;

        switch (type) {
            case 'unpacking':
                const answers = [
                    `1) Что вас подтолкнуло заниматься преподаванием? Какие события? Ситуации? Возможно, знаковое событие, которое стало поворотной точкой: ${extraData.q1 || '-'}`,
                    `2) Что вы делаете лучше всего? Что вам дается в преподавании легче и проще всего? Какой деятельностью можете заниматься часами и не уставать?: ${extraData.q2 || '-'}`,
                    `3) За что вам чаще всего говорят “спасибо” ученики и их родители?: ${extraData.q3 || '-'}`,
                    `4) Каким вашим знаниям/достижениям, чаще всего удивляются люди?: ${extraData.q4 || '-'}`,
                    `5) Чем вы гордитесь в жизни? (5 достижений, связанных даже косвенно с преподаванием): ${extraData.q5 || '-'}`,
                    `6) Какие действия вы предприняли для этих 5 достижений?: ${extraData.q6 || '-'}`,
                    `7) Что уникального, авторского в сфере преподавания, было создано вами? Даже мелочи важны.: ${extraData.q7 || '-'}`,
                    `8) С какими учениками вам нравится заниматься больше всего?: ${extraData.q8 || '-'}`,
                    `9) Почему именно с этой категорией учеников?: ${extraData.q9 || '-'}`,
                    `10) Какой категории учеников вы можете дать результат самым быстрым и эффективным способом? Почему?: ${extraData.q10 || '-'}`,
                    `11) Какие ваши личностные качества больше всего влияют на вашу преподавательскую деятельность?: ${extraData.q11 || '-'}`,
                    `12) Какие ошибки вы допускали в своем преподавательском пути, как исправляли их, какие выводы сделали, чтобы их не повторить?: ${extraData.q12 || '-'}`,
                    `13) 3 аспекта преподавания, которые вызывают у вас больше всего вдохновения: ${extraData.q13 || '-'}`
                ].join('\n');

                return {
                    systemPrompt: `Ты — Маркетолог и Бренд-Стратег мирового уровня с опытом в EdTech.
Твоя задача — провести глубокую "Распаковку личности и экспертности" преподавателя и создать стратегию Продуктовой Линейки.

ИСХОДНЫЕ ДАННЫЕ:
Ты получишь ответы на 13 глубинных вопросов о личности, опыте, методкие и учениках эксперта.

ТВОЯ ЦЕЛЬ:
Проанализировать ответы и синтезировать их в продающую Самопрезентацию и Структуру Продуктов.

ФОРМАТ ОТВЕТА (HTML):
Документ должен быть с красивым, дорогим, современным дизайном (тени, скругления, акценты).
Используй логотип: "${logoUrlStr}" в шапке.

СТРУКТУРА ОТЧЕТА:
1.  **ШАПКА**
    - Заголовок: "Стратегия Личного Бренда и Продуктовая Линейка"
    - Подзаголовок: "Распаковка Экспертности"

2.  **БЛОК 1: КТО Я (САМОПРЕЗЕНТАЦИЯ)**
    - *Задача*: Написать захватывающую историю героя (Storytelling) на основе ответов 1, 5, 6, 8, 11, 12, 13.
    - Сформулируй "Миссию" и "Ценности".
    - Выдели "Суперсилу" (ответы 2, 4, 7).
    - Это текст для страницы "Обо мне" или приветственного поста.

3.  **БЛОК 2: МОЙ ИДЕАЛЬНЫЙ УЧЕНИК (АВАТАР)**
    - На основе ответов 8, 9, 10.
    - Опиши профиль клиента, с которым эксперт работает эффективнее всего.

4.  **БЛОК 3: ПРОДУКТОВАЯ ЛИНЕЙКА (Strategy)**
    - Предложи 3 уровня продуктов, логично вытекающих из экспертности:
        - **Tripwire (Вводный продукт)**: Недорогой, легкий вход, быстрый результат.
        - **Core Product (Флагман)**: Основной курс или услуга.
        - **VIP (Премиум)**: Личное сопровождение или эксклюзив.
    - Для каждого продукта напиши: Название, Оффер (Обещание), Для кого.

5.  **БЛОК 4: ПОЧЕМУ Я? (Reason to Believe)**
    - Убеждающие аргументы на основе "За что благодарят" (3) и "Уникальности" (7).

СТИЛЬ И ТОН:
- Вдохновляющий, экспертный, уверенный.
- Используй "Мы" или "Я" в зависимости от контекста истории.
- Оформление: Карточки, списки с иконками ✅, выделенные цитаты.

ТЕХНИЧЕСКИЕ ТРЕБОВАНИЯ:
- Только чистый HTML внутри <!DOCTYPE html>.
- CSS внутри <style>. Сделай красиво! Используй шрифт 'Inter' или 'Roboto'.
- Адаптивность для мобильных.`,
                    userPrompt: `Проведи распаковку для эксперта на основе следующих ответов:\n\n${answers}\n\nСоздай полную стратегию личного бренда и продуктовой линейки.`
                };

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
        context: string,
        extraData: any = {}
    ): Promise<string> {

        // Check for specialized prompt
        const specialized = this.getSpecializedPrompt(targetType, subject, topic, level, extraData);

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
