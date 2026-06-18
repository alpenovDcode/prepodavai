import { Processor, WorkerHost, OnWorkerEvent, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { marked } from 'marked';
import { GenerationHelpersService } from '../generation-helpers.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { HtmlExportService } from '../../../common/services/html-export.service';
import { FilesService } from '../../files/files.service';
import { HtmlPostprocessorService } from '../../../common/services/html-postprocessor.service';
import { LOGO_BASE64, SHARED_CSS, SHARED_MATHJAX_SCRIPT } from '../generation.constants';

// Глобальная настройка marked: GFM (таблицы, ~~strikethrough~~, autolinks),
// конверсия одиночных \n в <br>. HTML-вставки модели (input/figure/...) проходят как есть.
marked.use({ gfm: true, breaks: true });

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
      this.logger.warn(
        'REPLICATE_API_TOKEN is not configured. Lesson preparation generation will not work.',
      );
    }
  }

  async process(job: Job<LessonPreparationJobData>): Promise<void> {
    const { generationRequestId, subject, topic, level, interests, generationTypes, ...otherData } =
      job.data;
    this.logger.log(`Processing Lesson Preparation for request ${generationRequestId}`);

    // Fetch userId to comply with FilesService security requirements
    const generation = await this.prisma.userGeneration.findUnique({
      where: { generationRequestId },
      select: { userId: true },
    });
    const userId = generation?.userId;

    try {
      const sections: { title: string; content: string; fileUrl?: string; fileType?: string }[] =
        [];
      const previousContext: string[] = [];

      // Iterate through each requested type and generate content
      const typesToProcess = Array.isArray(generationTypes) ? generationTypes : [];
      for (const type of typesToProcess) {
        this.logger.log(`Generating section: ${type}`);

        // SPECIAL HANDLER FOR PRESENTATION
        if (type === 'presentation') {
          const { pptxUrl, htmlUrl } = await this.generatePresentationPackage(
            subject || 'Презентация',
            topic || '',
            level || '',
            interests,
            previousContext.join('\n\n'),
            userId,
          );

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
            fileType: 'pptx',
          });

          // Add context
          previousContext.push(
            `Context from Presentation: Created a 5-slide presentation on ${topic}`,
          );

          // Update progress
          await this.generationHelpers.updateProgress(generationRequestId, {
            sections,
            htmlResult: this.combineHtmlSections(sections),
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
          otherData,
        );

        // 2. Process images (only if not specialized HTML)
        let finalContent = sectionRawContent;
        if (!sectionRawContent.trim().startsWith('<!DOCTYPE html>')) {
          finalContent = await this.processImageTags(sectionRawContent, subject);
        }

        // 3. Format to HTML
        const typeLabel = this.getTypeLabel(type);
        let htmlContent = '';

        if (finalContent.trim().startsWith('<!DOCTYPE html>')) {
          // It's already a full HTML document, use as is
          htmlContent = finalContent;
        } else {
          htmlContent = this.formatToHtml(finalContent, `${topic} - ${typeLabel}`);
        }

        // 4. Post-process and Add to sections list
        const processedHtml = this.htmlPostprocessor.process(htmlContent);
        sections.push({
          title: typeLabel,
          content: processedHtml,
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
          htmlResult: this.combineHtmlSections(sections),
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
        htmlResult: this.combineHtmlSections(sections),
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
  private async generatePresentationPackage(
    subject: string,
    topic: string,
    level: string,
    interests: string | undefined,
    context: string,
    userId?: string,
  ): Promise<{ pptxUrl: string; htmlUrl: string }> {
    // 1. Get structured JSON content from AI
    const prompt = `
ТЫ — CHIEF DESIGN OFFICER и ЛЕГЕНДАРНЫЙ ВИЗИОНЕР (уровень презентаций Apple + лучшие TED talks).
Твоя задача — спроектировать структуру образовательной презентации, которая вызовет "ВАУ-эффект", удержит внимание от первой до последней секунды и будет ИДЕАЛЬНО смотреться на экранах формата 16:10.

ВВОДНЫЕ ДАННЫЕ:
- Предмет: ${subject}
- Тема: ${topic}
- Уровень аудитории: ${level}
${interests ? `- Интересы аудитории (Интегрируй их в метафоры и стиль!): ${interests}` : ''}
- Дополнительный контекст: ${context}

ГЛАВНЫЕ ЗАКОНЫ ДИЗАЙНА И ВЕРСТКИ (Формат 16:10):
1. **ASPECT RATIO 16:10 AWARENESS:** Это широкий формат. Используй композицию, где элементы дышат. Идеально работают горизонтальные сплиты (текст слева 40% / картинка справа 60%).
2. **NEGATIVE SPACE (ПУСТОЕ ПРОСТРАНСТВО):** В каждом \`imagePrompt\` ты ОБЯЗАН указывать "empty negative space on the left/right/top for text placement", чтобы сгенерированный фон не мешал чтению текста.
3. **TYPOGRAPHY & MINIMALISM:** Никаких "стен текста". Правило 3х3: максимум 3 буллита на слайд, максимум 6-8 слов в буллите. Используй хлесткие заголовки (панчлайны).
4. **VISUAL METAPHOR:** Придумай единую мощную визуальную метафору для всей презентации (например, 'Неоновый киберпанк-город' для темы нейросетей или 'Кинематографичный космос' для физики) и протащи её через все imagePrompt.
5. **STORYTELLING ARC:** Вступление (Хук/Интрига) -> Проблема (Боль/Шок-факт) -> Решение (Суть темы через интересы) -> Интерактив (Проверка/Игра) -> Заключение (Вдохновляющий финал).

ВЕРНИ СТРОГО ВАЛИДНЫЙ JSON БЕЗ МАРКДАУН-ОБЕРТОК (без \`\`\`json) СО СЛЕДУЮЩЕЙ СТРУКТУРОЙ:
{
  "designSystem": {
    "themeColor": "HEX Code (Основной акцентный цвет, например #FF2A5F)",
    "backgroundColor": "HEX Code (Цвет фона для идеального контраста, например #0F0F11 для темной темы)",
    "visualMetaphor": "Короткое описание выбранной визуальной концепции"
  },
  "slides": [
    {
      "slideNumber": 1,
      "layout": "COVER_CENTERED", // Типы: COVER_CENTERED, BIG_NUMBER_LEFT, SPLIT_40_60 (Текст 40%, Фото 60%), GRID_INTERACTIVE, QUOTE_MINIMAL
      "title": "Интригующий заголовок (до 5 слов)",
      "subtitle": "Раскрывающий подзаголовок (до 8 слов. Оставь пустым, если не нужен)",
      "content": ["Тезис 1"], // Массив строк. Строго до 3 элементов!
      "imagePrompt": "English prompt for AI image generator. MUST INCLUDE: --ar 16:10, highly detailed, photorealistic/3D render, [Your Metaphor], EXACTLY 'clean negative space on the [left/right/bottom] for text', cinematic lighting, 8k.",
      "speakerNotes": "Текст для спикера: как подать этот слайд, какие эмоции вызвать, что спросить у аудитории (Русский)."
    }
  ]
}

СЦЕНАРИЙ (РОВНО 5 СЛАЙДОВ):
1. **ВСТУПЛЕНИЕ (COVER_CENTERED):** Захват внимания. Название, от которого хочется смотреть дальше. Огромный заголовок по центру, фоном — эпичное изображение с затемнением (negative space everywhere).
2. **ШОК-ФАКТ или БОЛЬ (BIG_NUMBER_LEFT):** Разрыв шаблона. Гигантская цифра или парадоксальный факт слева. Справа — поддерживающий визуал.
3. **СУТЬ ТЕМЫ (SPLIT_40_60):** Объяснение сложного через интересы аудитории. Верстка 16:10: текст занимает левые 40% экрана, правые 60% — идеальная метафоричная картинка. Максимум 3 емких буллита.
4. **ПРАКТИКА/ВЫЗОВ (GRID_INTERACTIVE):** Интерактив или задание для Gen Z. Вопрос к аудитории или провокация.
5. **ЗАКЛЮЧЕНИЕ (QUOTE_MINIMAL):** Мощный вывод, цитата или призыв к действию (Call to Action). Минимализм. Много воздуха.

Язык текста на слайдах: Русский. 
Стиль текста: Дерзкий, живой, емкий (Gen Z friendly, без академической скуки).
`;

    const prediction = await this.runReplicatePrediction('meta/llama-4-maverick-instruct', {
      prompt: prompt,
      max_tokens: 20000,
      system_prompt: 'Output JSON ONLY.',
    });

    let rawJson = '';
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
        throw new Error('Invalid structure: missing slides array');
      }
    } catch (e) {
      this.logger.error('Failed to parse PPTX JSON. Raw: ' + rawJson + '. Error: ' + e.message);
      // Fallback minimal structure if parsing fails significantly
      parsedData = {
        designSystem: { themeColor: '#FF7E58' },
        slides: [
          {
            layout: 'COVER_CENTERED',
            title: topic,
            content: [],
            imagePrompt: `${topic} abstract art`,
          },
          {
            layout: 'BIG_NUMBER_LEFT',
            title: 'Loading...',
            content: ['Error parsing content'],
            imagePrompt: null,
          },
        ],
      };
    }

    const slidesData = parsedData.slides;
    const accentColor =
      parsedData.designSystem && parsedData.designSystem.themeColor
        ? parsedData.designSystem.themeColor.replace('#', '')
        : 'FF7E58';

    // 2. Generate Images
    // 2. Generate Images (Only for the first slide to save time/costs)
    const presImages: (string | null)[] = [];
    for (let i = 0; i < slidesData.length; i++) {
      const slide = slidesData[i];
      // Only generate image for the cover slide (first slide)
      if (i === 0 && slide.imagePrompt) {
        try {
          const styleSuffix =
            'minimalist, trending on artstation, vivid colors, high quality 3d render, 8k, no text';
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
    const PptxGenJS = require('pptxgenjs');
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_16x9';

    pres.defineSlideMaster({
      title: 'MASTER',
      background: { color: 'F4F4F5' },
      objects: [
        { rect: { x: 0, y: 0, w: 0.2, h: '100%', fill: accentColor } },
        { text: { text: 'PrepodavAI', x: 0.4, y: 7.2, fontSize: 10, color: 'AAAAAA', bold: true } },
      ],
    });

    slidesData.forEach((slide: any, index: number) => {
      const s = pres.addSlide({ masterName: 'MASTER' });
      const img = presImages[index];

      switch (slide.layout) {
        case 'COVER_CENTERED':
          if (img) s.addImage({ path: img, x: 0, y: 0, w: '100%', h: '100%', transparency: 85 });
          s.addText(slide.title.toUpperCase(), {
            x: 0.5,
            y: 2.5,
            w: '90%',
            h: 2,
            fontSize: 64,
            color: '2D3748',
            bold: true,
            align: 'center',
            fontFace: 'Arial Black',
          });
          s.addText(slide.subtitle || topic, {
            x: 0.5,
            y: 4.5,
            w: '90%',
            fontSize: 24,
            color: accentColor,
            align: 'center',
          });
          break;

        case 'BIG_NUMBER_LEFT':
          s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: '50%', h: '100%', fill: accentColor });

          const factText = Array.isArray(slide.content) ? slide.content[0] : slide.content;
          s.addText(factText, {
            x: 0.2,
            y: 1.5,
            w: '45%',
            h: 4,
            fontSize: 80,
            color: 'FFFFFF',
            bold: true,
            align: 'center',
          });

          s.addText(slide.title, {
            x: 5.5,
            y: 2.5,
            w: '45%',
            fontSize: 32,
            color: '2D3748',
            bold: true,
          });
          break;

        case 'SPLIT_40_60':
          if (img)
            s.addImage({
              path: img,
              x: 0.5,
              y: 1.5,
              w: 4.5,
              h: 4.5,
              sizing: { type: 'cover', w: 4.5, h: 4.5, r: 20 },
            });

          s.addText(slide.title, {
            x: 5.2,
            y: 0.8,
            w: '50%',
            fontSize: 32,
            color: accentColor,
            bold: true,
          });

          const bulletsData = Array.isArray(slide.content) ? slide.content : [slide.content];
          const bullets = bulletsData.map((b: string) => ({
            text: b,
            options: { breakLine: true },
          }));

          s.addText(bullets, {
            x: 5.2,
            y: 1.8,
            w: '50%',
            h: 4,
            fontSize: 18,
            color: '4A5568',
            bullet: { code: '25CF', color: accentColor },
            lineSpacing: 35,
          });
          break;

        case 'GRID_INTERACTIVE':
          s.background = { color: '1A202C' };
          s.addText('CHALLENGE TIME', {
            x: 0,
            y: 0.5,
            w: '100%',
            align: 'center',
            color: accentColor,
            fontSize: 14,
            bold: true,
          });

          s.addText(slide.title, {
            x: 1,
            y: 1.5,
            w: '80%',
            h: 1.5,
            fontSize: 40,
            color: 'FFFFFF',
            bold: true,
            align: 'center',
          });

          if (img) s.addImage({ path: img, x: 3.5, y: 3.2, w: 6, h: 3 });
          break;

        case 'QUOTE_MINIMAL':
          s.addText('“', {
            x: 0.5,
            y: 1.0,
            fontSize: 100,
            color: accentColor,
            fontFace: 'Georgia',
          });
          s.addText(slide.title, {
            x: 1.5,
            y: 2.0,
            w: '70%',
            fontSize: 36,
            color: '2D3748',
            italic: true,
            align: 'center',
            fontFace: 'Georgia',
          });
          const quoteAuthor = Array.isArray(slide.content) ? slide.content[0] : slide.content;
          s.addText(quoteAuthor, {
            x: 4,
            y: 5,
            w: '50%',
            fontSize: 18,
            color: '718096',
            align: 'right',
          });
          break;

        default:
          s.addText(slide.title, {
            x: 0.5,
            y: 0.5,
            w: '90%',
            fontSize: 24,
            bold: true,
            color: '2D3748',
          });
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
    const savedPptx = await this.filesService.saveBuffer(buffer as Buffer, fileName, userId);

    // 5. Generate and Save HTML View
    const htmlContent = this.generateHtmlPresentation(slidesData, presImages, accentColor);
    const htmlFileName = `presentation_${Date.now()}.html`;
    const savedHtml = await this.filesService.saveBuffer(
      Buffer.from(htmlContent),
      htmlFileName,
      userId,
    );

    this.logger.log(`Presentation package saved: PPTX=${savedPptx.url}, HTML=${savedHtml.url}`);
    return {
      pptxUrl: savedPptx.url,
      htmlUrl: savedHtml.url,
    };
  }

  private generateHtmlPresentation(
    slides: any[],
    images: (string | null)[],
    accentColor: string,
  ): string {
    const logoUrl = LOGO_BASE64;

    const slidesHtml = slides
      .map((slide, index) => {
        const img = images[index];
        let contentHtml = '';

        // Layout logic for HTML
        switch (slide.layout) {
          case 'COVER_CENTERED':
            contentHtml = `
                        <div class="slide-content cover" style="background: ${img ? `url('${img}') center/cover no-repeat` : accentColor}; position: relative;">
                            ${img ? '<div class="overlay"></div>' : ''}
                            <div class="content-wrapper" style="z-index: 2;">
                                <h1 style="font-size: 3.5rem; color: ${img ? '#fff' : '#fff'}; text-transform: uppercase; margin-bottom: 20px;">${slide.title}</h1>
                                <p style="font-size: 1.5rem; color: ${img ? '#e2e8f0' : '#fff'}; opacity: 0.9;">${slide.subtitle || 'PrepodavAI Presentation'}</p>
                            </div>
                        </div>
                    `;
            break;
          case 'BIG_NUMBER_LEFT':
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
          case 'SPLIT_40_60':
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
          case 'GRID_INTERACTIVE':
            contentHtml = `
                        <div class="slide-content challenge" style="background: #1a202c; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px;">
                            <div style="color: #${accentColor}; font-weight: bold; letter-spacing: 2px; margin-bottom: 20px;">CHALLENGE TIME</div>
                            <h2 style="font-size: 3rem; margin-bottom: 40px;">${slide.title}</h2>
                            ${img ? `<img src="${img}" style="max-height: 300px; border-radius: 12px;" />` : ''}
                        </div>
                    `;
            break;
          case 'QUOTE_MINIMAL':
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
      })
      .join('');

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
      'lesson-plan': 'План урока',
      lessonPlan: 'План урока',
      worksheet: 'Рабочий лист',
      presentation: 'Презентация',
      quest: 'Сценарий квеста',
      visuals: 'Тематические изображения',
      quiz: 'Тест',
      vocabulary: 'Словарь',
      'content-adaptation': 'Адаптация контента',
      content: 'Учебный материал',
      message: 'Сообщение родителям/ученикам',
      unpacking: 'Распаковка и Продуктовая линейка',
    };
    return map[type] || type;
  }

  /**
   * Превращает вывод модели в HTML. Робастно работает с тремя сценариями:
   *  1) Чистый markdown — рендерим через marked (GFM).
   *  2) Markdown + inline HTML-вставки — то же.
   *  3) Чистый HTML, который модель иногда оборачивает в ```html-fence``` —
   *     fence снимаем и пропускаем как готовый HTML, БЕЗ marked
   *     (иначе marked экранирует `<` и показывает голый HTML как текст).
   * Дополнительно защищает MathJax-сегменты \(...\), \[...\], $$...$$
   * от того, чтобы marked съел обратные слеши при escape-обработке.
   */
  private renderMarkdownToHtml(md: string): string {
    if (!md) return '';

    // 0. Снимаем обёрточный markdown-fence, если модель завернула весь вывод в ```html ... ```
    // (типичная ошибка: модель «представляет» HTML как код).
    let cleaned = md.trim();
    if (/^```(?:html?|HTML)?\s*\n/.test(cleaned)) {
      cleaned = cleaned.replace(/^```(?:html?|HTML)?\s*\n/, '');
      cleaned = cleaned.replace(/\n?```\s*$/, '');
    }

    // 1. Прячем MathJax-сегменты ДО marked — иначе `\(` будет интерпретирован
    // как escape-последовательность и обратный слеш потеряется.
    const mathTokens: string[] = [];
    const stash = (m: string) => {
      const idx = mathTokens.length;
      mathTokens.push(m);
      return `@@MATH${idx}@@`;
    };
    let working = cleaned
      .replace(/\$\$[\s\S]+?\$\$/g, stash)
      .replace(/\\\[[\s\S]+?\\\]/g, stash)
      .replace(/\\\([\s\S]+?\\\)/g, stash);

    // 2. Принудительная нормализация блочных markdown-маркеров.
    // Симптом из жалобы пользователя: в тесте «Вау-урока» модель склеивает заголовки
    // и вопросы в одну строку («--- ## Итоговый тест ### Блок 1 ... 180° **Вопрос 2.**»).
    // Тогда marked не распознаёт `##`/`###`/`---` как блок (они не на отдельной строке),
    // и пользователь видит markdown-«сырьём». Чиним до парсинга: каждый блочный маркер
    // получает пустую строку до и после, даже если стоял внутри строки.
    working = this.normalizeBlockMarkers(working);

    // 3. Если вывод начинается с HTML-тега уровня блока — модель отдала чистый HTML.
    // Раньше тут стоял ранний return, который тихо хоронил markdown-заголовки, если они
    // приходили вместе с HTML-обёрткой. Теперь обходим marked ТОЛЬКО когда внутри нет
    // markdown-блоков совсем (никаких `## `, `### `, `---`), иначе всё равно прогоняем.
    const startsWithBlockHtml = /^<(?:p|div|h[1-6]|section|article|figure|svg|table|ul|ol|main|aside|nav|header|footer|details|summary|blockquote|pre)\b/i.test(working);
    const hasMarkdownBlocks = /(?:^|\n)\s*(?:#{2,6}\s+\S|-{3,}\s*$|\*\*[^*\n]+\*\*\s*$)/m.test(working);

    let html: string;
    if (startsWithBlockHtml && !hasMarkdownBlocks) {
      html = working;
    } else {
      try {
        html = marked.parse(working) as string;
      } catch {
        html = working; // fallback: лучше показать «как есть», чем 500
      }
    }

    // 4. Возвращаем формулы обратно.
    html = html.replace(/@@MATH(\d+)@@/g, (_, n) => mathTokens[parseInt(n, 10)] ?? '');
    return html;
  }

  /**
   * Гарантирует, что блочные markdown-маркеры (`##`, `###`, ..., `---`, начало
   * вопроса `**Вопрос N.**`) живут на отдельных строках с пустой строкой выше и
   * ниже. Это необходимо, потому что Gemini-3-flash при больших max_tokens
   * иногда склеивает блоки в одну строку, и marked перестаёт их парсить.
   */
  private normalizeBlockMarkers(text: string): string {
    return text
      // `---` внутри строки → отдельная строка с пустыми строками вокруг
      .replace(/[ \t]+(-{3,})[ \t]+/g, '\n\n$1\n\n')
      // ATX-заголовки `## ` / `### ` / ... в середине строки
      .replace(/([^\n])\s+(#{2,6}\s+)/g, '$1\n\n$2')
      // Заголовок не отделён пустой строкой ОТ следующего блока
      .replace(/(^#{2,6}\s+[^\n]+)\n(?!\n)/gm, '$1\n\n')
      // Начало вопроса «**Вопрос 12.**» / «**Question 5.**» / «**Задание 3.**»,
      // склеенное с предыдущим вариантом ответа или текстом
      .replace(
        /([^\n])\s+(\*\*(?:Вопрос|Question|Задача|Задание|Task)\s+\d+\.\*\*)/gi,
        '$1\n\n$2',
      )
      // `---` после заголовка без пустой строки — выглядит как setext-underline,
      // marked интерпретирует это как «прошлая строка — h2/h1». Разрываем.
      .replace(/^(#{1,6}[^\n]*)\n(-{3,})\s*$/gm, '$1\n\n$2\n');
  }

  private formatToHtml(markdownContent: string, title: string): string {
    const formattedBody = this.renderMarkdownToHtml(markdownContent);
    const logoUrl = 'LOGO_PLACEHOLDER';

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
                /* Markdown-таблицы: модель выдаёт GFM-таблицы, marked их рендерит как <table> */
                .content table, body > table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 16px 0;
                    font-size: 14px;
                }
                .content th, body > table th, table th {
                    background: #f9fafb;
                    font-weight: 600;
                    text-align: left;
                    padding: 10px 12px;
                    border: 1px solid #d1d5db;
                }
                .content td, body > table td, table td {
                    padding: 10px 12px;
                    border: 1px solid #e5e7eb;
                    vertical-align: top;
                }
                /* Заголовки разных уровней (включая h4-h6, которые модель ставит как ####) */
                h1 { font-size: 26px; font-weight: 700; margin: 28px 0 16px; color: #111827; }
                h2 { font-size: 22px; font-weight: 700; margin: 26px 0 14px; color: #111827; }
                h3 { font-size: 18px; font-weight: 600; margin: 22px 0 12px; color: #1f2937; }
                h4 { font-size: 16px; font-weight: 600; margin: 18px 0 10px; color: #374151; }
                h5 { font-size: 14px; font-weight: 600; margin: 16px 0 8px; color: #374151; }
                h6 { font-size: 13px; font-weight: 600; margin: 14px 0 8px; color: #4b5563; }
                /* Горизонтальный разделитель из --- */
                hr { border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0; }
                /* Списки */
                ul, ol { padding-left: 24px; margin: 12px 0; }
                li { margin: 6px 0; }
                /* Цитаты */
                blockquote { border-left: 4px solid #d1d5db; padding: 6px 14px; color: #4b5563; margin: 14px 0; background: #f9fafb; }
                /* Inline-код */
                code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
                pre code { display: block; padding: 14px; overflow-x: auto; line-height: 1.5; }
                /* Изображения, сгенерированные через [IMAGE-...] */
                .generated-image-container, figure.generated-image-container {
                    margin: 24px auto;
                    text-align: center;
                    page-break-inside: avoid;
                    max-width: 90%;
                }
                .generated-image-container img, figure.generated-image-container img {
                    max-width: 100%;
                    max-height: 100mm;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                }
                figure.generated-image-container figcaption {
                    margin-top: 8px;
                    font-size: 13px;
                    color: #6b7280;
                    font-style: italic;
                }
            </style>
            ${SHARED_MATHJAX_SCRIPT}
        </head>
        <body>
            <div class="header">
                <img src="${logoUrl}" alt="PrepodavAI Logo" class="header-logo" />
                <h1>${title}</h1>
            </div>

            <div class="content">
            ${formattedBody}
            </div>

            <div class="footer-logo">
                <img src="${logoUrl}" alt="PrepodavAI Logo" />
                <div style="font-size: 10px; color: #9CA3AF; margin-top: 5px;">Сгенерировано с помощью PrepodavAI</div>
            </div>
        </body>
        </html>
        `;
  }

  private getSpecializedPrompt(
    type: string,
    subject: string,
    topic: string,
    level: string,
    extraData: any = {},
  ): { systemPrompt: string; userPrompt: string } | null {
    const logoUrlStr = 'LOGO_PLACEHOLDER';

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
          `13) 3 аспекта преподавания, которые вызывают у вас больше всего вдохновения: ${extraData.q13 || '-'}`,
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

СТРУКТУРА ОТЧЕТА:
1.  **ШАПКА**
    - Заголовок: "Стратегия Личного Бренда и Продуктовая Линейка"
    - Подзаголовок: "Распаковка Экспертности"

2.  **БЛОК 1: КТО Я (САМОПРЕЗЕНТАЦИЯ)**
    - *Задача*: Написать захватывающую историю пути эксперта на основе ответов 1, 5, 6, 8, 11, 12, 13.
    - Сформулируй "Миссию" и "Ценности".
    - Выдели "Суперсилу" (ответы 2, 4, 7).
    - Это текст для страницы "Обо мне" или приветственного поста.

3.  **БЛОК 2: МОЙ ИДЕАЛЬНЫЙ УЧЕНИК (АВАТАР)**
    - На основе ответов 8, 9, 10.
    - Опиши профиль клиента, с которым эксперт работает эффективнее всего.

4.  **БЛОК 3: ПРОДУКТОВАЯ ЛИНЕЙКА**
    - Предложи 3 уровня продуктов, логично вытекающих из экспертности:
        - **Вводный продукт**: Недорогой, лёгкий вход, быстрый результат.
        - **Флагманский продукт**: Основной курс или услуга.
        - **Премиальный продукт**: Личное сопровождение или эксклюзив.
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
          userPrompt: `Проведи распаковку для эксперта на основе следующих ответов:\n\n${answers}\n\nСоздай полную стратегию личного бренда и продуктовой линейки.`,
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
    extraData: any = {},
  ): Promise<string> {
    // Check for specialized prompt
    const specialized = this.getSpecializedPrompt(targetType, subject, topic, level, extraData);

    if (specialized) {
      this.logger.log(`Using specialized prompt for ${targetType}`);
      const prediction = await this.runReplicatePrediction('meta/llama-4-maverick-instruct', {
        prompt: specialized.userPrompt,
        max_tokens: 10000,
        system_prompt: specialized.systemPrompt,
      });

      if (prediction.metrics) {
        const inputTokens = prediction.metrics.input_token_count || 0;
        const outputTokens = prediction.metrics.output_token_count || 0;
        const cost = (inputTokens / 1000000) * 3 + (outputTokens / 1000000) * 15;
        this.logger.log(
          `Стоимость генерации (${targetType}): $${cost.toFixed(6)} (Input: ${inputTokens}, Output: ${outputTokens})`,
        );
      } else {
        this.logger.log(
          `Стоимость генерации (${targetType}): Метрики недоступны. ${JSON.stringify(prediction.metrics)}`,
        );
      }

      let rawOutput = '';
      if (Array.isArray(prediction.output)) {
        rawOutput = prediction.output.join('');
      } else if (typeof prediction.output === 'string') {
        rawOutput = prediction.output;
      }
      return rawOutput;
    }

    const interestsStr = interests && interests.trim() ? interests : '—';
    const typeLabel = this.getTypeLabel(targetType);
    const isInteractiveType = ['worksheet', 'quiz', 'game_generation'].includes(targetType);
    const depthRaw = (extraData?.depth || 'standard') as string;
    const depth: 'short' | 'standard' | 'deep' =
      depthRaw === 'short' || depthRaw === 'deep' ? depthRaw : 'standard';
    const depthLabel = { short: 'Краткий', standard: 'Стандартный', deep: 'Развёрнутый' }[depth];
    const maxImages = this.getMaxImagesForSubject(subject);
    const structureSkeleton = this.getStructureSkeleton(targetType, depth, extraData);

    const prompt = `
<MAIN_TOPIC>${topic || '—'}</MAIN_TOPIC>
<SUBJECT>${subject || '—'}</SUBJECT>
<LEVEL>${level || '—'}</LEVEL>
<INTERESTS>${interestsStr}</INTERESTS>
<SECTION_TYPE>${typeLabel}</SECTION_TYPE>
<DEPTH>${depthLabel}</DEPTH>

🎯 ГЛАВНОЕ ПРАВИЛО: ВЕСЬ контент строго и исключительно по теме <MAIN_TOPIC>${topic || '—'}</MAIN_TOPIC>.
Не уходи в смежные темы. Не подменяй на родственную. Не давай «общий обзор предмета».
Если параметры противоречат теме — приоритет за темой.

ПРОТОКОЛ ПЕРЕД ГЕНЕРАЦИЕЙ (выполни мысленно):
1. Сформулируй 3–5 ключевых подпонятий темы «${topic || '—'}».
2. Каждый блок / задание / пример должен проходить тест: «Это про <MAIN_TOPIC>?». Если нет — переделай.

═══ РОЛЬ И ЯЗЫК ═══
Ты — методист, который создаёт раздел «${typeLabel}» учебного материала.
ЯЗЫК ВЫВОДА: строго русский.
Формулы: LaTeX в \\(...\\) для inline, \\[...\\] для блочных. ЗАПРЕЩЕНО $...$.

═══ РЕЖИМ ПОДАЧИ ПО ПРЕДМЕТУ ═══
Определи режим по <SUBJECT>${subject || '—'}</SUBJECT> и строго следуй ему:

[STEM] — математика, физика, информатика, химия, алгебра, геометрия:
  - Структура: определение → разобранный пример → контрпример → практика.
  - Ясность важнее драмы. Никаких «эпичных» сцен.
  - Формулы — через MathJax (см. выше), НЕ картинками.
  - Изображения вызывай ТОЛЬКО для метафор «концепт через предмет реального мира»
    (пицца для дробей, поезд для задач на движение, исторические сцены).
  - Если нужны формулы, графики, геометрические фигуры, таблицы, координатные плоскости —
    используй HTML/SVG/MathJax напрямую, НЕ [IMAGE-...].

[NARRATIVE] — история, обществознание, география, биология:
  - Структура: сторителлинг + сцена + причинно-следственные связи.
  - Изображения: реалистичные сцены, реконструкции, иллюстрации.
  - Карты и схемы — через [IMAGE-DIAGRAM].

[TEXTUAL] — языки, литература:
  - Структура: контекстные примеры, аутентичные тексты, диалоги.
  - Изображения: атмосферные сцены, портреты через [IMAGE-SCENE].

═══ ОБЯЗАТЕЛЬНАЯ СТРУКТУРА РАЗДЕЛА (заполни каждый блок!) ═══
${structureSkeleton}

═══ ПОДАЧА (когнитивная нагрузка) ═══
- Чанк = 2–4 предложения, не больше. Один концепт = один чанк.
- Каждый новый концепт сопровождай ОДНИМ конкретным примером ПЕРЕД абстрактным определением (worked-example).
- Сигнальная структура: подзаголовки, маркированные списки, выделение ключевого слова через <strong>.
- После 2–3 концептов давай мини-проверку: 1 вопрос «остановись и подумай».
- ЗАПРЕЩЕНО: сплошные абзацы >5 предложений, обороты в духе «следует отметить, что».

КОГНИТИВНЫЙ БАЛАНС (таксономия Блума):
- ~30% — «вспомнить / понять» (определения, факты).
- ~50% — «применить» (использовать правило в типовой ситуации).
- ~20% — «проанализировать / оценить» (нестандартная задача, объяснить почему).

═══ ПЕРСОНАЛИЗАЦИЯ через <INTERESTS> ═══
- Используй интерес ТОЛЬКО как СТРУКТУРНУЮ АНАЛОГИЮ для незнакомого понятия,
  и только когда аналог структурно изоморфен понятию.
  Пример валидной: «дробь как блок Minecraft, разрезанный на части» — структура совпадает.
  Пример невалидной: «дроби, как в Minecraft» (без объяснения связи) — это декорация, удали.
- Максимум 1 аналогия на смысловой блок. Не превращай объяснение в фан-фик.
- Если для понятия нет работающей аналогии в <INTERESTS> — НЕ выдумывай натянутую.

═══ ИЗОБРАЖЕНИЯ — СТРОГИЕ ПРАВИЛА ═══
1. ${maxImages === 1 ? 'РОВНО 1 изображение на раздел' : `До ${maxImages} изображений на раздел (1–${maxImages})`}. Если контент не требует — НЕ вставляй вообще.
2. Формат тега:
   [IMAGE-<TYPE>: краткая подпись на русском (1 строка)
   | English prompt: subject, style по режиму, composition, "no text, no labels, no numbers, no watermarks"]
3. Типы:
   - [IMAGE-DIAGRAM: ...] — схема / процесс (для NARRATIVE; для STEM — НЕ используй, делай HTML/SVG)
   - [IMAGE-EXAMPLE: ...] — концепт через предмет реального мира
   - [IMAGE-SCENE: ...] — нарративная сцена (для NARRATIVE / TEXTUAL)
   - [IMAGE-COMPARISON: ...] — две сущности рядом для сравнения
4. ЗАПРЕЩЕНО внутри изображения: любой текст, цифры, формулы, водяные знаки.
   Все подписи — в HTML через <figcaption>, не в кадре.
   В English prompt ВСЕГДА добавляй: "no text, no labels, no numbers, no watermarks".
5. Composition: главный объект в правой или левой трети, минимум 30% — негативное пространство.
6. [IMAGE-...] должен стоять В ТОМ ЖЕ смысловом блоке, что и поясняющий текст
   (contiguity principle). Не «перед разделом» и не «в конце».
7. Если не можешь объяснить, ЗАЧЕМ нужна именно эта картинка — не вставляй её
   (coherence: декоративные картинки запрещены).
8. ВИЗУАЛЬНЫЙ СТИЛЬ ПО <INTERESTS> (КРИТИЧЕСКИ ВАЖНО):
   Если <INTERESTS>${interestsStr}</INTERESTS> содержит распознаваемый визуальный мир —
   English-промпт ДОЛЖЕН отразить этот стиль, не только концепт темы.
   Примеры маппинга:
   - "Minecraft" / "Майнкрафт" → добавь в prompt: "pixelated voxel art style, isometric view,
     blocky terrain, Minecraft-inspired aesthetic, cubic shapes"
   - "Roblox" → "Roblox-style 3D characters and environment, low-poly, vibrant colors"
   - "аниме" / "anime" / "манга" → "anime illustration style, cell-shaded, Studio Ghibli inspired"
   - "футбол" / "soccer" → "soccer stadium scene, football-themed environment, athletic atmosphere"
   - "Marvel" / "DC" / "комиксы" → "comic book art style, dynamic composition, bold outlines"
   - "космос" / "sci-fi" → "sci-fi cinematic style, futuristic, neon accents"
   - "Гарри Поттер" / "фэнтези" → "fantasy magical atmosphere, painterly, warm magical lighting"
   Если в <INTERESTS> нет распознаваемого визуального мира — используй нейтральный стиль
   под режим SUBJECT (фотореализм для STEM-метафор, иллюстрация для NARRATIVE и т.д.).
   ЦЕЛЬ: ученик ${level || '—'} класса должен сразу узнать «свой мир» на картинке.

${isInteractiveType ? `═══ ИНТЕРАКТИВНЫЕ ПОЛЯ (для quiz/worksheet — ОБЯЗАТЕЛЬНО) ═══
- Короткий ответ: <input type="text" name="q{N}" style="border:none;border-bottom:2px solid #333;width:180px;background:transparent;font-size:inherit;" />
- Выбор ответа: <label><input type="radio" name="q{N}" value="{x}"> вариант</label>
- Развёрнутый ответ: <textarea name="q{N}_text" rows="3" style="width:100%;border:1px solid #ccc;padding:6px;font-family:inherit;"></textarea>
- Подчёркивания (____) и точки (....) ЗАПРЕЩЕНЫ.
- Ключ ответов оборачивай в: <div class="teacher-answers-only" style="margin-top:40px;padding-top:20px;border-top:2px dashed #999;page-break-before:always;"><h2 style="color:#cc0000;">Ответы (для учителя)</h2>...</div>` : `═══ БЕЗ ИНТЕРАКТИВНЫХ ПОЛЕЙ ═══
Это материал для чтения, не рабочий лист.
Не вставляй <input>, <textarea>, чек-боксы — ученик не будет вводить ответы в этот раздел.`}

═══ КОНТЕКСТ из предыдущих разделов ═══
${context || '(первый раздел — без контекста)'}

═══ ФОРМАТ ВЫВОДА ═══
- Markdown с HTML-вставками (для интерактива, изображений).
- Заголовки: ## Раздел, ### Подраздел.
- Выделение ключевого слова: <strong>.
- КРИТИЧЕСКИ ВАЖНО: ЗАПРЕЩЕНО оборачивать вывод (или его части) в markdown-код-блоки \`\`\`html ... \`\`\` или \`\`\` ... \`\`\`.
  HTML пиши прямо в тексте, БЕЗ \`\`\`-обёрток. Не «показывай» HTML как код — выводи его как готовый рабочий HTML.
- ЗАПРЕЩЕНО начинать строки с 4+ пробелов подряд (будет интерпретировано как код-блок).
- Если выводишь чистый HTML (без markdown) — это ОК, просто не оборачивай в \`\`\`.

═══ ⚠️ САМОПРОВЕРКА (перед выводом) ═══
□ Для каждого блока: «Это именно про <MAIN_TOPIC>${topic || '—'}</MAIN_TOPIC>, а не про смежную тему?». Если нет — перепиши.
□ ≥ 80% контента прямо опирается на ключевые понятия темы.
□ Каждый чанк ≤ 4 предложений, нет длинных академических абзацев.
□ Worked-example в каждом концепте (пример ПЕРЕД определением).
□ Когнитивный баланс ≈ 30/50/20 по Блуму.
□ Изображений: ${maxImages === 1 ? '0 или 1' : `от 0 до ${maxImages}`}. Без текста в кадре. С figcaption-подписью у каждого.
□ ${isInteractiveType ? 'Все поля для ответов — <input>/<textarea>, не подчёркивания.' : 'Никаких <input>/<textarea>.'}
□ Все формулы — в MathJax \\(...\\) или \\[...\\], не в $...$.

ЦЕЛЬ: ученик ${level || '—'} класса должен понять то, что вчера не понимал. Engagement — средство, не цель.
`;

    // Бюджет токенов масштабируется под depth: «развёрнутый» режим может уйти
    // в 5–7 тыс. русских слов, чтобы избежать обрыва на полуслове закладываем запас.
    const maxTokens = depth === 'short' ? 8000 : depth === 'deep' ? 24000 : 16000;

    const prediction = await this.runReplicatePrediction('meta/llama-4-maverick-instruct', {
      prompt: prompt,
      max_tokens: maxTokens,
      system_prompt:
        'You are a creative educational genius. You create content STRICTLY IN RUSSIAN.',
    });

    let rawOutput = '';
    if (Array.isArray(prediction.output)) {
      rawOutput = prediction.output.join('');
    } else if (typeof prediction.output === 'string') {
      rawOutput = prediction.output;
    }
    return rawOutput;
  }

  private async processImageTags(content: string, subject?: string): Promise<string> {
    // Supports both legacy [IMAGE: ...] and new tagged [IMAGE-TYPE: ...] formats.
    // [\s\S] allows multi-line content inside brackets.
    const imageRegex = /\[IMAGE(?:-([A-Z]+))?:\s*([\s\S]*?)\]/g;
    let match: RegExpExecArray | null;
    let newContent = content;

    const matches: { full: string; type: string | null; raw: string }[] = [];
    while ((match = imageRegex.exec(content)) !== null) {
      matches.push({ full: match[0], type: match[1] || null, raw: match[2] });
    }

    // Лимит зависит от предмета: STEM = 1 (схемы и формулы — через MathJax/SVG),
    // нарративные предметы = 2 (визуальный ряд усиливает понимание).
    const maxImages = this.getMaxImagesForSubject(subject);
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];

      if (i >= maxImages) {
        newContent = newContent.replace(m.full, '');
        continue;
      }

      try {
        // Format: "Russian caption | English prompt" — split on FIRST pipe only.
        const pipeIdx = m.raw.indexOf('|');
        let caption = '';
        let promptText = m.raw.trim();
        if (pipeIdx !== -1) {
          caption = m.raw.slice(0, pipeIdx).trim();
          promptText = m.raw.slice(pipeIdx + 1).trim();
        }

        // Belt-and-suspenders: enforce "no text in image" even if the model forgets.
        if (!/no text/i.test(promptText)) {
          promptText = `${promptText}, no text, no labels, no numbers, no watermarks`;
        }

        const aspectRatio = this.getAspectRatioForType(m.type);
        const imageUrl = await this.generateImage(promptText, { aspectRatio, subject });

        const altText = this.escapeHtml(caption || promptText.slice(0, 120));
        const imageHtml = caption
          ? `<figure class="generated-image-container"><img src="${imageUrl}" alt="${altText}" /><figcaption>${this.escapeHtml(caption)}</figcaption></figure>`
          : `<div class="generated-image-container"><img src="${imageUrl}" alt="${altText}" /></div>`;

        newContent = newContent.replace(m.full, imageHtml);
      } catch (e) {
        this.logger.error(`Failed to generate image for prompt "${m.raw.slice(0, 100)}": ${e}`);
        newContent = newContent.replace(m.full, '');
      }
    }

    return newContent;
  }

  private getAspectRatioForType(type: string | null): string {
    switch (type) {
      case 'DIAGRAM':
        return '1:1';
      case 'SCENE':
      case 'COMPARISON':
        return '16:9';
      case 'EXAMPLE':
      default:
        return '4:3';
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private isSTEMSubject(subject?: string): boolean {
    if (!subject) return false;
    const s = subject.toLowerCase();
    return ['матема', 'физи', 'информ', 'хими', 'алгебра', 'геомет', 'math', 'physic', 'chem']
      .some((k) => s.includes(k));
  }

  private getMaxImagesForSubject(subject?: string): number {
    // STEM — 1 картинка (чаще нужны схемы/формулы через MathJax/SVG).
    // Остальные — 2 (нарратив выигрывает от визуального ряда).
    return this.isSTEMSubject(subject) ? 1 : 2;
  }

  private getNegativePrompt(subject?: string): string {
    const base =
      'text, letters, numbers, watermark, signature, labels, captions, low quality, distorted, deformed, blurry, ugly';
    return this.isSTEMSubject(subject)
      ? `${base}, mathematical symbols, equations written, formulas, cluttered composition`
      : base;
  }

  /**
   * Обязательная структура раздела с минимальным объёмом — главный рычаг
   * против «жидких» генераций. Скелет задаёт, что именно должно быть заполнено,
   * depth масштабирует требования по объёму и количеству подпунктов.
   */
  private getStructureSkeleton(
    targetType: string,
    depth: 'short' | 'standard' | 'deep',
    extraData: any = {},
  ): string {
    const wordMul = depth === 'short' ? 0.6 : depth === 'deep' ? 1.5 : 1;

    switch (targetType) {
      case 'lesson-plan':
      case 'lessonPlan':
      case 'lessonPreparation':
      case 'lesson_preparation':
        return `ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ПЛАНА (заполни КАЖДЫЙ блок):
1. Тип урока (открытие нового знания / рефлексии / систематизации / контроля).
2. Цели — РАЗДЕЛИ на три блока: предметные / метапредметные / личностные. По SMART.
3. Планируемые УУД: познавательные / регулятивные / коммуникативные (конкретно, не «развивать мышление»).
4. Ход урока (таблица «Этап / Время / Деятельность учителя / Деятельность учеников / Метод-приём») — МИНИМУМ 6 этапов из каркаса ФГОС:
   мотивация → актуализация → постановка проблемы → открытие нового → первичное закрепление → самостоятельная работа → рефлексия.
5. Для КАЖДОГО этапа укажи: время в минутах, что делает учитель, что делают ученики, какой метод/приём.
6. Дифференциация: что предложить сильным, что — испытывающим затруднения.
7. Критерии успеха урока (по чему понять, что урок удался).
8. Возможные затруднения учеников и как их предупредить.
9. Домашнее задание: базовый уровень + 1 задание повышенной сложности на выбор.

МИНИМАЛЬНЫЙ ОБЪЁМ: ${Math.round(1500 * wordMul)} слов. Меньше — не сдавай, дополни недостающие блоки.`;

      case 'worksheet':
      case 'game_generation': {
        const baseN = Number(extraData?.worksheetQuestions) || 7;
        const N = Math.max(3, Math.round(baseN * (depth === 'short' ? 0.7 : depth === 'deep' ? 1.4 : 1)));
        return `ОБЯЗАТЕЛЬНАЯ СТРУКТУРА РАБОЧЕГО ЛИСТА:
1. Шапка + поля для ученика (Имя / Класс / Дата).
2. Краткая теоретическая справка по теме — 80–150 слов.
3. Задания: РОВНО ${N} штук, с ГРАДАЦИЕЙ сложности:
   - Первые ~30% — [Базовый] (узнавание, воспроизведение)
   - Средние ~40% — [Повышенный] (применение в типовой ситуации)
   - Последние ~30% — [Высокий] (анализ, перенос, нестандартная задача)
   Перед каждым заданием помечай уровень в квадратных скобках.
4. МИНИМУМ 4 разных формата заданий из списка:
   заполнение пропусков / соответствие / классификация / верно-неверно с обоснованием /
   краткий ответ / развёрнутый ответ / исправление намеренной ошибки / работа со схемой.
5. Перед каждым заданием — короткая курсивная пометка «Проверяем: …» (что именно проверяет задание).
6. Баллы: рядом с каждым заданием — стоимость в баллах, в конце — шкала перевода в оценку.
7. КЛЮЧ ОТВЕТОВ (для учителя), где для каждого задания:
   - правильный ответ,
   - краткое решение / обоснование (1–2 строки),
   - типичная ошибка ученика по этой задаче.

МИНИМАЛЬНЫЙ ОБЪЁМ: ${Math.round(1200 * wordMul)} слов (теория + задания + ключ).`;
      }

      case 'quiz': {
        const baseN = Number(extraData?.questionsCount) || 10;
        const N = Math.max(3, Math.round(baseN * (depth === 'short' ? 0.6 : depth === 'deep' ? 1.5 : 1)));
        return `ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ТЕСТА:
1. РОВНО ${N} вопросов с одним правильным ответом из 4.
2. КОГНИТИВНЫЙ БАЛАНС (обязателен, не делай тест из одних «вспомнить»):
   - ~30% — «вспомнить / понять»
   - ~50% — «применить» (использовать правило в типовой ситуации)
   - ~20% — «проанализировать / оценить» (нестандартная задача, объяснить почему)
3. РАЗНООБРАЗИЕ форматов вопросов (используй смесь):
   - прямой вопрос
   - «выбери НЕверное утверждение» (не более 20% вопросов)
   - «выбери лучшее объяснение»
   - на причинно-следственную связь
   - на применение правила к новому случаю
4. ДИСТРАКТОРЫ по принципу типичных ошибок учащихся:
   - один — частая ошибка по неверному правилу
   - один — поверхностно похожий на правильный (то же ключевое слово, иной смысл)
   - один — правдоподобный, но фактически неверный
5. ОДНОРОДНОСТЬ: варианты одной грамматической формы, одной длины (±30%), одной категории.
6. ЗАПРЕЩЕНО: «все вышеперечисленное», «ни один из вышеперечисленных», варианты-«пустышки».
7. РАВНОМЕРНОЕ распределение правильных ответов по буквам (не >40% на одну букву).
8. КЛЮЧ ДЛЯ УЧИТЕЛЯ — таблица: №, Правильный ответ, Краткое обоснование, Разбор каждого дистрактора.

⚠️ ФОРМАТИРОВАНИЕ (КРИТИЧНО — иначе вёрстка рассыпется):
- Каждый markdown-заголовок (## / ###) — НА ОТДЕЛЬНОЙ СТРОКЕ + ПУСТАЯ СТРОКА до и после.
- Горизонтальная черта \`---\` — ТОЛЬКО на отдельной строке, с пустыми строками вокруг.
- Между концом вариантов одного вопроса и началом следующего «**Вопрос N.**» — ОБЯЗАТЕЛЬНО ПУСТАЯ СТРОКА.
- Запрещено клеить в одну строку «180° **Вопрос 2.**» или «## Итоговый тест ### Блок 1».
- Каждый <label><input type="radio">…</label> — на отдельной строке.

ПРАВИЛЬНЫЙ ПРИМЕР (соблюдай разметку буквально):
\`\`\`
---

## 📝 Итоговый тест

### Блок 1: Начальные понятия

**Вопрос 1.** Один из вертикальных углов равен 54°. Чему равен второй?

<label><input type="radio" name="q1" value="a"> 36°</label>
<label><input type="radio" name="q1" value="b"> 54°</label>
<label><input type="radio" name="q1" value="c"> 126°</label>
<label><input type="radio" name="q1" value="d"> 180°</label>

**Вопрос 2.** …
\`\`\`

МИНИМАЛЬНЫЙ ОБЪЁМ: ${Math.round(900 * wordMul)} слов (вопросы + ключ с разбором).`;
      }

      case 'content-adaptation':
      case 'content':
      default: {
        const subCount = depth === 'short' ? 3 : depth === 'deep' ? 6 : 5;
        return `ОБЯЗАТЕЛЬНАЯ СТРУКТУРА УЧЕБНОГО МАТЕРИАЛА (заполни КАЖДЫЙ блок):
1. Введение и мотивация — зачем эта тема нужна сейчас (80–150 слов).
2. Базовое определение + 1 пример из реальности (100–150 слов).
3. РАЗВЁРНУТОЕ объяснение через ${subCount} ключевых подпонятий. Для КАЖДОГО подпонятия:
   - короткое определение (1–2 предложения),
   - конкретный пример ПЕРЕД абстракцией (worked-example),
   - типичная ошибка / misconception (1 предложение),
   - мини-проверка «остановись и подумай» — 1 вопрос для самопроверки.
   = ~200–300 слов на каждое подпонятие.
4. Полностью разобранный пример «от и до» — worked example (200–300 слов).
5. Связь с другими темами и применение в реальной жизни (80–150 слов).
6. Краткое резюме (3–5 буллитов).

МИНИМАЛЬНЫЙ ОБЪЁМ: ${Math.round(1500 * wordMul)} слов.`;
      }
    }
  }

  private async generateImage(
    imagePrompt: string,
    options?: { aspectRatio?: string; subject?: string },
  ): Promise<string> {
    const prediction = await this.runReplicatePrediction('bytedance/seedream-4', {
      prompt: imagePrompt,
      negative_prompt: this.getNegativePrompt(options?.subject),
      aspect_ratio: options?.aspectRatio || '4:3',
    });

    if (Array.isArray(prediction.output) && prediction.output.length > 0) {
      return prediction.output[0];
    }
    if (typeof prediction.output === 'string') {
      return prediction.output;
    }
    throw new Error('No image URL in output');
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
              Prefer: 'wait',
            },
          },
        );

        let prediction = response.data;

        if (
          prediction.status !== 'succeeded' &&
          prediction.status !== 'failed' &&
          prediction.status !== 'canceled'
        ) {
          prediction = await this.pollPrediction(prediction.id);
        }

        if (prediction.status === 'failed' || prediction.status === 'canceled') {
          throw new Error(`Replicate prediction failed: ${prediction.error}`);
        }

        return prediction;
      } catch (error: any) {
        if (
          axios.isAxiosError(error) &&
          (error.response?.status === 429 || error.response?.status >= 500)
        ) {
          attempts++;
          this.logger.warn(
            `Replicate API error ${error.response?.status}. Retrying in ${delayMs}ms... (Attempt ${attempts}/${maxAttempts})`,
          );
          if (attempts >= maxAttempts) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, delayMs));
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
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      const response = await axios.get(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: {
          Authorization: `Bearer ${this.replicateToken}`,
          'Content-Type': 'application/json',
        },
      });

      const prediction = response.data;
      if (
        prediction.status === 'succeeded' ||
        prediction.status === 'failed' ||
        prediction.status === 'canceled'
      ) {
        return prediction;
      }
    }
    throw new Error('Prediction timed out');
  }

  // Объединяет несколько полных HTML-документов в один, чтобы MathJax обработал
  // формулы из всех секций, а Playwright рендерил всю страницу целиком.
  private combineHtmlSections(sections: { title: string; content: string }[]): string {
    if (sections.length === 0) return '';
    if (sections.length === 1) return sections[0].content;

    const seenStyleContents = new Set<string>();
    const collectedStyles: string[] = [];
    const bodyParts: string[] = [];

    sections.forEach((section, i) => {
      const styleMatches = section.content.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
      for (const styleBlock of styleMatches) {
        const key = styleBlock.replace(/\s+/g, ' ').trim();
        if (!seenStyleContents.has(key)) {
          seenStyleContents.add(key);
          collectedStyles.push(styleBlock);
        }
      }

      const bodyMatch = section.content.match(/<body[^>]*>([\s\S]*?)<\/body\s*>/i);
      const bodyContent = bodyMatch ? bodyMatch[1].trim() : section.content;
      const pageBreak = i > 0 ? ' style="page-break-before: always;"' : '';
      bodyParts.push(`<div class="lesson-section"${pageBreak}>\n${bodyContent}\n</div>`);
    });

    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
${collectedStyles.join('\n')}
${SHARED_MATHJAX_SCRIPT}
</head>
<body>
${bodyParts.join('\n')}
</body>
</html>`;
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
