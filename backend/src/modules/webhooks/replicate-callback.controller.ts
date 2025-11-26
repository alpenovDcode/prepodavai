import { Controller, Post, Body, Logger } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

/**
 * Controller for handling Replicate API webhook callbacks
 */
@Controller('webhooks')
export class ReplicateCallbackController {
    private readonly logger = new Logger(ReplicateCallbackController.name);

    constructor(private readonly webhooksService: WebhooksService) { }

    @Post('replicate-callback')
    async handleReplicateCallback(@Body() body: any) {
        this.logger.log(`Received Replicate callback: ${JSON.stringify(body)}`);

        try {
            const { id, status, output, error } = body;

            if (!id) {
                this.logger.error('Missing prediction ID in Replicate callback');
                return { success: false, error: 'Missing prediction ID' };
            }

            if (status === 'succeeded' && output && Array.isArray(output)) {
                // Find generation request by prediction ID
                const generationRequest = await this.webhooksService['prisma'].generationRequest.findFirst({
                    where: {
                        metadata: {
                            path: ['replicatePredictionId'],
                            equals: id
                        }
                    }
                });

                if (!generationRequest) {
                    this.logger.error(`Generation request not found for prediction ID: ${id}`);
                    return { success: false, error: 'Generation request not found' };
                }

                // Complete generation with output URLs
                const outputData = {
                    imageUrls: output,
                    imageUrl: output[0], // First image as primary
                    type: 'photosession',
                    provider: 'Replicate',
                    predictionId: id,
                    completedAt: new Date().toISOString(),
                };

                await this.webhooksService['generationHelpers'].completeGeneration(
                    generationRequest.id,
                    outputData
                );

                this.logger.log(`Photosession completed successfully: ${generationRequest.id}`);
                return { success: true, message: 'Callback processed successfully' };
            } else if (status === 'failed' || error) {
                // Find generation request by prediction ID
                const generationRequest = await this.webhooksService['prisma'].generationRequest.findFirst({
                    where: {
                        metadata: {
                            path: ['replicatePredictionId'],
                            equals: id
                        }
                    }
                });

                if (generationRequest) {
                    const errorMsg = error || 'Replicate prediction failed';
                    await this.webhooksService['generationHelpers'].failGeneration(
                        generationRequest.id,
                        errorMsg
                    );
                    this.logger.error(`Photosession failed: ${errorMsg}`);
                }

                return { success: false, error: error || 'Prediction failed' };
            }

            this.logger.warn(`Unhandled Replicate callback status: ${status}`);
            return { success: true, message: 'Status acknowledged' };
        } catch (err: any) {
            this.logger.error(`Error processing Replicate callback: ${err.message}`, err.stack);
            return { success: false, error: err.message };
        }
    }
}
