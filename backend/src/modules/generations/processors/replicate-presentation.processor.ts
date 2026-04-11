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
    const grade = params.targetAudience || 'General Audience';
    const duration = params.duration || '15';
    const style = params.style || 'modern';

    const prompt = `
Ты — арт-директор и Senior Frontend-разработчик уровня Awwwards/Stripe/Linear. Твоя задача — создать презентацию, которая вызывает "вау-эффект" с первого слайда.

КОНТЕКСТ:
- Язык: Русский
- Тема: "${topic}"
- Аудитория: ${grade}
- Длительность: ${duration} мин
- Стиль: ${style}
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
2. Контейнер слайда обязательно: width: 100vw; height: 100vh; overflow: hidden; box-sizing: border-box; position: relative; font-family: -apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif;
3. Где нужна картинка — вставляй <img src="IMAGE_PLACEHOLDER" style="..."> (можно как фон через <img> с position: absolute и object-fit: cover, либо как акцентный визуал).

═══════════════════════════════════
ДИЗАЙН-СИСТЕМА (ВАУ-ЭФФЕКТ)
═══════════════════════════════════

🎨 ЦВЕТА — используй богатые градиенты, не плоские фоны:
- Базовые фоны: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%) или (135deg, #1a1a2e, #16213e, #0f3460) или (120deg, #000428, #004e92)
- Акценты: неоновые (#00f5ff, #ff006e, #8338ec, #fb5607, #ffbe0b), либо премиум (#d4af37 золото, #e0e0e0 серебро)
- Текст: основной #ffffff, вторичный rgba(255,255,255,0.7), подсказки rgba(255,255,255,0.45)

✨ ЭФФЕКТЫ — обязательны на КАЖДОМ слайде минимум 2-3:
- Glassmorphism: background: rgba(255,255,255,0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px;
- Свечение текста: text-shadow: 0 0 40px rgba(0,245,255,0.5);
- Градиентный текст для заголовков: background: linear-gradient(135deg, #00f5ff, #ff006e); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
- Декоративные размытые "blob"-круги через position: absolute + filter: blur(80px) + opacity: 0.4
- Тонкие сетки/линии через linear-gradient для фоновой текстуры
- Мягкие тени: box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5), 0 0 80px rgba(131,56,236,0.15);

📐 ТИПОГРАФИКА — драматичная иерархия:
- H1: font-size: clamp(56px, 7vw, 104px); font-weight: 800; letter-spacing: -0.04em; line-height: 1;
- H2: font-size: clamp(36px, 4vw, 56px); font-weight: 700; letter-spacing: -0.02em;
- Body: font-size: clamp(18px, 1.4vw, 22px); line-height: 1.6; font-weight: 400;
- Caption/Eyebrow: font-size: 13px; text-transform: uppercase; letter-spacing: 0.2em; opacity: 0.6;

🧱 ЛЕЙАУТ — НЕ центрируй всё подряд. Чередуй композиции:
- Asymmetric split (60/40 текст | визуал)
- Bento grid из карточек разного размера
- Full-bleed изображение с overlay-текстом снизу слева
- Большая цифра/метрика + поясняющий текст
- Timeline/процесс с нумерованными шагами
- Цитата с огромными кавычками
Используй CSS Grid и Flexbox активно. Padding контейнера: 64px-96px.

═══════════════════════════════════
СТРУКТУРА ПРЕЗЕНТАЦИИ
═══════════════════════════════════
- Слайд 1 (Cover): драматичный заголовок, eyebrow-текст, минимум контента, максимум атмосферы
- Слайды 2…N-1: чередуй типы — концепция, данные/метрики, сравнение, процесс, цитата, кейс
- Финальный слайд: вывод/CTA с сильным визуальным акцентом

КАЖДЫЙ слайд должен отличаться композицией от предыдущего. Никаких шаблонных "заголовок сверху + текст + картинка снизу" подряд.

═══════════════════════════════════
IMAGE PROMPTS
═══════════════════════════════════
Русский, кинематографичный, конкретный. Шаблон:
"[subject], [style: cinematic/editorial/3d render/abstract], [lighting: volumetric/neon/soft], [mood], [composition], shot on [camera], 8k, ultra detailed, [color palette matching slide]"

Избегай стоковых клише. Стремись к редакционному/арт-направлению.

Сгенерируй ровно ${numCards} слайдов. Начни ответ сразу с [.
    `;

    const prediction = await this.runReplicatePrediction('google/gemini-3-flash', {
      prompt: prompt,
      max_tokens: 15000,
      system_prompt: 'You are a helpful assistant that outputs only valid JSON array of slides.',
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
