import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class ReplicateService {
  private readonly logger = new Logger(ReplicateService.name);
  private readonly apiToken: string;
  private readonly http: AxiosInstance;
  private readonly defaultModel = 'google/gemini-3-flash';

  constructor(private readonly configService: ConfigService) {
    this.apiToken = this.configService.get<string>('REPLICATE_API_TOKEN');

    if (!this.apiToken) {
      this.logger.warn('REPLICATE_API_TOKEN is not set. Replicate integration will not work.');
    }

    this.http = axios.create({
      baseURL: 'https://api.replicate.com/v1',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      timeout: 180000,
    });
  }

  /**
   * Generate streaming text via Replicate.
   */
  async createTextStreamCompletion(
    systemPrompt: string,
    userPrompt: string,
    model: string = 'google/gemini-3-flash',
  ): Promise<string> {
    if (!this.apiToken) {
      throw new Error('REPLICATE_API_TOKEN is not configured');
    }

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    this.logger.debug(
      `Creating ${model} streaming completion, prompt length: ${fullPrompt.length}`,
    );

    try {
      const response = await axios.post(
        `https://api.replicate.com/v1/models/${model}/predictions`,
        {
          stream: true,
          input: {
            prompt: fullPrompt,
            max_new_tokens: 16384,
            temperature: 0.7,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      const prediction = response.data;
      this.logger.debug(`Prediction started: id=${prediction.id}, status=${prediction.status}`);

      if (prediction.status === 'failed') {
        throw new Error(`Replicate prediction failed: ${prediction.error}`);
      }

      const streamUrl = prediction.urls?.stream;
      if (!streamUrl) {
        throw new Error('No stream URL returned from Replicate');
      }

      this.logger.debug(`Connecting to stream URL: ${streamUrl}`);
      const streamResponse = await axios.get(streamUrl, {
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-store',
        },
        responseType: 'stream',
      });

      return await new Promise((resolve, reject) => {
        let fullText = '';
        let currentEvent = 'message';
        let isRejected = false;

        streamResponse.data.on('data', (chunk: Buffer) => {
          if (isRejected) return;
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (currentEvent === 'error') {
                isRejected = true;
                reject(new Error(`Replicate stream error: ${data}`));
                return;
              } else if (currentEvent === 'done') {
                resolve(fullText);
                return;
              } else if (currentEvent === 'output' || currentEvent === 'message') {
                if (data !== '[DONE]') {
                  try {
                    fullText += data;
                  } catch (e) {}
                }
              }
            }
          }
        });

        streamResponse.data.on('end', () => {
          if (isRejected) return;
          this.logger.debug(`Stream ended. Collected ${fullText.length} chars.`);
          if (fullText.trim() === '' || fullText.includes('Provider returned error')) {
            reject(new Error('Stream ended without valid data'));
          } else {
            resolve(fullText);
          }
        });

        streamResponse.data.on('error', (err: any) => {
          if (isRejected) return;
          this.logger.error(`Stream error: ${err.message}`);
          isRejected = true;
          reject(err);
        });
      });
    } catch (error) {
      this.logger.error(`Error in ${model}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate text completion via Replicate (synchronous, with Prefer: wait).
   *
   * @param prompt - The user/combined prompt text
   * @param model - The model to use (e.g. 'google/gemini-3-flash')
   * @param options - Optional overrides for max_tokens, temperature
   */
  async createCompletion(
    prompt: string,
    model?: string,
    options?: { max_tokens?: number; temperature?: number },
  ): Promise<string> {
    if (!this.apiToken) {
      throw new Error('REPLICATE_API_TOKEN is not configured');
    }

    const targetModel = model || this.defaultModel;
    const maxTokens = options?.max_tokens ?? 16384;
    const temperature = options?.temperature ?? 0.7;

    this.logger.debug(
      `Creating completion with model: ${targetModel}, prompt length: ${prompt.length}, max_tokens: ${maxTokens}`,
    );

    try {
      // Gemini Flash on Replicate does NOT support a separate system_prompt field.
      // Everything goes into `prompt`. The caller is responsible for combining
      // system + user prompts before passing them here.
      const input: Record<string, any> = {
        prompt,
        max_new_tokens: maxTokens,
        temperature,
      };

      const response = await this.http.post(`/models/${targetModel}/predictions`, {
        input,
      });

      this.logger.debug('Replicate response received');

      const prediction = response.data;

      if (prediction.status === 'succeeded' && prediction.output) {
        const text = Array.isArray(prediction.output)
          ? prediction.output.join('')
          : prediction.output;
        return text;
      } else if (prediction.status === 'starting' || prediction.status === 'processing') {
        this.logger.warn(`Prediction status is ${prediction.status}. Polling...`);
        return this.pollPrediction(prediction.urls.get);
      } else {
        this.logger.error(`Prediction failed or invalid status: ${prediction.status}`);
        throw new Error(`Replicate prediction failed: ${prediction.error || prediction.status}`);
      }
    } catch (error) {
      this.logger.error(`Replicate API error: ${error.message}`, error.response?.data);
      throw error;
    }
  }

  async createImage(
    prompt: string,
    model: string = 'black-forest-labs/flux-schnell',
    aspect_ratio: string = '16:9',
  ) {
    if (!this.apiToken) {
      throw new Error('REPLICATE_API_TOKEN is not configured');
    }

    this.logger.debug(`Creating image with model ${model}, prompt: ${prompt.substring(0, 50)}...`);

    try {
      const input: any = {
        prompt: prompt,
        aspect_ratio: aspect_ratio,
      };

      if (model.includes('flux')) {
        input.num_outputs = 1;
        input.output_format = 'jpg';
        input.output_quality = 80;
      }

      const response = await this.http.post(`/models/${model}/predictions`, {
        input,
      });

      const prediction = response.data;
      this.logger.debug(`Image prediction status: ${prediction.status}`);

      if (prediction.status === 'succeeded' && prediction.output) {
        return this.extractOutput(prediction.output);
      } else if (prediction.status === 'starting' || prediction.status === 'processing') {
        this.logger.warn(`Image prediction status is ${prediction.status}. Polling...`);
        return this.pollPrediction(prediction.urls.get);
      } else {
        throw new Error(
          `Replicate image prediction failed: ${prediction.error || prediction.status || 'Failed to generate image'}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Replicate API error (image) for ${model}: ${error.message}`,
        error.response?.data,
      );
      throw error;
    }
  }

  private extractOutput(output: any): string {
    const out = Array.isArray(output) ? output[0] : output;
    return typeof out === 'object' && out !== null && 'url' in out ? (out as any).url : out;
  }

  private async pollPrediction(url: string, maxAttempts = 30, interval = 1000): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, interval));
      try {
        const response = await axios.get(url, {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
        });

        const prediction = response.data;
        if (prediction.status === 'succeeded') {
          return this.extractOutput(prediction.output);
        } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
          throw new Error(`Prediction ${prediction.status}: ${prediction.error}`);
        }
      } catch (error) {
        this.logger.error(`Polling error: ${error.message}`);
        throw error;
      }
    }
    throw new Error('Prediction timed out');
  }
}
