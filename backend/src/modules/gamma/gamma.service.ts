import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface GammaGenerationRequest {
    inputText: string;
    textMode: 'generate' | 'condense' | 'preserve';
    format?: 'presentation' | 'document' | 'social' | 'webpage';
    numCards?: number;
    cardSplit?: 'auto' | 'inputTextBreaks';
    additionalInstructions?: string;
    themeId?: string;
    folderIds?: string[];
    exportAs?: 'pdf' | 'pptx';
    textOptions?: {
        amount?: 'low' | 'medium' | 'high';
        tone?: string;
        audience?: string;
        language?: string;
    };
    imageOptions?: {
        source?: 'aiGenerated' | 'noImages';
        model?: string;
        style?: string;
    };
}

export interface GammaGenerationResponse {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    gammaUrl?: string;
    pdfUrl?: string;
    pptxUrl?: string;
    error?: string;
}

@Injectable()
export class GammaService {
    private readonly logger = new Logger(GammaService.name);
    private readonly apiKey: string;
    private readonly baseUrl: string;

    constructor(private configService: ConfigService) {
        this.apiKey = this.configService.get<string>('GAMMA_API_KEY');
        this.baseUrl = this.configService.get<string>('GAMMA_API_BASE_URL', 'https://public-api.gamma.app/v1.0');

        if (!this.apiKey) {
            this.logger.warn('GAMMA_API_KEY is not configured. Gamma presentation generation will not work.');
        }
    }

    /**
     * Generate a presentation using Gamma API
     * This is an async operation - Gamma will call our webhook when complete
     */
    async generatePresentation(request: GammaGenerationRequest): Promise<GammaGenerationResponse> {
        if (!this.apiKey) {
            throw new BadRequestException('Gamma API key is not configured');
        }

        try {
            this.logger.log(`Sending presentation generation request to Gamma API`);
            this.logger.debug(`Request payload: ${JSON.stringify(request, null, 2)}`);

            const response = await axios.post(
                `${this.baseUrl}/generations`,
                request,
                {
                    headers: {
                        'X-API-KEY': this.apiKey,
                        'Content-Type': 'application/json',
                    },
                },
            );

            this.logger.log(`Gamma API response: ${JSON.stringify(response.data, null, 2)}`);

            // Gamma API returns a generation ID and status
            // The actual presentation URLs will come via webhook callback
            return {
                id: response.data.id || response.data.generationId,
                status: response.data.status || 'pending',
                gammaUrl: response.data.gammaUrl,
                pdfUrl: response.data.pdfUrl,
                pptxUrl: response.data.pptxUrl,
            };
        } catch (error: any) {
            this.logger.error(`Gamma API request failed: ${error.message}`, error.stack);

            if (error.response) {
                this.logger.error(`Gamma API error response: ${JSON.stringify(error.response.data, null, 2)}`);
                throw new BadRequestException(
                    `Gamma API error: ${error.response.data?.message || error.response.data?.error || error.message}`,
                );
            }

            throw new BadRequestException(`Failed to generate presentation: ${error.message}`);
        }
    }

    /**
     * Build a Gamma API request from input parameters
     */
    buildGenerationRequest(inputParams: Record<string, any>): GammaGenerationRequest {
        const {
            inputText,
            textMode = 'generate',
            numCards = 10,
            cardSplit = 'auto',
            additionalInstructions,
            themeId,
            exportAs,
        } = inputParams;

        if (!inputText) {
            throw new BadRequestException('inputText is required for presentation generation');
        }

        const request: GammaGenerationRequest = {
            inputText,
            textMode,
            format: 'presentation',
            numCards,
            cardSplit,
            textOptions: {
                language: 'ru', // Russian language for presentations
            },
        };

        if (additionalInstructions) {
            request.additionalInstructions = additionalInstructions;
        }

        if (themeId) {
            request.themeId = themeId;
        }

        if (exportAs) {
            request.exportAs = exportAs;
        }

        return request;
    }

    /**
     * Get generation status and file URLs from Gamma API
     * Poll this endpoint every ~5 seconds until status is 'completed' or 'failed'
     */
    async getGenerationStatus(generationId: string): Promise<GammaGenerationResponse> {
        if (!this.apiKey) {
            throw new BadRequestException('Gamma API key is not configured');
        }

        try {
            this.logger.log(`Checking Gamma generation status: ${generationId}`);

            const response = await axios.get(
                `${this.baseUrl}/generations/${generationId}`,
                {
                    headers: {
                        'X-API-KEY': this.apiKey,
                    },
                },
            );

            this.logger.log(`Gamma status response: ${JSON.stringify(response.data, null, 2)}`);

            return {
                id: generationId,
                status: response.data.status || 'pending',
                gammaUrl: response.data.gammaUrl,
                pdfUrl: response.data.pdfUrl,
                pptxUrl: response.data.pptxUrl,
                error: response.data.error,
            };
        } catch (error: any) {
            this.logger.error(`Gamma status check failed: ${error.message}`, error.stack);

            if (error.response) {
                this.logger.error(`Gamma API error response: ${JSON.stringify(error.response.data, null, 2)}`);

                // If generation failed, return failed status
                if (error.response.status === 404 || error.response.status === 400) {
                    return {
                        id: generationId,
                        status: 'failed',
                        error: error.response.data?.message || error.response.data?.error || 'Generation not found',
                    };
                }
            }

            throw new BadRequestException(`Failed to check generation status: ${error.message}`);
        }
    }
}
