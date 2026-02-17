import { Processor, WorkerHost, OnWorkerEvent, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GenerationHelpersService } from '../generation-helpers.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HtmlExportService } from '../../../common/services/html-export.service';
import { FilesService } from '../../files/files.service';
import { HtmlPostprocessorService } from '../../../common/services/html-postprocessor.service';
import { LOGO_BASE64, SHARED_CSS, SHARED_MATHJAX_SCRIPT } from '../generation.constants';

export interface LessonPreparationJobData {
    generationRequestId: string;
    subject?: string;
    topic?: string;
    level?: string;
    interests?: string;
    generationTypes: string[];
    [key: string]: any;
}

@Processor('lesson-preparation', { concurrency: 1 })
export class LessonPreparationProcessor extends WorkerHost {
    private readonly logger = new Logger(LessonPreparationProcessor.name);
    private readonly replicateToken: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly generationHelpers: GenerationHelpersService,
        private readonly prisma: PrismaService,
        private readonly htmlExportService: HtmlExportService,
        private readonly filesService: FilesService,
        private readonly htmlPostprocessor: HtmlPostprocessorService,
        @InjectQueue('lesson-preparation') private readonly lessonQueue: Queue,
    ) {
        super();
        this.replicateToken = this.configService.get<string>('REPLICATE_API_TOKEN');
        if (!this.replicateToken) {
            this.logger.warn('REPLICATE_API_TOKEN is not configured. Lesson preparation generation will not work.');
        }
    }



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
                    const { pptxUrl, htmlUrl } = await this.generatePresentationPackage(subject || 'Презентация', topic || '', level || '', interests, previousContext.join('\n\n'));

                    const typeLabel = this.getTypeLabel(type);
                    sections.push({
                        title: typeLabel,
                        content: `<div class="presentation-download" style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e9ecef;">
                            <h3 style="margin-top: 0; color: #2d3748;">✨ Ваша Легендарная Презентация готова</h3>
                            <p style="color: #718096; margin-bottom: 20px;">Мы создали для вас структуру из 5 слайдов с премиальным дизайном.</p>
                            
                            <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                                <a href="${htmlUrl}" target="_blank" class="btn-open" style="
                                    background: #3182ce; 
                                    color: white; 
                                    padding: 12px 24px; 
                                    border-radius: 8px; 
                                    text-decoration: none; 
                                    font-weight: 600; 
                                    display: inline-flex; 
                                    align-items: center; 
                                    gap: 8px;
                                    transition: transform 0.2s;
                                ">
                                    👁️ Открыть (Смотреть)
                                </a>

                                <a href="${pptxUrl}" download class="btn-download" style="
                                    background: #FF7E58; 
                                    color: white; 
                                    padding: 12px 24px; 
                                    border-radius: 8px; 
                                    text-decoration: none; 
                                    font-weight: 600; 
                                    display: inline-flex; 
                                    align-items: center; 
                                    gap: 8px;
                                    transition: transform 0.2s;
                                ">
                                    💾 Скачать (PPTX)
                                </a>
                            </div>
                            <p style="font-size: 12px; color: #a0aec0; margin-top: 15px;">*Для редактирования скачайте PPTX файл</p>
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

    // Updated to use Legendary Visionary Presentation Engine
    private async generatePresentationPackage(subject: string, topic: string, level: string, interests: string | undefined, context: string): Promise<{ pptxUrl: string, htmlUrl: string }> {
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
3. **VISUAL METAPHOR:** Для всей презентации выбери единую визуальную метафору (например, 'Строительство дома' для структуры эссе или 'Путешествие в космос' для целей). Опиши эту метафору в imagePrompt.
4. **VISUAL VARIETY:** Каждый слайд должен иметь свой тип верстки (Layout).

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
        const savedPptx = await this.filesService.saveBuffer(buffer as Buffer, fileName);

        // 5. Generate and Save HTML View
        const htmlContent = this.generateHtmlPresentation(slidesData, presImages, accentColor);
        const htmlFileName = `presentation_${Date.now()}.html`;
        const savedHtml = await this.filesService.saveBuffer(Buffer.from(htmlContent), htmlFileName);

        this.logger.log(`Presentation package saved: PPTX=${savedPptx.url}, HTML=${savedHtml.url}`);
        return {
            pptxUrl: savedPptx.url,
            htmlUrl: savedHtml.url
        };
    }

    private generateHtmlPresentation(slides: any[], images: (string | null)[], accentColor: string): string {
        const logoUrl = LOGO_BASE64;

        const slidesHtml = slides.map((slide, index) => {
            const img = images[index];
            let contentHtml = '';

            // Layout logic for HTML
            switch (slide.layout) {
                case 'COVER':
                    contentHtml = `
                        <div class="slide-content cover" style="background: ${img ? `url('${img}') center/cover no-repeat` : accentColor}; position: relative;">
                            ${img ? '<div class="overlay"></div>' : ''}
                            <div class="content-wrapper" style="z-index: 2;">
                                <h1 style="font-size: 3.5rem; color: ${img ? '#fff' : '#fff'}; text-transform: uppercase; margin-bottom: 20px;">${slide.title}</h1>
                                <p style="font-size: 1.5rem; color: ${img ? '#e2e8f0' : '#fff'}; opacity: 0.9;">PrepodavAI Presentation</p>
                            </div>
                        </div>
                    `;
                    break;
                case 'BIG_FACT':
                    const fact = Array.isArray(slide.content) ? slide.content[0] : slide.content;
                    contentHtml = `
                        <div class="slide-content big-fact" style="display: flex;">
                            <div class="left" style="flex: 1; background: #${accentColor}; display: flex; align-items: center; justify-content: center; padding: 40px;">
                                <div style="font-size: 5rem; font-weight: bold; color: white; line-height: 1.1;">${fact}</div>
                            </div>
                            <div class="right" style="flex: 1; display: flex; align-items: center; padding: 50px;">
                                <h2 style="font-size: 2.5rem; color: #2d3748;">${slide.title}</h2>
                            </div>
                        </div>
                    `;
                    break;
                case 'SPLIT':
                    const bullets = Array.isArray(slide.content) ? slide.content : [slide.content];
                    contentHtml = `
                        <div class="slide-content split" style="display: flex; gap: 40px; padding: 50px; align-items: center;">
                            <div class="visual" style="flex: 1;">
                                ${img ? `<img src="${img}" style="width: 100%; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.1);" />` : `<div style="width: 100%; height: 400px; background: #edF2F7; border-radius: 20px;"></div>`}
                            </div>
                            <div class="text" style="flex: 1;">
                                <h2 style="color: #${accentColor}; font-size: 2rem; margin-bottom: 30px;">${slide.title}</h2>
                                <ul style="list-style: none; padding: 0;">
                                    ${bullets.map((b: string) => `<li style="font-size: 1.3rem; margin-bottom: 20px; display: flex; gap: 15px; color: #4a5568;"><span style="color: #${accentColor};">●</span> ${b}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                    `;
                    break;
                case 'CHALLENGE':
                    contentHtml = `
                        <div class="slide-content challenge" style="background: #1a202c; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px;">
                            <div style="color: #${accentColor}; font-weight: bold; letter-spacing: 2px; margin-bottom: 20px;">CHALLENGE TIME</div>
                            <h2 style="font-size: 3rem; margin-bottom: 40px;">${slide.title}</h2>
                            ${img ? `<img src="${img}" style="max-height: 300px; border-radius: 12px;" />` : ''}
                        </div>
                    `;
                    break;
                case 'QUOTE':
                    const quote = Array.isArray(slide.content) ? slide.content[0] : slide.content;
                    contentHtml = `
                        <div class="slide-content quote" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 60px;">
                            <div style="font-size: 6rem; color: #${accentColor}; font-family: Georgia; line-height: 1;">“</div>
                            <h2 style="font-size: 2.5rem; font-family: Georgia; font-style: italic; color: #2d3748; margin: 20px 0;">${slide.title}</h2>
                            <p style="font-size: 1.2rem; color: #718096; margin-top: 30px;">— ${quote}</p>
                        </div>
                    `;
                    break;
                default:
                    contentHtml = `<div style="padding: 50px;"><h1>${slide.title}</h1></div>`;
            }

            return `
                <div class="swiper-slide">
                    <div class="slide-container">
                        ${contentHtml}
                        <div class="logo-badge">
                            <img src="${logoUrl}" alt="Logo" />
                            <span>PrepodavAI</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PrepodavAI Presentation</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css" />
    <style>
        body { margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif; background: #000; height: 100vh; display: flex; align-items: center; justify-content: center; }
        .swiper { width: 100%; height: 100%; max-width: 1200px; max-height: 675px; background: white; }
        .swiper-slide { display: flex; align-items: stretch; justify-content: stretch; background: white; overflow: hidden; }
        .slide-container { width: 100%; height: 100%; position: relative; display: flex; flex-direction: column; justify-content: center; }
        
        .overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); z-index: 1; }
        .logo-badge { position: absolute; top: 20px; left: 30px; display: flex; align-items: center; gap: 10px; z-index: 10; background: rgba(255,255,255,0.9); padding: 8px 16px; border-radius: 50px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .logo-badge img { height: 24px; }
        .logo-badge span { font-weight: bold; color: #2d3748; font-size: 14px; }
        
        /* Navigation Buttons */
        .swiper-button-next, .swiper-button-prev { color: #${accentColor} !important; background: white; width: 50px; height: 50px; border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .swiper-button-next:after, .swiper-button-prev:after { font-size: 20px; font-weight: bold; }
        
        .slide-content { width: 100%; height: 100%; }
    </style>
</head>
<body>
    <div class="swiper">
        <div class="swiper-wrapper">
            ${slidesHtml}
        </div>
        <div class="swiper-button-next"></div>
        <div class="swiper-button-prev"></div>
        <div class="swiper-pagination"></div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>
    <script>
        const swiper = new Swiper('.swiper', {
            effect: 'fade',
            speed: 600,
            navigation: {
                nextEl: '.swiper-button-next',
                prevEl: '.swiper-button-prev',
            },
            pagination: {
                el: '.swiper-pagination',
                clickable: true,
            },
            keyboard: {
                enabled: true,
            },
        });
    </script>
</body>
</html>
        `;
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
            .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>');

        const logoUrl = LOGO_BASE64;

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            ${SHARED_CSS}
            <style>
                @page {
                    size: A4;
                    margin: 0;
                }
                /* Overlay specific print styles on top of SHARED_CSS if needed */
                body {
                    width: 210mm;
                    min-height: 297mm;
                    margin: 0 auto;
                    padding: 20mm;
                    box-sizing: border-box;
                }
                /* Additional manual styles for generated content structure */
                .generated-image-container {
                    margin: 30px auto;
                    text-align: center;
                    page-break-inside: avoid;
                    max-width: 80%;
                }
                .generated-image-container img {
                    max-width: 100%;
                    max-height: 100mm;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                }
            </style>
            ${SHARED_MATHJAX_SCRIPT}
        </head>
        <body>
            <div class="header">
                <img src="${logoUrl}" alt="PrepodavAI Logo" class="header-logo" />
                <h1>${title}</h1>
            </div>

            ${formattedBody}

            <div class="footer-logo">
                <img src="${logoUrl}" alt="PrepodavAI Logo" />
                <div style="font-size: 10px; color: #9CA3AF; margin-top: 5px;">Сгенерировано с помощью PrepodavAI</div>
            </div>
        </body>
        </html>
        `;
    }

    private getSpecializedPrompt(type: string, subject: string, topic: string, level: string, extraData: any = {}): { systemPrompt: string, userPrompt: string } | null {
        const logoUrlStr = LOGO_BASE64;

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
You are a WORLD-CLASS Award-Winning Educational Content Creator (History Channel / Discovery Style).
Your name is "PrepodavAI Genius".
Your goal is to create a **"WOW-EFFECT" ${typeLabel}** that is deeply engaging, narrative-driven, and visually structured.

**CRITICAL: LANGUAGE FORMULAS & IMAGES**
1. **OUTPUT LANGUAGE: STRICTLY RUSSIAN (Русский язык).**
2. **Formulas:** MUST use LaTeX format wrapped in \`\\(\` and \`\\)\` for inline and \`\\[\` and \`\\]\` for block equations. Example: \\(E=mc^2\\). STRICTLY FORBIDDEN: \`$\` and \`$$\`.
3. **Images:** Generate prompts strictly relevant to the content. Images should support the narrative, not just be decoration.

DETAILS:
- Subject: ${subject}
- Topic: ${topic}
- Target Level: ${level}
${interestsStr}

CONTEXT from previous sections:
${context}

--------
CREATIVE DIRECTION (THE "WOW" FACTOR):
1. **DEEP NARRATIVE (Storytelling):** Do NOT write short, bullet-point summaries. Write **rich, detailed paragraphs**. Unfold the topic like a fascinating story. Use hooks, questions, and vivid language.
2. **EDUCATIONAL DEPTH:** Explain concepts thoroughly. If it's a "Worksheet", provide context before questions. If it's a "Lesson Plan", assume the teacher wants a script.
3. **PERSONALIZATION:** Weave the student's interests (${interests || 'general'}) into the fabric of the explanation. Use analogies from their world.

IMAGE INSTRUCTIONS (CRITICAL):
- Act as an Art Director. Insert image placeholders where they enhance the story.
- **Format:** [IMAGE: <style description> | <detailed visual prompt>]
- **Styles:** "Historical reconstruction", "Scientific diagram", "Atmospheric concept art", "Minimalist vector".
- **Rule:** Images should NOT be generic. If talking about Caesar, the image must show Caesar crossing the Rubicon, not just a Roman helmet.
- **Limit:** 2-3 high-quality images per section.
- **Text in images:** If needed, specify "Russian text".

STRUCTURE & FORMATTING:
- Use Markdown.
- **Headings:** Intriguing and descriptive.
- **Body:** Use a mix of long-form text (story) and structured elements (tables, lists) where appropriate.
- **Layout:** Alternate between Text and Images to create a magazine-like flow.

OUTPUT GOAL:
Create the content for **${typeLabel}** in Russian.
Make it immersive. Make it detailed. Make it beautiful.
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
        let attempts = 0;
        const maxAttempts = 5;
        let delayMs = 2000;

        while (attempts < maxAttempts) {
            try {
                // Determine URL based on whether it's a model version or a model alias
                const url = `https://api.replicate.com/v1/models/${model}/predictions`;

                const response = await axios.post(
                    url,
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

            } catch (error: any) {
                if (axios.isAxiosError(error) && (error.response?.status === 429 || error.response?.status >= 500)) {
                    attempts++;
                    this.logger.warn(`Replicate API error ${error.response?.status}. Retrying in ${delayMs}ms... (Attempt ${attempts}/${maxAttempts})`);
                    if (attempts >= maxAttempts) {
                        throw error;
                    }
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    delayMs *= 2; // Exponential backoff
                } else {
                    throw error; // Propagate other errors
                }
            }
        }
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
