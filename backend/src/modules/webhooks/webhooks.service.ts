import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GenerationHelpersService } from '../generations/generation-helpers.service';

@Injectable()
export class WebhooksService {
  constructor(
    private prisma: PrismaService,
    private generationHelpers: GenerationHelpersService,
  ) {}

  /**
   * Обработка callback для текстовых генераций
   */
  async handleTextGenerationCallback(type: string, body: any) {
    // n8n иногда отправляет массив
    const bodyData = Array.isArray(body) ? body[0] : body;

    const generationRequestId =
      bodyData?.generationRequestId || bodyData?.requestId || bodyData?.id;
    const success = bodyData?.success;
    let content = bodyData?.content || bodyData?.text || bodyData?.result;
    const error = bodyData?.error || bodyData?.errorMessage;

    if (!generationRequestId) {
      throw new NotFoundException('Missing generationRequestId');
    }

    const generationRequest = await this.prisma.generationRequest.findUnique({
      where: { id: generationRequestId },
    });

    if (!generationRequest) {
      throw new NotFoundException('Generation request not found');
    }

    if (success && content) {
      // Парсим JSON если нужно
      if (typeof content === 'string' && (content.trim().startsWith('{') || content.trim().startsWith('['))) {
        try {
          content = JSON.parse(content);
        } catch (e) {
          // Оставляем как строку
        }
      }

      const outputData = {
        content,
        type,
        completedAt: new Date().toISOString(),
      };

      await this.generationHelpers.completeGeneration(generationRequestId, outputData);

      return { success: true, message: 'Callback processed successfully' };
    } else {
      const errorMsg = error || 'Unknown error from webhook';
      await this.generationHelpers.failGeneration(generationRequestId, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Обработка callback для изображений
   */
  async handleImageCallback(body: any) {
    const bodyData = Array.isArray(body) ? body[0] : body;

    const generationRequestId =
      bodyData?.generationRequestId || bodyData?.requestId || bodyData?.id;
    const success = bodyData?.success;
    const imageUrl = bodyData?.imageUrl || bodyData?.image_url;
    const error = bodyData?.error || bodyData?.errorMessage;
    const prompt = bodyData?.prompt;
    const style = bodyData?.style;
    const type = bodyData?.type || 'image';

    if (!generationRequestId) {
      throw new NotFoundException('Missing generationRequestId');
    }

    const generationRequest = await this.prisma.generationRequest.findUnique({
      where: { id: generationRequestId },
    });

    if (!generationRequest) {
      throw new NotFoundException('Generation request not found');
    }

    if (success && imageUrl) {
      const outputData = {
        imageUrl,
        prompt: prompt || 'N/A',
        style: style || 'realistic',
        type,
        completedAt: new Date().toISOString(),
      };

      await this.generationHelpers.completeGeneration(generationRequestId, outputData);

      return { success: true, message: 'Image callback processed successfully' };
    } else {
      const errorMsg = error || 'Unknown error from n8n';
      await this.generationHelpers.failGeneration(generationRequestId, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Обработка callback для презентаций
   */
  async handlePresentationCallback(body: any) {
    const bodyData = Array.isArray(body) ? body[0] : body;

    const generationRequestId =
      bodyData?.generationRequestId || bodyData?.requestId || bodyData?.id;
    const success = bodyData?.success;
    const gammaUrl = bodyData?.gammaUrl || bodyData?.gamma_url;
    const pdfUrl = bodyData?.pdfUrl || bodyData?.pdf_url;
    const pptxUrl = bodyData?.pptxUrl || bodyData?.pptx_url;
    const error = bodyData?.error || bodyData?.errorMessage;
    const inputText = bodyData?.inputText;
    const themeName = bodyData?.themeName;

    if (!generationRequestId) {
      throw new NotFoundException('Missing generationRequestId');
    }

    const generationRequest = await this.prisma.generationRequest.findUnique({
      where: { id: generationRequestId },
    });

    if (!generationRequest) {
      throw new NotFoundException('Generation request not found');
    }

    if (success && (gammaUrl || pdfUrl || pptxUrl)) {
      const outputData = {
        gammaUrl,
        pdfUrl,
        pptxUrl,
        inputText: inputText || 'N/A',
        themeName: themeName || 'N/A',
        type: 'presentation',
        completedAt: new Date().toISOString(),
      };

      await this.generationHelpers.completeGeneration(generationRequestId, outputData);

      return { success: true, message: 'Presentation callback processed successfully' };
    } else {
      const errorMsg = error || 'Unknown error from n8n';
      await this.generationHelpers.failGeneration(generationRequestId, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Обработка callback для транскрипций
   */
  async handleTranscriptionCallback(body: any) {
    const bodyData = Array.isArray(body) ? body[0] : body;

    const generationRequestId =
      bodyData?.generationRequestId || bodyData?.requestId || bodyData?.id;
    const success = bodyData?.success;
    const transcription = bodyData?.transcription || bodyData?.text;
    const error = bodyData?.error || bodyData?.errorMessage;

    if (!generationRequestId) {
      throw new NotFoundException('Missing generationRequestId');
    }

    const generationRequest = await this.prisma.generationRequest.findUnique({
      where: { id: generationRequestId },
    });

    if (!generationRequest) {
      throw new NotFoundException('Generation request not found');
    }

    if (success && transcription) {
      const outputData = {
        transcription,
        type: 'transcription',
        completedAt: new Date().toISOString(),
      };

      await this.generationHelpers.completeGeneration(generationRequestId, outputData);

      return { success: true, message: 'Transcription callback processed successfully' };
    } else {
      const errorMsg = error || 'Unknown error from n8n';
      await this.generationHelpers.failGeneration(generationRequestId, errorMsg);
      return { success: false, error: errorMsg };
    }
  }
}

