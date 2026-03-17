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
                'Prefer': 'wait', // Wait for prediction to finish
            },
            timeout: 180000, // 180s timeout for large prompts
        });
    }

    /**
     * Generate streaming text via Replicate using google/gemini-3-flash.
     */
    async createTextStreamCompletion(systemPrompt: string, userPrompt: string, model: string = 'google/gemini-3-flash'): Promise<string> {
        if (!this.apiToken) {
            throw new Error('REPLICATE_API_TOKEN is not configured');
        }

        const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
        this.logger.debug(`Creating ${model} streaming completion, prompt length: ${fullPrompt.length}`);

        try {
            // Start prediction with stream: true
            const response = await axios.post(
                `https://api.replicate.com/v1/models/${model}/predictions`,
                {
                    stream: true,
                    input: {
                        prompt: fullPrompt,
                        max_tokens: 8192,
                        temperature: 0.7,
                    },
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 30000,
                }
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

            // Connect to stream URL and parse SSE
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
                                    } catch (e) {
                                    }
                                }
                            }
                        }
                    }
                });

                streamResponse.data.on('end', () => {
                    if (isRejected) return;
                    this.logger.debug(`Stream ended randomly or naturally. Collected ${fullText.length} chars.`);
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

    async createCompletion(prompt: string, systemPrompt?: string) {
        if (!this.apiToken) {
            throw new Error('REPLICATE_API_TOKEN is not configured');
        }

        this.logger.debug(`Creating completion with prompt: ${prompt.substring(0, 50)}...`);

        try {
            // Construct the input for google/gemini-3-flash
            // Note: The actual input schema depends on the specific model version on Replicate.
            // Assuming standard text generation input.
            const input = {
                prompt: prompt,
                system_prompt: systemPrompt || "You are a helpful AI assistant.",
                max_tokens: 2048,
                temperature: 0.7,
            };

            const response = await this.http.post(`/models/${this.defaultModel}/predictions`, {
                input,
            });

            this.logger.debug('Replicate response received');

            // Replicate returns the prediction object. 
            // If 'Prefer: wait' is used, it might return the completed prediction.
            // Otherwise, we might need to poll. 
            // For this implementation, we assume 'Prefer: wait' works or we handle the response.

            const prediction = response.data;

            if (prediction.status === 'succeeded' && prediction.output) {
                // Output is usually an array of strings or a single string depending on the model
                const text = Array.isArray(prediction.output) ? prediction.output.join('') : prediction.output;
                return text;
            } else if (prediction.status === 'starting' || prediction.status === 'processing') {
                // If it didn't finish in time (despite Prefer: wait), we might need to poll.
                // For simplicity in this first pass, we'll log a warning. 
                // A more robust implementation would poll `prediction.urls.get`.
                this.logger.warn(`Prediction status is ${prediction.status}. Polling might be required.`);
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

    async createImage(prompt: string, model: string = 'black-forest-labs/flux-schnell', aspect_ratio: string = '16:9') {
        if (!this.apiToken) {
            throw new Error('REPLICATE_API_TOKEN is not configured');
        }

        this.logger.debug(`Creating image with model ${model}, prompt: ${prompt.substring(0, 50)}...`);

        try {
            const input: any = {
                prompt: prompt,
                aspect_ratio: aspect_ratio,
            };

            // Standard params for Flux
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
                throw new Error(`Replicate image prediction failed: ${prediction.error || prediction.status || 'Failed to generate image'}`);
            }

        } catch (error) {
            this.logger.error(`Replicate API error (image) for ${model}: ${error.message}`, error.response?.data);
            throw error;
        }
    }

    private extractOutput(output: any): string {
        const out = Array.isArray(output) ? output[0] : output;
        // FileOutput objects have a .url property, plain strings are URLs directly
        return (typeof out === 'object' && out !== null && 'url' in out) ? (out as any).url : out;
    }


    private async pollPrediction(url: string, maxAttempts = 30, interval = 1000): Promise<string> {
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, interval));
            try {
                // We need to use a separate axios call because the URL is absolute
                const response = await axios.get(url, {
                    headers: {
                        Authorization: `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/json',
                    }
                });

                const prediction = response.data;
                if (prediction.status === 'succeeded') {
                    return this.extractOutput(prediction.output);
                } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
                    throw new Error(`Prediction ${prediction.status}: ${prediction.error}`);
                }
                // If still processing/starting, continue loop
            } catch (error) {
                this.logger.error(`Polling error: ${error.message}`);
                throw error;
            }
        }
        throw new Error('Prediction timed out');
    }
}
