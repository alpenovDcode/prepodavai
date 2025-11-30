import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { randomUUID } from 'crypto';
import * as https from 'https';
import FormData = require('form-data');
import { GigachatMode } from './dto/gigachat-generation.dto';

export interface NormalizedModel {
  id: string;
  label: string;
  ownedBy?: string;
  raw?: any;
}

export interface CategorizedModels {
  chat: NormalizedModel[];
  image: NormalizedModel[];
  audio: NormalizedModel[];
  embeddings: NormalizedModel[];
}

interface GigachatFilePayload {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

interface GigachatFileMetadata {
  id: string;
  filename?: string;
  mime_type?: string;
  size?: number;
  [key: string]: any;
}

@Injectable()
export class GigachatService {
  private readonly logger = new Logger(GigachatService.name);
  private readonly authUrl: string;
  private readonly apiBaseUrl: string;
  private readonly scope: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly authToken: string;
  private readonly httpsAgent: https.Agent;
  private readonly http: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  private readonly defaultModels: Record<GigachatMode, string>;

  private readonly fallbackModels: CategorizedModels = {
    chat: [
      { id: 'GigaChat', label: 'GigaChat' },
      { id: 'GigaChat-Pro', label: 'GigaChat-Pro' },
      { id: 'GigaChat-2-Max', label: 'GigaChat-2-Max' },
    ],
    image: [{ id: 'GigaChat-2-Max', label: 'GigaChat-2-Max' }],
    audio: [{ id: 'GigaChat-Audio', label: 'GigaChat-Audio' }],
    embeddings: [{ id: 'GigaChat-Embedding', label: 'GigaChat-Embedding' }],
  };

  constructor(private readonly configService: ConfigService) {
    this.authUrl = this.configService.get<string>(
      'GIGACHAT_AUTH_URL',
      'https://ngw.devices.sberbank.ru:9443',
    );
    this.apiBaseUrl = this.configService.get<string>(
      'GIGACHAT_API_URL',
      'https://gigachat.devices.sberbank.ru/api/v1',
    );
    this.scope = this.configService.get<string>('GIGACHAT_SCOPE', 'GIGACHAT_API_PERS');
    this.clientId = this.configService.get<string>('GIGACHAT_CLIENT_ID')?.trim();
    this.clientSecret = this.configService.get<string>('GIGACHAT_CLIENT_SECRET')?.trim();
    this.authToken = this.configService.get<string>('GIGACHAT_AUTH_TOKEN')?.trim();

    this.logger.log('--- GigaChat Config Debug ---');
    this.logger.log(`GIGACHAT_AUTH_TOKEN present: ${!!this.authToken}`);
    if (this.authToken) this.logger.log(`GIGACHAT_AUTH_TOKEN length: ${this.authToken.length}`);
    this.logger.log(`GIGACHAT_CLIENT_ID present: ${!!this.clientId}`);
    this.logger.log(`GIGACHAT_CLIENT_SECRET present: ${!!this.clientSecret}`);
    if (this.clientSecret) this.logger.log(`GIGACHAT_CLIENT_SECRET length: ${this.clientSecret.length}`);

    if (this.clientSecret && this.clientSecret.length > 100) {
      this.logger.warn('WARNING: GIGACHAT_CLIENT_SECRET appears to be a JWT token (too long). It should be a UUID (e.g. f3c5ffdc-...). Check your .env file!');
    }
    this.logger.log('-----------------------------');

    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });

    this.http = axios.create({
      baseURL: this.apiBaseUrl,
      timeout: 120000,
      httpsAgent: this.httpsAgent,
    });

    this.defaultModels = {
      chat: this.configService.get<string>('GIGACHAT_DEFAULT_CHAT_MODEL', 'GigaChat-2-Max'),
      image: this.configService.get<string>('GIGACHAT_DEFAULT_IMAGE_MODEL', 'GigaChat-2-Max'), // Используем GigaChat-2-Max для генерации изображений
      embeddings: this.configService.get<string>(
        'GIGACHAT_DEFAULT_EMBEDDINGS_MODEL',
        'GigaChat-Embedding',
      ),
      tokens_count: this.configService.get<string>('GIGACHAT_DEFAULT_CHAT_MODEL', 'GigaChat-2-Max'),
    };
  }

  async listModels(capability?: string) {
    try {
      const payload = await this.requestJson<any>({
        method: 'GET',
        url: '/models',
      });

      const models = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.models)
          ? payload.models
          : [];

      const categorized = this.categorizeModels(models);

      if (capability && categorized[capability as keyof CategorizedModels]) {
        return {
          success: true,
          models: {
            [capability]: categorized[capability as keyof CategorizedModels],
          },
        };
      }

      return {
        success: true,
        models: categorized,
      };
    } catch (error) {
      this.logger.warn(`Не удалось получить список моделей GigaChat: ${error?.message || error}`);
      return {
        success: true,
        models: this.fallbackModels,
        fallback: true,
      };
    }
  }

  getDefaultModel(mode: GigachatMode): string {
    return this.defaultModels[mode] || 'GigaChat-2-Max';
  }

  async createChatCompletion(payload: Record<string, any>) {
    return this.requestJson({
      method: 'POST',
      url: '/chat/completions',
      data: payload,
    });
  }

  async createImage(payload: Record<string, any>) {
    this.logger.debug(`Creating image with payload: ${JSON.stringify(payload)}`);

    try {
      // Согласно официальной документации GigaChat, text2image - это встроенная функция.
      // Она автоматически вызывается моделью при установке function_call: "auto"
      // и получении запроса на генерацию изображения.
      // Не нужно вручную определять функцию - GigaChat сделает это сам.

      // Формируем простой и понятный промпт на естественном языке
      let userMessage = `Нарисуй изображение: ${payload.prompt}`;

      // Добавляем дополнительные параметры в промпт, если они указаны
      if (payload.negative_prompt) {
        userMessage += `\nНе включай в изображение: ${payload.negative_prompt}`;
      }
      if (payload.size) {
        userMessage += `\nРазмер изображения: ${payload.size}`;
      }
      if (payload.quality && payload.quality === 'high') {
        userMessage += `\nСделай изображение высокого качества`;
      }

      const chatPayload: any = {
        model: payload.model,
        messages: payload.messages || [
          {
            role: 'user',
            content: userMessage,
          },
        ],
        // Устанавливаем function_call: "auto" чтобы GigaChat сам определил,
        // что нужно вызвать встроенную функцию text2image
        function_call: 'auto',
      };

      this.logger.debug(`Sending chat completion request for image generation`);
      this.logger.debug(`Request payload: ${JSON.stringify(chatPayload, null, 2)}`);

      const response = await this.requestJson({
        method: 'POST',
        url: '/chat/completions',
        data: chatPayload,
      });

      this.logger.debug(`Received response from GigaChat`);
      this.logger.debug(`Response structure: ${JSON.stringify(response, null, 2)}`);

      // Извлекаем file_id из ответа
      const fileId = this.extractFileIdFromResponse(response);

      if (!fileId) {
        this.logger.error(`Failed to extract file_id from response`);
        this.logger.error(`Full response: ${JSON.stringify(response, null, 2)}`);
        throw new Error('Не удалось получить идентификатор изображения от GigaChat. Возможно, модель не вызвала функцию text2image. Проверьте логи для деталей.');
      }

      this.logger.debug(`Successfully extracted file_id: ${fileId}`);
      this.logger.debug(`Downloading image content from GigaChat`);

      // Получаем само изображение по file_id
      const imageResponse = await this.requestRaw<Buffer>({
        method: 'GET',
        url: `/files/${fileId}/content`,
        responseType: 'arraybuffer',
        headers: {
          Accept: 'image/jpeg',
        },
      });

      this.logger.debug(`Image downloaded successfully, size: ${imageResponse.data.byteLength} bytes`);

      return {
        data: [
          {
            url: `data:image/jpeg;base64,${Buffer.from(imageResponse.data).toString('base64')}`,
            b64_json: Buffer.from(imageResponse.data).toString('base64'),
          },
        ],
        file_id: fileId,
      };
    } catch (error: any) {
      this.logger.error(`GigaChat createImage error: ${error.message}`, error.stack);
      if (error.response) {
        this.logger.error(`GigaChat API error response: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  private extractFileIdFromResponse(response: any): string | null {
    if (!response) {
      this.logger.warn('Empty response from GigaChat');
      return null;
    }

    this.logger.debug(`Extracting file_id from response: ${JSON.stringify(response, null, 2)}`);

    // Проверяем choices[0].message.function_call.arguments (основной путь)
    const choice = response?.choices?.[0];
    if (choice?.message?.function_call) {
      const functionCall = choice.message.function_call;
      this.logger.debug(`Found function_call: ${JSON.stringify(functionCall)}`);

      if (functionCall.name === 'text2image') {
        try {
          const args = typeof functionCall.arguments === 'string'
            ? JSON.parse(functionCall.arguments)
            : functionCall.arguments;

          this.logger.debug(`Parsed function arguments: ${JSON.stringify(args)}`);

          if (args?.file_id) {
            return args.file_id;
          }
        } catch (e) {
          this.logger.warn(`Failed to parse function_call arguments: ${e.message}`);
        }
      }
    }

    // Альтернативный вариант: проверяем напрямую в ответе
    if (response?.file_id) {
      this.logger.debug(`Found file_id in response root: ${response.file_id}`);
      return response.file_id;
    }

    // Проверяем в message.content, если там JSON или UUID
    const content = choice?.message?.content;
    if (content) {
      // Может быть UUID напрямую
      const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
      const match = content.match(uuidRegex);
      if (match) {
        this.logger.debug(`Found UUID in content: ${match[0]}`);
        return match[0];
      }

      // Или JSON
      try {
        const parsed = typeof content === 'string' ? JSON.parse(content) : content;
        if (parsed?.file_id) {
          this.logger.debug(`Found file_id in parsed content: ${parsed.file_id}`);
          return parsed.file_id;
        }
      } catch (e) {
        // Не JSON, игнорируем
      }
    }

    this.logger.error(`Could not extract file_id from response: ${JSON.stringify(response)}`);
    return null;
  }


  async createEmbeddings(payload: { model: string; input: string[] }) {
    this.logger.debug(`Creating embeddings for ${payload.input.length} texts`);

    return this.requestJson({
      method: 'POST',
      url: '/embeddings',
      data: {
        model: payload.model,
        input: payload.input,
      },
    });
  }

  async countTokens(payload: { model: string; input: string[] }) {
    this.logger.debug(`Counting tokens for ${payload.input.length} texts`);

    return this.requestJson({
      method: 'POST',
      url: '/tokens/count',
      data: {
        model: payload.model,
        input: payload.input,
      },
    });
  }

  async createSpeech(payload: Record<string, any>) {
    this.logger.debug(`Creating speech: voice=${payload.voice}, format=${payload.format}`);

    const response = await this.requestRaw<ArrayBuffer>({
      method: 'POST',
      url: '/audio/speech',
      data: payload,
      responseType: 'arraybuffer',
      headers: {
        'Content-Type': 'application/json',
        Accept: payload.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
      },
    });

    this.logger.debug('Speech created successfully');
    return {
      buffer: Buffer.from(response.data),
      mimeType:
        (response.headers['content-type'] as string) ||
        (payload.format === 'wav' ? 'audio/wav' : 'audio/mpeg'),
    };
  }

  async createTranscription(payload: {
    model: string;
    language?: string;
    file: GigachatFilePayload;
  }) {
    this.logger.debug(`Transcribing audio: language=${payload.language || 'auto'}`);

    const form = new FormData();
    form.append('model', payload.model);
    form.append('file', payload.file.buffer, {
      filename: payload.file.filename,
      contentType: payload.file.mimeType,
    });

    if (payload.language) {
      form.append('language', payload.language);
    }

    const result = await this.requestJson({
      method: 'POST',
      url: '/audio/transcriptions',
      data: form,
      headers: form.getHeaders(),
    });

    this.logger.debug('Transcription completed successfully');
    return result;
  }

  async createTranslation(payload: {
    model: string;
    targetLanguage?: string;
    file: GigachatFilePayload;
  }) {
    this.logger.debug(`Translating audio: targetLanguage=${payload.targetLanguage || 'ru'}`);

    const form = new FormData();
    form.append('model', payload.model);
    form.append('file', payload.file.buffer, {
      filename: payload.file.filename,
      contentType: payload.file.mimeType,
    });

    if (payload.targetLanguage) {
      form.append('target_language', payload.targetLanguage);
    }

    const result = await this.requestJson({
      method: 'POST',
      url: '/audio/translations',
      data: form,
      headers: form.getHeaders(),
    });

    this.logger.debug('Translation completed successfully');
    return result;
  }

  /**
   * Upload file to GigaChat
   * @param file Buffer containing file data
   * @param purpose Purpose of the file (e.g., 'assistants', 'vision', 'batch')
   * @returns File ID
   */
  async uploadFile(file: Buffer, filename: string, purpose: string = 'general'): Promise<string> {
    this.logger.debug(`Uploading file: ${filename}, purpose: ${purpose}`);

    const form = new FormData();
    form.append('file', file, { filename });
    form.append('purpose', purpose);

    const response = await this.requestJson<{ id: string }>({
      method: 'POST',
      url: '/files',
      data: form,
      headers: form.getHeaders(),
    });

    this.logger.debug(`File uploaded successfully: ${response.id}`);
    return response.id;
  }

  /**
   * Get file metadata
   * @param fileId File ID
   * @returns File metadata
   */
  async getFile(fileId: string): Promise<GigachatFileMetadata> {
    this.logger.debug(`Getting file metadata: ${fileId}`);

    return this.requestJson({
      method: 'GET',
      url: `/files/${fileId}`,
    });
  }

  /**
   * Get file content
   * @param fileId File ID
   * @returns File content as Buffer
   */
  async getFileContent(fileId: string): Promise<Buffer> {
    this.logger.debug(`Downloading file content: ${fileId}`);

    const response = await this.requestRaw<ArrayBuffer>({
      method: 'GET',
      url: `/files/${fileId}/content`,
      responseType: 'arraybuffer',
    });

    return Buffer.from(response.data as ArrayBuffer);
  }

  /**
   * Delete file
   * @param fileId File ID
   */
  async deleteFile(fileId: string) {
    this.logger.debug(`Deleting file: ${fileId}`);

    return this.requestJson({
      method: 'DELETE',
      url: `/files/${fileId}`,
    });
  }

  private categorizeModels(models: any[]): CategorizedModels {
    const categorized: CategorizedModels = {
      chat: [],
      image: [],
      audio: [],
      embeddings: [],
    };

    models.forEach((model) => {
      const normalized = this.normalizeModel(model);
      const id = normalized.id.toLowerCase();
      const capabilities: string[] = Array.isArray(model?.capabilities)
        ? model.capabilities.map((cap: string) => cap.toLowerCase())
        : [];

      const bucket =
        capabilities.includes('image') || id.includes('image')
          ? 'image'
          : capabilities.includes('audio') ||
            capabilities.includes('speech') ||
            id.includes('audio')
            ? 'audio'
            : capabilities.includes('embedding') || id.includes('embed')
              ? 'embeddings'
              : 'chat';

      categorized[bucket].push(normalized);
    });

    // Добавляем fallback при отсутствии моделей
    (Object.keys(categorized) as (keyof CategorizedModels)[]).forEach((key) => {
      if (!categorized[key].length) {
        categorized[key] = this.fallbackModels[key];
      }
    });

    return categorized;
  }

  private normalizeModel(model: any): NormalizedModel {
    if (typeof model === 'string') {
      return {
        id: model,
        label: model,
      };
    }

    return {
      id: model?.id || model?.name || 'GigaChat',
      label: model?.display_name || model?.label || model?.name || model?.id || 'GigaChat',
      ownedBy: model?.owned_by,
      raw: model,
    };
  }

  private async ensureAccessToken(force = false) {
    if (!force && this.accessToken && Date.now() < this.tokenExpiresAt - 60 * 1000) {
      return this.accessToken;
    }
    let authHeader: string;

    if (this.authToken) {
      if (this.authToken.includes(':')) {
        this.logger.debug('GIGACHAT_AUTH_TOKEN appears to be raw id:secret, encoding to Base64');
        authHeader = Buffer.from(this.authToken).toString('base64');
      } else {
        this.logger.debug('Using provided GIGACHAT_AUTH_TOKEN as Base64');
        authHeader = this.authToken;
      }
    } else if (this.clientId && this.clientSecret) {
      authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      this.logger.debug('Using CLIENT_ID:CLIENT_SECRET for authentication');
    } else {
      throw new Error('GIGACHAT_AUTH_TOKEN или (GIGACHAT_CLIENT_ID и GIGACHAT_CLIENT_SECRET) должны быть настроены');
    }

    const url = `${this.authUrl}/api/v2/oauth`;

    const response = await axios.request({
      method: 'POST',
      url,
      data: `scope=${this.scope}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authHeader}`,
        RqUID: randomUUID(),
      },
      httpsAgent: this.httpsAgent,
    });

    const expiresIn = Number(response.data?.expires_in) || 600;
    this.accessToken = response.data?.access_token;
    this.tokenExpiresAt = Date.now() + expiresIn * 1000;

    return this.accessToken;
  }

  private async requestJson<T>(config: AxiosRequestConfig): Promise<T> {
    const response = await this.requestRaw<T>(config);
    return response.data;
  }

  private async requestRaw<T>(config: AxiosRequestConfig, retry = true): Promise<AxiosResponse<T>> {
    const token = await this.ensureAccessToken();

    try {
      const response = await this.http.request<T>({
        ...config,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(config.headers || {}),
        },
      });
      return response;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401 && retry) {
          this.logger.warn('Got 401, refreshing token and retrying');
          await this.ensureAccessToken(true);
          return this.requestRaw<T>(config, false);
        }

        // Логируем детали ошибки
        this.logger.error(`GigaChat API request failed: ${error.message}`, {
          url: config.url,
          method: config.method,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
        });
      }
      throw error;
    }
  }
}
