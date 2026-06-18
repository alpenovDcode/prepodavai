import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { GenerationHelpersService } from '../generation-helpers.service';
import { FilesService } from '../../files/files.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  PresentationTemplateService,
  PresentationStyle,
  PresentationColor,
} from '../presentation/presentation-template.service';
import { PresentationPptxV2Service } from '../presentation/presentation-pptx-v2.service';

export interface ReplicatePresentationJobData {
  generationRequestId: string;
  topic: string;
  text?: string;
  duration?: string;
  /** Стиль шаблона: modern | academic | creative | corporate */
  style?: PresentationStyle | string;
  targetAudience?: string;
  /** Кол-во слайдов (5..24). Старое поле для совместимости. */
  numCards?: number;
  slidesCount?: number;
  /** Цветовая тема: indigo | emerald | violet | blue | slate */
  color?: PresentationColor | string;
  /** @deprecated — themeId был раньше, теперь только color. */
  themeId?: string;
}

/**
 * V2: presentation генерируется через HTML-шаблоны (как games).
 *
 * Поток:
 *   1. PresentationTemplateService.generate() — LLM → JSON слайдов + рендерит HTML по шаблону
 *   2. PDF/PPTX строятся из того же JSON для синхронности (один источник правды)
 *   3. Сохраняем {html, slideData, pdfUrl, pptxUrl} в outputData
 *
 * Картинок нет (по требованию). Логотип 32×32 на каждом слайде уже в шаблоне.
 */
@Processor('replicate-presentation')
export class ReplicatePresentationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReplicatePresentationProcessor.name);

  constructor(
    private readonly generationHelpers: GenerationHelpersService,
    private readonly filesService: FilesService,
    private readonly templateService: PresentationTemplateService,
    private readonly pptxService: PresentationPptxV2Service,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<ReplicatePresentationJobData>): Promise<void> {
    const {
      generationRequestId, topic, text, duration, targetAudience,
      numCards, slidesCount, style, color,
    } = job.data;

    this.logger.log(`Processing presentation ${generationRequestId}: "${topic}"`);

    const ownerUserId = await this.resolveOwnerUserId(generationRequestId);
    if (!ownerUserId) {
      throw new Error(`userId not found for generationRequest ${generationRequestId}`);
    }

    try {
      // 1. Генерируем данные и финальный HTML через шаблон
      const { html, data } = await this.templateService.generate({
        topic,
        text,
        slidesCount: slidesCount ?? numCards,
        audience: targetAudience,
        style: style as PresentationStyle,
        color: color as PresentationColor,
      });

      if (!html || html.length < 200) {
        throw new Error(`HTML rendering returned empty result (length=${html?.length ?? 0})`);
      }
      this.logger.log(`Presentation HTML ready: ${data.slides.length} slides, style=${data.style}, color=${data.color}, htmlLength=${html.length}`);

      // 2. PPTX из JSON
      let pptxUrl: string | undefined;
      try {
        const pptxBuffer = await this.pptxService.build(data);
        const pptxFile = await this.filesService.saveBuffer(
          pptxBuffer, `presentation-${generationRequestId}.pptx`, ownerUserId,
        );
        pptxUrl = pptxFile.url;
      } catch (e: any) {
        this.logger.error(`PPTX export failed: ${e?.message}`);
      }

      const outputData = {
        provider: 'Replicate',
        mode: 'presentation',
        content: html,
        presentationData: data,
        topic,
        slidesCount: data.slides.length,
        style: data.style,
        color: data.color,
        pptxUrl,
        completedAt: new Date().toISOString(),
        ...(duration ? { _duration: duration } : {}),
      };

      await this.generationHelpers.completeGeneration(generationRequestId, outputData);
    } catch (error: any) {
      this.logger.error(`Presentation failed: ${error?.message}`, error?.stack);
      await this.generationHelpers.failGeneration(
        generationRequestId,
        error?.message || 'Presentation generation failed',
      );
      throw error;
    }
  }

  /**
   * Резолвит userId владельца генерации по generationRequestId. Сначала ищем
   * userGeneration (там userId — основной источник). Фолбэк — generationRequest.
   */
  private async resolveOwnerUserId(generationRequestId: string): Promise<string | null> {
    try {
      const ug = await this.prisma.userGeneration.findUnique({
        where: { generationRequestId },
        select: { userId: true },
      });
      if (ug?.userId) return ug.userId;
      const gr = await this.prisma.generationRequest.findUnique({
        where: { id: generationRequestId },
        select: { userId: true },
      });
      return gr?.userId ?? null;
    } catch (e: any) {
      this.logger.warn(`resolveOwnerUserId failed: ${e?.message}`);
      return null;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<ReplicatePresentationJobData>) {
    this.logger.log(`Presentation job completed: ${job.id}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ReplicatePresentationJobData>, error: Error) {
    this.logger.error(`Presentation job failed: ${job.id}, error: ${error?.message}`);
  }
}
