import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { randomUUID } from 'crypto';
import * as https from 'https';
import FormData from 'form-data';
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

@Injectable()
export class GigachatService {
  private readonly logger = new Logger(GigachatService.name);
  private readonly authUrl: string;
  private readonly apiBaseUrl: string;
  private readonly scope: string;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly httpsAgent: https.Agent;
  private readonly http: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  private readonly defaultModels: Record<GigachatMode, string>;

  private readonly fallbackModels: CategorizedModels = {
    chat: [
      { id: 'GigaChat', label: 'GigaChat' },
      { id: 'GigaChat-Pro', label: 'GigaChat-Pro' },
      { id: 'GigaChat-Max', label: 'GigaChat-Max' },
    ],
    image: [{ id: 'GigaChat-Image', label: 'GigaChat-Image' }],
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
    this.clientId = this.configService.get<string>('GIGACHAT_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('GIGACHAT_CLIENT_SECRET');

    const disableTls =
      this.configService.get<string>('GIGACHAT_DISABLE_TLS_VERIFICATION', 'false') === 'true';
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: !disableTls,
    });

    this.http = axios.create({
      baseURL: this.apiBaseUrl,
      timeout: 20000,
      httpsAgent: this.httpsAgent,
    });

    this.defaultModels = {
      chat: this.configService.get<string>('GIGACHAT_DEFAULT_CHAT_MODEL', 'GigaChat'),
      image: this.configService.get<string>('GIGACHAT_DEFAULT_IMAGE_MODEL', 'GigaChat-Image'),
      embeddings: this.configService.get<string>(
        'GIGACHAT_DEFAULT_EMBEDDINGS_MODEL',
        'GigaChat-Embedding',
      ),
      audio_speech: this.configService.get<string>(
        'GIGACHAT_DEFAULT_AUDIO_MODEL',
        'GigaChat-Audio',
      ),
      audio_transcription: this.configService.get<string>(
        'GIGACHAT_DEFAULT_AUDIO_MODEL',
        'GigaChat-Audio',
      ),
      audio_translation: this.configService.get<string>(
        'GIGACHAT_DEFAULT_AUDIO_MODEL',
        'GigaChat-Audio',
      ),
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
    return this.defaultModels[mode] || 'GigaChat';
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
      // Согласно документации GigaChat, генерация изображений происходит через /chat/completions
      // с функцией text2image. Модель автоматически вызовет функцию при получении запроса на генерацию изображения
      // Формируем сообщение с указанием параметров
      let userMessage = `Сгенерируй изображение: ${payload.prompt}`;
      
      if (payload.negative_prompt) {
        userMessage += `\nИсключи из изображения: ${payload.negative_prompt}`;
      }
      if (payload.size) {
        userMessage += `\nРазмер: ${payload.size}`;
      }
      if (payload.quality) {
        userMessage += `\nКачество: ${payload.quality}`;
      }
      
      const chatPayload: any = {
        model: payload.model,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
        functions: [
          {
            name: 'text2image',
            description: 'Генерация изображения по текстовому описанию',
            parameters: {
              type: 'object',
              properties: {
                prompt: {
                  type: 'string',
                  description: 'Описание изображения для генерации',
                },
                negative_prompt: {
                  type: 'string',
                  description: 'Что нужно исключить из изображения',
                },
                size: {
                  type: 'string',
                  enum: ['1024x1024', '1024x1792', '1792x1024'],
                  description: 'Размер изображения. По умолчанию 1024x1024',
                },
                quality: {
                  type: 'string',
                  enum: ['standard', 'high'],
                  description: 'Качество изображения. По умолчанию standard',
                },
              },
              required: ['prompt'],
            },
          },
        ],
        function_call: 'auto',
      };

      this.logger.debug(`Sending chat completion request for image generation: ${JSON.stringify(chatPayload, null, 2)}`);
      const response = await this.requestJson({
        method: 'POST',
        url: '/chat/completions',
        data: chatPayload,
      });

      this.logger.debug(`Received response from GigaChat: ${JSON.stringify(response, null, 2)}`);

      // Извлекаем file_id из ответа
      const fileId = this.extractFileIdFromResponse(response);
      
      if (!fileId) {
        this.logger.error(`Failed to extract file_id from response: ${JSON.stringify(response)}`);
        throw new Error('Не удалось получить идентификатор изображения от GigaChat. Проверьте логи для деталей.');
      }

      this.logger.debug(`Got file_id: ${fileId}, fetching image content`);
      
      // Получаем само изображение
      const imageResponse = await this.requestRaw<Buffer>({
        method: 'GET',
        url: `/files/${fileId}/content`,
        responseType: 'arraybuffer',
        headers: {
          Accept: 'image/jpeg',
        },
      });

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


  async createEmbeddings(payload: Record<string, any>) {
    return this.requestJson({
      method: 'POST',
      url: '/embeddings',
      data: payload,
    });
  }

  async createSpeech(payload: Record<string, any>) {
    const response = await this.requestRaw<ArrayBuffer>({
      method: 'POST',
      url: '/audio/speech',
      data: payload,
      responseType: 'arraybuffer',
      headers: {
        Accept: payload.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
      },
    });

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
    const form = new FormData();
    form.append('model', payload.model);
    form.append('file', payload.file.buffer, {
      filename: payload.file.filename,
      contentType: payload.file.mimeType,
    });

    if (payload.language) {
      form.append('language', payload.language);
    }

    return this.requestJson({
      method: 'POST',
      url: '/audio/transcriptions',
      data: form,
      headers: form.getHeaders(),
    });
  }

  async createTranslation(payload: {
    model: string;
    targetLanguage?: string;
    file: GigachatFilePayload;
  }) {
    const form = new FormData();
    form.append('model', payload.model);
    form.append('file', payload.file.buffer, {
      filename: payload.file.filename,
      contentType: payload.file.mimeType,
    });

    if (payload.targetLanguage) {
      form.append('target_language', payload.targetLanguage);
    }

    return this.requestJson({
      method: 'POST',
      url: '/audio/translations',
      data: form,
      headers: form.getHeaders(),
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

    if (!this.clientId || !this.clientSecret) {
      throw new Error('GIGACHAT_CLIENT_ID и GIGACHAT_CLIENT_SECRET должны быть настроены');
    }

    const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
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
