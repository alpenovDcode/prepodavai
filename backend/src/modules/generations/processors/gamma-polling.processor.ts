import { Processor, WorkerHost, OnWorkerEvent, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { GammaService } from '../../gamma/gamma.service';
import { GenerationHelpersService } from '../generation-helpers.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface GammaPollingJobData {
    generationRequestId: string;
    gammaGenerationId: string;
    attempt: number;
}

@Processor('gamma-polling')
export class GammaPollingProcessor extends WorkerHost {
    private readonly logger = new Logger(GammaPollingProcessor.name);
    private readonly MAX_ATTEMPTS = 120; // 120 attempts * 5 seconds = 10 minutes max
    private readonly POLL_INTERVAL_MS = 5000; // 5 seconds

    constructor(
        private readonly gammaService: GammaService,
        private readonly generationHelpers: GenerationHelpersService,
        private readonly prisma: PrismaService,
        @InjectQueue('gamma-polling') private readonly pollingQueue: Queue,
    ) {
        super();
    }

    async process(job: Job<GammaPollingJobData>): Promise<void> {
        const { generationRequestId, gammaGenerationId, attempt } = job.data;

        this.logger.log(
            `Polling Gamma status for generation ${gammaGenerationId} (attempt ${attempt}/${this.MAX_ATTEMPTS})`,
        );

        try {
            // Check generation status from Gamma API
            const status = await this.gammaService.getGenerationStatus(gammaGenerationId);

            this.logger.log(`Gamma status: ${status.status}`);

            if (status.status === 'completed') {
                // Generation completed successfully
                this.logger.log(`Gamma generation completed: ${gammaGenerationId}`);

                // Fetch generation request to get inputText
                const generationRequest = await this.prisma.generationRequest.findUnique({
                    where: { id: generationRequestId },
                });

                const inputText = (generationRequest?.params as any)?.['inputText'] || '';

                const outputData = {
                    provider: 'Gamma AI',
                    mode: 'presentation',
                    gammaUrl: status.gammaUrl,
                    pdfUrl: status.pdfUrl,
                    pptxUrl: status.pptxUrl,
                    exportUrl: status.exportUrl, // Direct download link for file
                    inputText, // Add inputText for Telegram caption
                    gammaGenerationId,
                    type: 'presentation',
                    completedAt: new Date().toISOString(),
                };

                await this.generationHelpers.completeGeneration(generationRequestId, outputData);

                this.logger.log(`Generation request ${generationRequestId} marked as completed`);
                return; // Job completed successfully
            } else if (status.status === 'failed') {
                // Generation failed
                this.logger.error(`Gamma generation failed: ${gammaGenerationId}, error: ${status.error}`);

                await this.generationHelpers.failGeneration(
                    generationRequestId,
                    status.error || 'Gamma generation failed',
                );

                throw new Error(status.error || 'Gamma generation failed');
            } else if (status.status === 'pending' || status.status === 'processing') {
                // Still processing, schedule next poll
                if (attempt >= this.MAX_ATTEMPTS) {
                    this.logger.error(
                        `Gamma generation ${gammaGenerationId} exceeded max polling attempts (${this.MAX_ATTEMPTS})`,
                    );

                    await this.generationHelpers.failGeneration(
                        generationRequestId,
                        'Generation timeout: exceeded maximum polling attempts',
                    );

                    throw new Error('Generation timeout');
                }

                // Add new job to queue for next poll attempt
                await this.pollingQueue.add(
                    'poll-gamma-status',
                    {
                        generationRequestId,
                        gammaGenerationId,
                        attempt: attempt + 1,
                    },
                    {
                        delay: this.POLL_INTERVAL_MS,
                        attempts: 1,
                        removeOnComplete: true,
                        removeOnFail: false,
                    },
                );

                this.logger.log(
                    `Gamma generation still ${status.status}, scheduled next check in ${this.POLL_INTERVAL_MS / 1000}s`,
                );

                // Current job completes successfully, next poll is a new job
                return;
            } else {
                // Unknown status
                this.logger.warn(`Unknown Gamma status: ${status.status}`);

                if (attempt >= this.MAX_ATTEMPTS) {
                    await this.generationHelpers.failGeneration(
                        generationRequestId,
                        `Unknown status: ${status.status}`,
                    );
                    throw new Error(`Unknown status: ${status.status}`);
                }

                // Retry with new job
                await this.pollingQueue.add(
                    'poll-gamma-status',
                    {
                        generationRequestId,
                        gammaGenerationId,
                        attempt: attempt + 1,
                    },
                    {
                        delay: this.POLL_INTERVAL_MS,
                        attempts: 1,
                        removeOnComplete: true,
                        removeOnFail: false,
                    },
                );

                return;
            }
        } catch (error: any) {
            this.logger.error(`Error polling Gamma status: ${error.message}`, error.stack);

            // If it's a network error or API error, retry with new job
            if (attempt < this.MAX_ATTEMPTS && !error.message.includes('Generation timeout')) {
                await this.pollingQueue.add(
                    'poll-gamma-status',
                    {
                        generationRequestId,
                        gammaGenerationId,
                        attempt: attempt + 1,
                    },
                    {
                        delay: this.POLL_INTERVAL_MS,
                        attempts: 1,
                        removeOnComplete: true,
                        removeOnFail: false,
                    },
                );

                this.logger.log(`Will retry polling in ${this.POLL_INTERVAL_MS / 1000}s`);
                return; // Current job completes, retry is a new job
            } else {
                // Max attempts reached or fatal error
                await this.generationHelpers.failGeneration(
                    generationRequestId,
                    error.message || 'Failed to poll Gamma status',
                );

                throw error;
            }
        }
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<GammaPollingJobData>) {
        this.logger.log(`Gamma polling job completed for generation ${job.data.gammaGenerationId}`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<GammaPollingJobData>, error: Error) {
        this.logger.error(
            `Gamma polling job failed for generation ${job.data.gammaGenerationId}: ${error.message}`,
        );
    }
}
