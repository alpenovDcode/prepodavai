
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface TranscriptionResult {
    text: string;
    speakers?: { speaker: string; text: string }[];
}

@Injectable()
export class AssemblyAiService {
    private readonly logger = new Logger(AssemblyAiService.name);
    private readonly apiUrl = 'https://api.assemblyai.com/v2';
    private apiKey: string;

    constructor(private readonly configService: ConfigService) {
        this.apiKey = this.configService.get<string>('ASSEMBLYAI_API_KEY');
        if (!this.apiKey) {
            this.logger.warn('ASSEMBLYAI_API_KEY is not set. Transcription features will not work.');
        }
    }

    async transcribeFile(fileUrl: string): Promise<string> {
        if (!this.apiKey) {
            throw new HttpException('ASSEMBLYAI_API_KEY is not configured', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        try {
            this.logger.log(`Starting transcription for URL: ${fileUrl}`);

            // 1. Submit transcription job
            const submitResponse = await axios.post(
                `${this.apiUrl}/transcript`,
                {
                    audio_url: fileUrl,
                    speaker_labels: true,
                    language_code: 'ru', // Defaulting to Russian as per context
                },
                {
                    headers: {
                        authorization: this.apiKey,
                        'content-type': 'application/json',
                    },
                }
            );

            const transcriptId = submitResponse.data.id;
            this.logger.log(`Transcription job submitted. ID: ${transcriptId}`);

            // 2. Poll for completion
            return await this.pollTranscription(transcriptId);

        } catch (error: any) {
            this.logger.error(`Transcription failed: ${error.message}`, error.response?.data);
            throw new HttpException(
                `Transcription failed: ${error.response?.data?.error || error.message}`,
                HttpStatus.BAD_GATEWAY
            );
        }
    }

    private async pollTranscription(transcriptId: string): Promise<string> {
        const pollingInterval = 3000; // 3 seconds
        const maxAttempts = 300; // ~15 minutes timeout

        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, pollingInterval));

            const response = await axios.get(
                `${this.apiUrl}/transcript/${transcriptId}`,
                {
                    headers: { authorization: this.apiKey }
                }
            );

            const status = response.data.status;

            if (status === 'completed') {
                this.logger.log(`Transcription ${transcriptId} completed`);
                return this.formatTranscript(response.data);
            } else if (status === 'error') {
                throw new Error(`Transcription failed: ${response.data.error}`);
            }

            // If 'queued' or 'processing', continue loop
        }

        throw new Error('Transcription timed out');
    }

    private formatTranscript(data: any): string {
        // If we have speaker diarization, use it
        if (data.utterances && data.utterances.length > 0) {
            return data.utterances
                .map((u: any) => `Speaker ${u.speaker}: ${u.text}`)
                .join('\n\n');
        }

        // Fallback to plain text
        return data.text || '';
    }
}
