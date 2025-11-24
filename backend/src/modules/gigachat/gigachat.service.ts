import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { randomUUID } from 'crypto';
import * as https from 'https';
import FormData from 'form-data';
import { GigachatMode } from './dto/gigachat-generation.dto';

interface NormalizedModel {
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
    const endpoint = this.configService.get<string>('GIGACHAT_IMAGE_ENDPOINT', '/images/edits');
    return this.requestJson({
      method: 'POST',
      url: endpoint,
      data: payload,
    });
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
      return await this.http.request<T>({
        ...config,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(config.headers || {}),
        },
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401 && retry) {
        await this.ensureAccessToken(true);
        return this.requestRaw<T>(config, false);
      }
      throw error;
    }
  }
}
