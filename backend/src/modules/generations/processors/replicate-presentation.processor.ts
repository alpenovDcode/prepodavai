import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import axios from 'axios';
import { GenerationHelpersService } from '../generation-helpers.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { FilesService } from '../../files/files.service';
import { PresentationGeneratorService } from '../presentation/presentation-generator.service';
import { PresentationPdfService } from '../presentation/presentation-pdf.service';
import { Slide, SlideDoc, SlideThemeId } from '../presentation/slide-doc.types';

export interface ReplicatePresentationJobData {
  generationRequestId: string;
  topic: string;
  duration?: string;
  style?: string;
  targetAudience?: string;
  numCards?: number;
  themeId?: SlideThemeId;
}

/**
 * BullMQ worker for SlideDoc-based presentation generation.
 *
 * Pipeline:
 *   1. PresentationGeneratorService → SlideDoc (outline + per-slide content
 *      + image generation, with retries and partial-failure tolerance).
 *   2. Persist any generated images to local storage (FilesService).
 *   3. Render SlideDoc → landscape PDF via PresentationPdfService.
 *   4. Save outputData = { slideDoc, pdfUrl } to UserGeneration.
 */
@Processor('replicate-presentation')
export class ReplicatePresentationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReplicatePresentationProcessor.name);

  constructor(
    private readonly generationHelpers: GenerationHelpersService,
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
    private readonly generator: PresentationGeneratorService,
    private readonly pdf: PresentationPdfService,
  ) {
    super();
  }

  async process(job: Job<ReplicatePresentationJobData>): Promise<void> {
    const { generationRequestId, topic, duration, targetAudience, numCards, themeId } = job.data;
    this.logger.log(`Processing presentation request ${generationRequestId}: "${topic}"`);

    const generation = await this.prisma.userGeneration.findUnique({
      where: { generationRequestId },
      select: { userId: true },
    });
    const userId = generation?.userId;

    // Buffer raw outputs from failed LLM stages so we can save them alongside
    // the result. Lets us inspect what the model returned without rerunning.
    const failures: Array<{ stage: string; raw: string; meta: Record<string, any>; ts: string }> = [];
    const failureSink = {
      capture: (stage: string, raw: string, meta: Record<string, any>) => {
        failures.push({ stage, raw: raw?.slice(0, 4000) ?? '', meta, ts: new Date().toISOString() });
      },
    };

    try {
      const doc = await this.generator.generate({
        topic,
        audience: targetAudience,
        durationMinutes: duration ? parseInt(duration, 10) || undefined : undefined,
        numSlides: numCards || 7,
        themeId,
        failureSink,
      });

      this.logger.log(`SlideDoc ready: ${doc.slides.length} slides, theme=${doc.themeId}`);

      await this.persistImages(doc, userId, generationRequestId);

      let pdfUrl: string | undefined;
      try {
        const pdfBuffer = await this.pdf.docToPdf(doc);
        const fileData = await this.filesService.saveBuffer(
          pdfBuffer,
          'presentation.pdf',
          userId,
        );
        pdfUrl = fileData.url;
        this.logger.log(`Presentation PDF saved: ${pdfUrl}`);
      } catch (pdfError: any) {
        this.logger.error(`PDF export failed: ${pdfError.message}`, pdfError.stack);
      }

      const outputData: Record<string, any> = {
        provider: 'Replicate',
        mode: 'presentation',
        slideDoc: doc,
        pdfUrl,
        exportUrl: pdfUrl,
        topic,
        completedAt: new Date().toISOString(),
      };

      if (failures.length) {
        // Persisted alongside the result so devs can debug bad-output incidents
        // without having to re-run the generation. Safe to show in admin UI.
        outputData._diagnostics = { failures };
        this.logger.warn(
          `Presentation completed with ${failures.length} stage failures: ${failures
            .map((f) => f.stage)
            .join(', ')}`,
        );
      }

      await this.generationHelpers.completeGeneration(generationRequestId, outputData);
    } catch (error: any) {
      this.logger.error(`Presentation generation failed: ${error.message}`, error.stack);
      await this.generationHelpers.failGeneration(
        generationRequestId,
        error.message || 'Presentation generation failed',
      );
      throw error;
    }
  }

  /**
   * Replicate image URLs are short-lived. Re-host any successfully generated
   * images to local storage so the SlideDoc remains valid long-term.
   */
  private async persistImages(
    doc: SlideDoc,
    userId: string | undefined,
    requestId: string,
  ): Promise<void> {
    await Promise.all(
      doc.slides.map(async (slide: Slide, idx: number) => {
        const remoteUrl = slide.image?.url;
        if (!remoteUrl) return;
        try {
          const response = await axios.get(remoteUrl, { responseType: 'arraybuffer' });
          const buffer = Buffer.from(response.data);
          const local = await this.filesService.saveBuffer(
            buffer,
            `slide_${requestId}_${idx}.png`,
            userId,
          );
          slide.image!.url = local.url;
        } catch (e: any) {
          this.logger.warn(
            `Could not rehost image for slide ${idx + 1}: ${e.message}. Keeping remote URL.`,
          );
        }
      }),
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<ReplicatePresentationJobData>) {
    this.logger.log(`Presentation job completed: ${job.id}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ReplicatePresentationJobData>, error: Error) {
    this.logger.error(`Presentation job failed: ${job.id}, error: ${error.message}`);
  }
}
