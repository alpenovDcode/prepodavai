import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GenerationHelpersService } from '../generations/generation-helpers.service';
import { FilesService } from '../files/files.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private prisma: PrismaService,
    private generationHelpers: GenerationHelpersService,
    private filesService: FilesService,
  ) {}

  /**
   * Скачивает картинку с удалённого URL (Replicate / Polza / любой CDN) и
   * сохраняет её локально через FilesService. Возвращает наш постоянный URL
   * вида `${BASE_URL}/api/files/{hash}`.
   *
   * Replicate хранит результаты предсказаний всего ~30 минут, после чего
   * прямые ссылки умирают, и пользователь не может скачать картинку из
   * истории. Перенос в FilesService решает проблему: файл живёт столько,
   * сколько живёт UPLOAD_DIR на сервере.
   *
   * Идемпотентность: если URL уже наш (`/api/files/...`), просто возвращаем
   * его без повторного скачивания.
   */
  async persistRemoteImage(remoteUrl: string, userId: string): Promise<string> {
    if (!remoteUrl) throw new Error('persistRemoteImage: empty URL');
    if (remoteUrl.includes('/api/files/')) return remoteUrl;

    const response = await axios.get(remoteUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: 50 * 1024 * 1024,
    });
    const buffer = Buffer.from(response.data);

    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    let ext = '.png';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
    else if (contentType.includes('webp')) ext = '.webp';
    else if (contentType.includes('gif')) ext = '.gif';
    else if (contentType.includes('png')) ext = '.png';
    else {
      // Если content-type невнятный — пробуем угадать по расширению в URL.
      const m = remoteUrl.match(/\.(png|jpe?g|webp|gif)(?:[?#]|$)/i);
      if (m) ext = `.${m[1].toLowerCase().replace('jpeg', 'jpg')}`;
    }

    const filename = `generated-${Date.now()}${ext}`;
    const saved = await this.filesService.saveBuffer(buffer, filename, userId);
    return saved.url;
  }

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
          const parsed = JSON.parse(content);
          // n8n может вернуть ошибку в виде JSON, например {"detail":"list index out of range"}
          if (parsed.detail || parsed.error || parsed.errorMessage) {
            const errorMsg =
              parsed.detail || parsed.error || parsed.errorMessage || 'Unknown parsed error';
            await this.generationHelpers.failGeneration(generationRequestId, errorMsg);
            return { success: false, error: errorMsg };
          }
          content = parsed;
        } catch (e) {
          // Оставляем как строку
        }
      }

      // Если контент оказался объектом ошибки даже без парсинга
      if (
        typeof content === 'object' &&
        content !== null &&
        (content.detail || content.error || content.errorMessage)
      ) {
        const errorMsg =
          content.detail || content.error || content.errorMessage || 'Unknown error object';
        await this.generationHelpers.failGeneration(generationRequestId, errorMsg);
        return { success: false, error: errorMsg };
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
      // Перекладываем картинку с CDN провайдера в локальное хранилище —
      // иначе через ~30 минут ссылка от Replicate умрёт.
      let persistedUrl = imageUrl;
      try {
        persistedUrl = await this.persistRemoteImage(imageUrl, generationRequest.userId);
      } catch (e: any) {
        this.logger.warn(
          `handleImageCallback: failed to persist ${imageUrl}: ${e.message}. Saving original URL as fallback.`,
        );
      }

      const outputData = {
        imageUrl: persistedUrl,
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
   * Обработка callback для фотосессий
   */
  async handlePhotosessionCallback(body: any) {
    const bodyData = Array.isArray(body) ? body[0] : body;
    this.logger.log(`Received Polza.ai photosession callback: ${JSON.stringify(bodyData)}`);

    const generationRequestId =
      bodyData?.generationRequestId || bodyData?.requestId || bodyData?.id;
    const success = bodyData?.success !== undefined ? bodyData.success : (bodyData?.status === 'completed' || bodyData?.status === 'succeeded');
    
    // По результатам документации GET /v1/media/{id}
    const polzaDataUrl = bodyData?.data?.url;
    const polzaDataUrls = Array.isArray(bodyData?.data)
      ? bodyData.data.map((item: any) => item.url || (typeof item === 'string' ? item : null)).filter(Boolean)
      : (polzaDataUrl ? [polzaDataUrl] : []);
    
    const polzaImages = bodyData?.result?.images || polzaDataUrls;
    
    const imageUrls = bodyData?.imageUrls || bodyData?.image_urls || polzaImages;
    const imageUrl = bodyData?.imageUrl || bodyData?.image_url; 
    const error = bodyData?.error || bodyData?.errorMessage || bodyData?.status_description;
    const prompt = bodyData?.prompt;
    const style = bodyData?.style;
    const photoUrl = bodyData?.photoUrl || bodyData?.photo_url; // Исходное фото
    const count = bodyData?.count || imageUrls.length;

    if (!generationRequestId) {
      throw new NotFoundException('Missing generationRequestId');
    }

    let generationRequest = await this.prisma.generationRequest.findUnique({
      where: { id: generationRequestId },
    });

    // Если не нашли по ID, пробуем найти по polzaTaskId в метаданных
    if (!generationRequest) {
      generationRequest = await this.prisma.generationRequest.findFirst({
        where: {
          metadata: {
            path: ['polzaTaskId'],
            equals: generationRequestId, // bodyData.id might be the task ID
          },
        },
      });
    }

    if (!generationRequest) {
      throw new NotFoundException('Generation request not found');
    }

    // Если передан массив URL или хотя бы один URL
    const finalImageUrls = imageUrls.length > 0 ? imageUrls : imageUrl ? [imageUrl] : [];

    if (success && finalImageUrls.length > 0) {
      // Перекладываем все картинки с CDN провайдера в локальное хранилище.
      // Делаем параллельно, но с fallback на оригинал, если конкретный URL
      // не скачался (одна неудача не должна валить всю фотосессию).
      const persistedUrls = await Promise.all(
        finalImageUrls.map(async (url: string) => {
          try {
            return await this.persistRemoteImage(url, generationRequest.userId);
          } catch (e: any) {
            this.logger.warn(
              `handlePhotosessionCallback: failed to persist ${url}: ${e.message}. Saving original URL as fallback.`,
            );
            return url;
          }
        }),
      );

      const outputData = {
        imageUrls: persistedUrls,
        imageUrl: persistedUrls[0], // Первое изображение как основное
        prompt: prompt || 'N/A',
        style: style || 'realistic',
        photoUrl: photoUrl || null,
        count: count || persistedUrls.length,
        type: 'photosession',
        completedAt: new Date().toISOString(),
      };

      await this.generationHelpers.completeGeneration(generationRequestId, outputData);

      return { success: true, message: 'Photosession callback processed successfully' };
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

          // Проверяем, не является ли это JSON-объектом ошибки от n8n
          if (
            parsedContent &&
            typeof parsedContent === 'object' &&
            (parsedContent.detail || parsedContent.error || parsedContent.errorMessage)
          ) {
            const errorMsg =
              parsedContent.detail ||
              parsedContent.error ||
              parsedContent.errorMessage ||
              'Unknown parsed error';
            await this.generationHelpers.failGeneration(generationRequestId, errorMsg);
            return { success: false, error: errorMsg };
          }

          // Если распарсилось, обновляем в payload
          if (payload.content) payload.content = parsedContent;
          else if (payload.text) payload.text = parsedContent;
          else if (payload.result) payload.result = parsedContent;
        } catch (e) {
          // Игнорируем ошибки парсинга, оставляем как строку
        }
      }

      // Если основной контент — это объект с ошибкой
      if (
        typeof parsedContent === 'object' &&
        parsedContent !== null &&
        (parsedContent.detail || parsedContent.error || parsedContent.errorMessage)
      ) {
        const errorMsg =
          parsedContent.detail ||
          parsedContent.error ||
          parsedContent.errorMessage ||
          'Unknown error object';
        await this.generationHelpers.failGeneration(generationRequestId, errorMsg);
        return { success: false, error: errorMsg };
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
