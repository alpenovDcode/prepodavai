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
      this.logger.warn(
        'REPLICATE_API_TOKEN is not configured. Replicate presentation generation will not work.',
      );
    }
  }

  async process(job: Job<ReplicatePresentationJobData>): Promise<void> {
    const { generationRequestId, topic, duration, style, targetAudience, numCards = 7 } = job.data;
    this.logger.log(
      `Processing Replicate presentation generation for request ${generationRequestId}: topic="${topic}"`,
    );

    // Fetch userId to comply with FilesService security requirements
    const generation = await this.prisma.userGeneration.findUnique({
      where: { generationRequestId },
      select: { userId: true },
    });
    const userId = generation?.userId;

    try {
      // 1. Generate text content (slides JSON)
      const slides = await this.generatePresentationSlides(topic, {
        duration,
        style,
        targetAudience,
        numCards,
      });
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
            slide.html = slide.html.replace(
              'IMAGE_PLACEHOLDER',
              `https://picsum.photos/800/450?sig=${Math.random()}`,
            );
          }
        } else {
          slide.html = slide.html.replace(
            'IMAGE_PLACEHOLDER',
            `https://picsum.photos/800/450?sig=${Math.random()}`,
          );
        }
      }

      const finalResult = {
        provider: 'Replicate',
        mode: 'presentation',
        slides: slides,
        completedAt: new Date().toISOString(),
      };

      // 3. Generate PDF
      let pdfUrl: string | undefined;
      let exportUrl: string | undefined;

      try {
        this.logger.log(`Generating PDF for request ${generationRequestId}`);
        const pdfHtml = `<html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;">${slides.map((s) => `<div style="width:100vw;height:100vh;page-break-after:always;">${s.html}</div>`).join('')}</body></html>`;
        const pdfBuffer = await this.htmlExportService.htmlToPdf(pdfHtml);

        const fileData = await this.filesService.saveBuffer(pdfBuffer, 'presentation.pdf', userId);
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
    const grade = params.targetAudience || 'Общая аудитория';
    const duration = params.duration || '15';
    const style = params.style || 'modern';

    const prompt = `
Ты — опытный методист и дизайнер образовательных презентаций. Твоя задача — создать чистую, читаемую и методически выверенную презентацию для использования на уроке.

КОНТЕКСТ:
- Язык: Русский
- Тема урока: "${topic}"
- Аудитория: ${grade}
- Длительность урока: ${duration} мин
- Количество слайдов: ровно ${numCards}

═══════════════════════════════════
ФОРМАТ ОТВЕТА (КРИТИЧНО)
═══════════════════════════════════
Верни СТРОГО валидный JSON-массив. Без markdown, без \`\`\`json, без текста до/после.
Каждый объект:
{
  "html": "строка с HTML слайда",
  "imagePrompt": "детальный английский промпт для изображения"
}

═══════════════════════════════════
ТЕХНИЧЕСКИЕ ОГРАНИЧЕНИЯ
═══════════════════════════════════
1. ТОЛЬКО инлайн-стили через атрибут style="...". Запрещены: class, <style>, <script>, внешние шрифты через @import.
2. Контейнер слайда обязательно: width: 100vw; height: 100vh; overflow: hidden; box-sizing: border-box; position: relative; font-family: 'Inter', -apple-system, system-ui, sans-serif;
3. Где нужна картинка — вставляй <img src="IMAGE_PLACEHOLDER" style="...">

═══════════════════════════════════
МАТЕМАТИЧЕСКИЕ ФОРМУЛЫ (MathJax)
═══════════════════════════════════
Если тема требует формул, используй СТРОГИЕ правила:
- Внутристрочные (inline): оборачивай в \\\\( и \\\\). ЗАПРЕЩЕНО использовать одинарные доллары ($...$).
- Выделенные (display): оборачивай в \\\\[ и \\\\].

═══════════════════════════════════
ДИЗАЙН-СИСТЕМА ДЛЯ ОБРАЗОВАНИЯ
═══════════════════════════════════

🎨 ЦВЕТА — светлые, контрастные, читаемые на проекторе:
- Фон слайдов: чистый белый #ffffff или очень светлый серый #f8f9fa
- Акцентный цвет (выбери один подходящий под тему):
  Математика/IT: #4f46e5 (Indigo)
  Естественные науки: #059669 (Emerald)
  Гуманитарные: #7c3aed (Violet)
  История/Общее: #2563eb (Blue)
- Текст: основной #111827, вторичный #4b5563
- Разделители: #e5e7eb
- Выделение блоков: цвет акцента с opacity 0.08 (background: color + "14")

✨ ОФОРМЛЕНИЕ — минимализм и фокус на контенте:
- Блоки контента: background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);
- Важные акценты: border-left: 4px solid [акцентный цвет];
- Никаких: неона, размытий, теней-свечений и отвлекающей графики.

📐 ТИПОГРАФИКА — крупная и разборчивая:
- Заголовок слайда: font-size: clamp(32px, 4vw, 48px); font-weight: 700; color: #111827; letter-spacing: -0.02em;
- Подзаголовок: font-size: clamp(20px, 2.5vw, 28px); font-weight: 600; color: [акцентный];
- Основной текст: font-size: clamp(20px, 2vw, 26px); line-height: 1.6;
- Максимум 6-7 строк текста на один слайд.

🧱 ЛЕЙАУТ — структурированный:
- Заголовок всегда вверху, выровнен влево, под ним — линия-разделитель (height: 4px, width: 60px, background: [акцент]).
- Композиции: Текст + Картинка (50/50), Список с иконками, Сетка из 2-3 карточек.
- Отступы (Padding контейнера): 48px 64px.

═══════════════════════════════════
СТРУКТУРА ПРЕЗЕНТАЦИИ
═══════════════════════════════════
1. Титульный (Тема, Предмет, Автор "Имя преподавателя")
2. Цели урока ("Сегодня на занятии...")
3-N. Основной материал (Определения в рамках, примеры, таблицы, схемы)
N-1. Проверка знаний (2-3 вопроса)
N. Итоги и Домашнее задание (placeholder)

═══════════════════════════════════
IMAGE PROMPTS
═══════════════════════════════════
"High-quality educational illustration, [subject], clean background, professional, clear details, suitable for slide deck, 8k"

Сгенерируй ровно ${numCards} слайдов. Ответ начни сразу с [.
    `;

    const prediction = await this.runReplicatePrediction('google/gemini-3-flash', {
      prompt: prompt,
      max_tokens: 15000,
      system_prompt: 'You are a professional educational slide designer. Output only valid JSON array of slides.',
    });


    let rawOutput = '';
    if (Array.isArray(prediction.output)) {
      rawOutput = prediction.output.join('');
    } else if (typeof prediction.output === 'string') {
      rawOutput = prediction.output;
    }

    rawOutput = rawOutput
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    try {
      const parsed = JSON.parse(rawOutput) as any[];
      return parsed.map((item) => ({
        id: 'slide_' + Math.random().toString(36).substring(2, 11),
        html: item.html || '',
        css: '',
        js: '',
        imagePrompt: item.imagePrompt || '',
      }));
    } catch (e) {
      this.logger.error(`Failed to parse AI output: ${rawOutput}`);
      throw new Error('Failed to parse generated presentation JSON');
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

    throw new Error('No image URL in output');
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
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempts) * 1000));
      }
    }
    throw new Error('Replicate prediction failed after max attempts');
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

  @OnWorkerEvent('completed')
  onCompleted(job: Job<ReplicatePresentationJobData>) {
    this.logger.log(`Replicate presentation job completed: ${job.id}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ReplicatePresentationJobData>, error: Error) {
    this.logger.error(`Replicate presentation job failed: ${job.id}, error: ${error.message}`);
  }
}
