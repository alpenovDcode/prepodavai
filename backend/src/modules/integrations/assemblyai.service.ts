import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface TranscriptionResult {
  text: string;
  speakers?: { speaker: string; text: string }[];
}

@Injectable()
export class AssemblyAiService {
  private readonly logger = new Logger(AssemblyAiService.name);
  private apiKey: string;
  private readonly http: AxiosInstance;
  // Прокси для egress к api.assemblyai.com — РКН блокирует прямой путь
  // с РФ-хостинга (как с api.replicate.com). Переиспользуем TELEGRAM_PROXY.
  private readonly proxyAgent: HttpsProxyAgent<string> | undefined;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ASSEMBLYAI_API_KEY');
    if (!this.apiKey) {
      this.logger.warn('ASSEMBLYAI_API_KEY is not set. Transcription features will not work.');
    }

    const proxyUrl = (
      this.configService.get<string>('ASSEMBLYAI_PROXY') ||
      this.configService.get<string>('TELEGRAM_PROXY') ||
      this.configService.get<string>('HTTPS_PROXY') ||
      this.configService.get<string>('https_proxy') ||
      this.configService.get<string>('ALL_PROXY') ||
      ''
    ).trim();
    if (proxyUrl) {
      try {
        this.proxyAgent = new HttpsProxyAgent(proxyUrl);
        const u = new URL(proxyUrl);
        this.logger.log(
          `Routing AssemblyAI egress через прокси: ${u.protocol}//${u.host} (auth: ${u.username ? 'yes' : 'no'})`,
        );
      } catch (e) {
        this.logger.error(`Failed to init proxy agent for "${proxyUrl}": ${(e as Error).message}`);
      }
    }

    this.http = axios.create({
      baseURL: 'https://api.assemblyai.com/v2',
      headers: {
        authorization: this.apiKey,
        'content-type': 'application/json',
      },
      timeout: 180000,
      ...(this.proxyAgent
        ? { httpsAgent: this.proxyAgent, proxy: false }
        : {}),
    });
  }

  async transcribeFile(fileUrl: string): Promise<string> {
    if (!this.apiKey) {
      throw new HttpException(
        'ASSEMBLYAI_API_KEY is not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      this.logger.log(`Starting transcription for URL: ${fileUrl}`);

      const submitResponse = await this.http.post('/transcript', {
        audio_url: fileUrl,
        speaker_labels: true,
        language_code: 'ru',
      });

      const transcriptId = submitResponse.data.id;
      this.logger.log(`Transcription job submitted. ID: ${transcriptId}`);

      return await this.pollTranscription(transcriptId);
    } catch (error: any) {
      const apiError = error.response?.data?.error;
      const code = error.code; // ENOTFOUND / ECONNRESET / ETIMEDOUT / ECONNREFUSED
      const status = error.response?.status;
      const detail = apiError || code || error.message || 'unknown network error';
      this.logger.error(
        `Transcription failed: ${detail} (status=${status ?? 'n/a'}, code=${code ?? 'n/a'})`,
        error.response?.data ?? error.stack,
      );
      throw new HttpException(
        `Transcription failed: ${detail}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async pollTranscription(transcriptId: string): Promise<string> {
    const pollingInterval = 3000;
    const maxAttempts = 300;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, pollingInterval));

      const response = await this.http.get(`/transcript/${transcriptId}`);

      const status = response.data.status;

      if (status === 'completed') {
        this.logger.log(`Transcription ${transcriptId} completed`);
        return this.formatTranscript(response.data);
      } else if (status === 'error') {
        throw new Error(`Transcription failed: ${response.data.error}`);
      }
    }

    throw new Error('Transcription timed out');
  }

  private formatTranscript(data: any): string {
    if (data.utterances && data.utterances.length > 0) {
      return data.utterances.map((u: any) => `Speaker ${u.speaker}: ${u.text}`).join('\n\n');
    }

    return data.text || '';
  }
}
