import { Controller, Post, Body, Logger } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { HtmlPostprocessorService } from '../../common/services/html-postprocessor.service';

/**
 * Controller for handling Replicate API webhook callbacks.
 * Downloads generated images and saves them locally so they persist
 * beyond Replicate's 30-minute URL expiry.
 */
@Controller('webhooks')
export class ReplicateCallbackController {
  private readonly logger = new Logger(ReplicateCallbackController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly htmlPostprocessor: HtmlPostprocessorService,
  ) {}

  @Post('replicate-callback')
  async handleReplicateCallback(@Body() body: any) {
    this.logger.log(`Received Replicate callback: ${JSON.stringify(body)}`);

    try {
      const { id, status, output, error } = body;

      if (!id) {
        this.logger.error('Missing prediction ID in Replicate callback');
        return { success: false, error: 'Missing prediction ID' };
      }

      if (status === 'succeeded' && output) {
        // Find generation request by prediction ID
        const generationRequest = await (
          this.webhooksService['prisma'].generationRequest as any
        ).findFirst({
          where: {
            metadata: {
              path: ['replicatePredictionId'],
              equals: id,
            },
          },
        });

        if (!generationRequest) {
          this.logger.error(`Generation request not found for prediction ID: ${id}`);
          return { success: false, error: 'Generation request not found' };
        }

        const isImageGen =
          generationRequest.type === 'photosession' ||
          generationRequest.type === 'image' ||
          generationRequest.type === 'image_generation';

        if (isImageGen) {
          // Replicate returns output as a string URL, convert to array
          const replicateUrls = Array.isArray(output) ? output : [output];

          // Download each image and save locally via shared helper
          const localUrls: string[] = [];
          for (const url of replicateUrls) {
            try {
              const saved = await this.webhooksService.persistRemoteImage(
                url,
                generationRequest.userId,
              );
              localUrls.push(saved);
              this.logger.log(`Saved image locally: ${saved}`);
            } catch (err: any) {
              this.logger.error(`Failed to save image locally, using original URL: ${err.message}`);
              localUrls.push(url); // Fallback to original URL
            }
          }

          // Complete generation with local URLs
          const outputData = {
            imageUrls: localUrls,
            imageUrl: localUrls[0],
            type: generationRequest.type,
            provider: 'Replicate',
            predictionId: id,
            completedAt: new Date().toISOString(),
          };

          await this.webhooksService['generationHelpers'].completeGeneration(
            generationRequest.id,
            outputData,
          );

          this.logger.log(
            `${generationRequest.type} completed successfully: ${generationRequest.id}`,
          );
        } else {
          // Text generation through Replicate
          const content = Array.isArray(output) ? output.join('') : output;

          this.logger.log(`Starting HTML postprocessing for ${generationRequest.type}`);
          const processedContent = this.htmlPostprocessor.process(content);

          const metadata = (generationRequest.metadata as Record<string, any>) || {};

          const outputData = {
            provider: 'Replicate (Claude)',
            mode: 'chat',
            model: metadata.model || 'google/gemini-3-flash',
            content: processedContent,
            predictionId: id,
            completedAt: new Date().toISOString(),
          };

          await this.webhooksService['generationHelpers'].completeGeneration(
            generationRequest.id,
            outputData,
          );

          this.logger.log(
            `Text generation ${generationRequest.type} completed successfully: ${generationRequest.id}`,
          );
        }

        return { success: true, message: 'Callback processed successfully' };
      } else if (status === 'failed' || error) {
        // Find generation request by prediction ID
        const generationRequest = await (
          this.webhooksService['prisma'].generationRequest as any
        ).findFirst({
          where: {
            metadata: {
              path: ['replicatePredictionId'],
              equals: id,
            },
          },
        });

        if (generationRequest) {
          const errorMsg = error || 'Replicate prediction failed';
          await this.webhooksService['generationHelpers'].failGeneration(
            generationRequest.id,
            errorMsg,
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
