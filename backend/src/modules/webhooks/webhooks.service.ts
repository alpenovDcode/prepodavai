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
      if (
        typeof content === 'string' &&
        (content.trim().startsWith('{') || content.trim().startsWith('['))
      ) {
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

  /**
   * Универсальный обработчик callback от n8n
   * Подходит для любых типов генераций
   */
  async handleGenericCallback(body: any) {
    const bodyData = Array.isArray(body) ? body[0] : body;

    const generationRequestId =
      bodyData?.generationRequestId || bodyData?.requestId || bodyData?.id;

    if (!generationRequestId) {
      throw new NotFoundException('Missing generationRequestId');
    }

    const generationRequest = await this.prisma.generationRequest.findUnique({
      where: { id: generationRequestId },
    });

    if (!generationRequest) {
      throw new NotFoundException('Generation request not found');
    }

    const success = bodyData?.success !== false; // По умолчанию считаем успешным, если явно не false
    let error = bodyData?.error || bodyData?.errorMessage;

    // Логика из Chatium: некоторые вебхуки возвращают status: 'success' вместо поля success
    if (!error && typeof bodyData?.status === 'string') {
      const status = bodyData.status.toLowerCase();
      if (status === 'success' || status === 'completed') {
        // success уже true
      } else if (status === 'failed' || status === 'error') {
        error = 'Status is failed';
      }
    }

    if (success && !error) {
      // Очищаем данные от служебных полей
      const {
        generationRequestId: _id1,
        requestId: _id2,
        id: _id3,
        success: _s,
        error: _e,
        errorMessage: _em,
        webhook_secret: _ws,
        status: _st,
        ...payload
      } = bodyData;

      // Если тип не передан, берем из запроса
      const type = bodyData?.type || generationRequest.type || 'generic';

      // Логика из Chatium: Нормализуем контент из поля output, если нет content/text/result
      if (!payload.content && !payload.text && !payload.result && payload.output) {
        try {
          const parsedOutput =
            typeof payload.output === 'string' ? JSON.parse(payload.output) : payload.output;

          if (Array.isArray(parsedOutput)) {
            payload.content = parsedOutput.join('');
          } else if (typeof parsedOutput === 'object') {
            payload.content = parsedOutput;
          } else {
            payload.content = String(parsedOutput);
          }
        } catch (e) {
          payload.content = String(payload.output);
        }
      }

      // Нормализуем контент если он пришел в поле text/content/result
      const mainContent = payload.content || payload.text || payload.result || payload.output;

      // Если контент - JSON строка, парсим её (логика из Chatium)
      let parsedContent = mainContent;
      if (
        typeof mainContent === 'string' &&
        (mainContent.trim().startsWith('{') || mainContent.trim().startsWith('['))
      ) {
        try {
          parsedContent = JSON.parse(mainContent);
          // Если распарсилось, обновляем в payload
          if (payload.content) payload.content = parsedContent;
          else if (payload.text) payload.text = parsedContent;
          else if (payload.result) payload.result = parsedContent;
        } catch (e) {
          // Игнорируем ошибки парсинга, оставляем как строку
        }
      }

      const outputData = {
        ...payload,
        // Убедимся что есть какое-то поле с контентом
        result: parsedContent || payload,
        type,
        completedAt: new Date().toISOString(),
      };

      await this.generationHelpers.completeGeneration(generationRequestId, outputData);

      return { success: true, message: 'Generic callback processed successfully' };
    } else {
      const errorMsg = error || 'Unknown error from n8n generic callback';
      await this.generationHelpers.failGeneration(generationRequestId, errorMsg);
      return { success: false, error: errorMsg };
    }
  }
}
