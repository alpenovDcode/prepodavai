import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GenerationHelpersService } from '../generation-helpers.service';
import { HtmlPostprocessorService } from '../../../common/services/html-postprocessor.service';
import { FilesService } from '../../files/files.service';

export interface SalesAdvisorJobData {
  generationRequestId: string;
  imageHashes: string[];
  imageUrls: string[]; // Public URLs of the uploaded screenshots (up to 6)
}

@Processor('sales-advisor')
export class SalesAdvisorProcessor extends WorkerHost {
  private readonly logger = new Logger(SalesAdvisorProcessor.name);
  private readonly replicateToken: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly generationHelpers: GenerationHelpersService,
    private readonly htmlPostprocessor: HtmlPostprocessorService,
    private readonly filesService: FilesService,
  ) {
    super();
    this.replicateToken = this.configService.get<string>('REPLICATE_API_TOKEN');
  }

  async process(job: Job<SalesAdvisorJobData>): Promise<void> {
    const { generationRequestId, imageUrls } = job.data;
    const imageCount = imageUrls.length;
    this.logger.log(
      `Processing Sales Advisor analysis for ${generationRequestId} with ${imageCount} image(s)`,
    );

    try {
      // 1. Update progress
      await this.generationHelpers.updateProgress(generationRequestId, {
        percent: 10,
        message: `Анализ ${imageCount} скриншот(ов) диалога...`,
      });

      // 2. Analyze dialog — AI returns full HTML document
      const htmlResult = await this.analyzeDialog(imageUrls);

      await this.generationHelpers.updateProgress(generationRequestId, {
        percent: 80,
        message: 'Формирование рекомендаций...',
      });

      // 3. Post-process: replace LOGO_PLACEHOLDER, inject MathJax if needed
      const finalizedHtml = this.htmlPostprocessor.process(htmlResult);

      // 4. Complete generation
      await this.generationHelpers.completeGeneration(generationRequestId, {
        htmlResult: finalizedHtml,
      });

      this.logger.log(`Sales Advisor analysis completed for ${generationRequestId}`);
    } catch (error: any) {
      this.logger.error(`Sales Advisor analysis failed: ${error.message}`, error.stack);
      await this.generationHelpers.failGeneration(generationRequestId, error.message);
      throw error;
    }
  }

  private async analyzeDialog(imageUrls: string[]): Promise<string> {
    const imageCount = imageUrls.length;

    const systemPrompt = `Ты — опытный директор по продажам и эксперт по переговорам в EdTech индустрии.
Твоя задача — провести профессиональный анализ диалога, выявить ошибки и возражения, дать конкретные рекомендации.

ТВОЙ ПОДХОД:
- Используй фреймворки продаж: SPIN, BANT, Challenger Sale
- Анализируй психологию клиента и его истинные потребности
- Выявляй скрытые возражения за словами
- Давай конкретные, готовые к использованию формулировки

КРИТИЧЕСКИЕ ПРАВИЛА ВЫВОДА:
1. Вывод начинается СТРОГО с <!DOCTYPE html> и заканчивается </html>.
2. НИКАКОГО текста до или после HTML-кода. Никаких пояснений.
3. БЕЗ MARKDOWN — не используй \`\`\`html. Верни чистую строку кода.`;

    const userPrompt = `Проанализируй ${imageCount > 1 ? `${imageCount} скриншота диалога с клиентом (хронологический порядок)` : 'скриншот диалога с клиентом'} и верни результат в виде полного HTML-документа.

ИСПОЛЬЗУЙ ТОЧНО ЭТОТ ШАБЛОН (заменяй только содержимое секций, не меняй структуру):

<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Анализ диалога продаж</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f9fafb; font-family: 'Inter', system-ui, sans-serif; color: #111827; line-height: 1.6; padding: 20px; }
  .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
  .header { display: flex; align-items: center; gap: 20px; margin-bottom: 30px; border-bottom: 2px solid #f3f4f6; padding-bottom: 20px; }
  .header-logo { width: auto; height: 40px; }
  h1 { font-size: 26px; font-weight: 700; margin: 0; color: #111827; }
  h2 { font-size: 18px; font-weight: 600; margin-top: 32px; margin-bottom: 12px; color: #374151; display: flex; align-items: center; gap: 8px; }
  p { margin-bottom: 12px; }
  ul, ol { padding-left: 24px; margin-bottom: 16px; }
  li { margin-bottom: 8px; }
  strong { color: #111827; }
  .score-badge { display: inline-flex; align-items: center; gap: 6px; background: #f0fdf4; border: 1px solid #86efac; color: #166534; font-weight: 700; font-size: 14px; padding: 4px 12px; border-radius: 999px; margin-bottom: 16px; }
  .section { margin-bottom: 28px; }
  .callout { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin: 16px 0; border-radius: 0 8px 8px 0; }
  .callout.warning { background: #fef2f2; border-left-color: #ef4444; }
  .callout.info { background: #eff6ff; border-left-color: #3b82f6; }
  .callout.tip { background: #fefce8; border-left-color: #eab308; }
  .phrase-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin: 8px 0; font-style: italic; color: #374151; }
  .footer-logo { text-align: right; margin-top: 40px; padding-top: 20px; border-top: 1px solid #f3f4f6; }
  .footer-logo img { width: 120px; opacity: 0.5; }
  @media (max-width: 640px) { .container { padding: 20px; } h1 { font-size: 22px; } }
</style>
</head>
<body>
<div class="container">

  <div class="header">
    <img src="LOGO_PLACEHOLDER" class="header-logo" alt="Logo">
    <h1>Анализ диалога продаж</h1>
  </div>

  <div class="section">
    <h2>📊 Общая оценка диалога</h2>
    <div class="score-badge">Оценка: X/10</div>
    <!-- краткая оценка, 2-3 предложения -->
  </div>

  <div class="section">
    <h2>✅ Что сделано хорошо</h2>
    <ul>
      <li><!-- конкретный пример удачной фразы или техники --></li>
    </ul>
  </div>

  <div class="section">
    <h2>❌ Критические ошибки</h2>
    <ul>
      <li><!-- что НЕ нужно было говорить/делать и почему --></li>
    </ul>
    <div class="callout warning"><!-- самая критичная ошибка, которую нужно исправить первой --></div>
  </div>

  <div class="section">
    <h2>🎯 Анализ возражений клиента</h2>
    <ul>
      <li><strong>Возражение:</strong> <!-- цитата --> — <strong>Истинная причина:</strong> <!-- что стоит за словами --></li>
    </ul>
    <div class="callout info"><!-- как правильно отработать ключевое возражение --></div>
  </div>

  <div class="section">
    <h2>💡 Конкретные рекомендации</h2>
    <p><strong>Готовые фразы для следующего контакта:</strong></p>
    <div class="phrase-box"><!-- готовая фраза 1 --></div>
    <div class="phrase-box"><!-- готовая фраза 2 --></div>
    <div class="callout tip"><!-- стратегия дальнейшей работы с этим клиентом --></div>
  </div>

  <div class="footer-logo">
    <img src="LOGO_PLACEHOLDER" alt="Logo">
  </div>

</div>
</body>
</html>

ВАЖНО:
- Заполни все секции реальным анализом, убери HTML-комментарии из итогового кода
- Будь конкретным — давай готовые формулировки, не общие советы
- Учитывай специфику EdTech (родители, ученики, преподаватели)
- Можешь добавлять дополнительные <div class="phrase-box"> и <div class="callout"> по необходимости`;

    return this.runReplicatePredictionWithMultipleImages(imageUrls, userPrompt, systemPrompt);
  }

  /** Extracts hash from a file URL like https://host/api/files/<hash> */
  private extractHash(url: string): string | null {
    const match = url.match(/\/api\/files\/([a-f0-9]{32})$/i);
    return match ? match[1] : null;
  }

  /** Converts file URLs to base64 data URIs by reading directly from disk */
  private async toBase64DataUris(urls: string[]): Promise<string[]> {
    return Promise.all(
      urls.map(async (url) => {
        const hash = this.extractHash(url);
        if (hash) {
          const file = await this.filesService.getFile(hash);
          if (file) {
            return `data:${file.mimeType};base64,${file.buffer.toString('base64')}`;
          }
        }
        return url; // fallback to original URL if hash not found
      }),
    );
  }

  /**
   * Sends all images at once to openai/gpt-4o via Replicate using image_input array
   */
  private async runReplicatePredictionWithMultipleImages(
    imageUrls: string[],
    userPrompt: string,
    systemPrompt: string,
  ): Promise<string> {
    this.logger.log(`Analyzing ${imageUrls.length} image(s) via openai/gpt-4o (image_input array)`);

    const imageInputs = await this.toBase64DataUris(imageUrls);
    this.logger.log(`Converted ${imageInputs.length} images to base64 data URIs`);

    try {
      const response = await axios.post(
        'https://api.replicate.com/v1/models/openai/gpt-4o/predictions',
        {
          stream: false,
          input: {
            prompt: userPrompt,
            system_prompt: systemPrompt,
            image_input: imageInputs,
            max_completion_tokens: 8000,
            temperature: 0.7,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.replicateToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      let prediction = response.data;
      const predictionId = prediction.id;

      while (['starting', 'processing'].includes(prediction.status)) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const statusRes = await axios.get(
          `https://api.replicate.com/v1/predictions/${predictionId}`,
          { headers: { Authorization: `Bearer ${this.replicateToken}` } },
        );
        prediction = statusRes.data;
      }

      if (prediction.status === 'succeeded') {
        return Array.isArray(prediction.output)
          ? prediction.output.join('')
          : String(prediction.output);
      } else {
        throw new Error(`Replicate failed: ${prediction.error}`);
      }
    } catch (error: any) {
      this.logger.error(`Replicate gpt-4o error: ${error.message}`);
      throw error;
    }
  }

}
