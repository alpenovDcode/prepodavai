import { Processor, WorkerHost, OnWorkerEvent, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GenerationHelpersService } from '../generation-helpers.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

export interface ReplicatePresentationJobData {
    generationRequestId: string;
    inputText: string;
    numCards: number; // Number of slides
}

interface Slide {
    title: string;
    content: string; // Bullet points or text
    imagePrompt: string; // Prompt for generating the image
    imageUrl?: string; // Filled later
}

interface PresentationStructure {
    title: string;
    slides: Slide[];
}

@Processor('replicate-presentation')
export class ReplicatePresentationProcessor extends WorkerHost {
    private readonly logger = new Logger(ReplicatePresentationProcessor.name);
    private readonly replicateToken: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly generationHelpers: GenerationHelpersService,
        private readonly prisma: PrismaService,
        @InjectQueue('replicate-presentation') private readonly presentationQueue: Queue,
    ) {
        super();
        this.replicateToken = this.configService.get<string>('REPLICATE_API_TOKEN');
        if (!this.replicateToken) {
            this.logger.warn('REPLICATE_API_TOKEN is not configured. Replicate presentation generation will not work.');
        }
    }

    async process(job: Job<ReplicatePresentationJobData>): Promise<void> {
        const { generationRequestId, inputText, numCards } = job.data;
        this.logger.log(`Processing Replicate presentation generation for request ${generationRequestId}`);

        try {
            // 1. Generate text content using Replicate (Claude 3.5 Sonnet)
            const presentationData = await this.generatePresentationContent(inputText, numCards);
            this.logger.log(`Generated presentation structure: ${JSON.stringify(presentationData, null, 2)}`);

            // 2. Generate images for each slide (Replicate Nano Banana)
            // We start all image generations in parallel if possible, or wait for them sequentially
            // For simplicity and stability, let's do `Promise.all` with concurrency control if needed, but for < 10 slides, parallel is fine.
            const slidesWithImages = await Promise.all(
                presentationData.slides.map(async (slide) => {
                    if (slide.imagePrompt) {
                        try {
                            const imageUrl = await this.generateImage(slide.imagePrompt);
                            return { ...slide, imageUrl };
                        } catch (imgError) {
                            this.logger.error(`Failed to generate image for slide "${slide.title}": ${imgError.message}`);
                            return { ...slide, imageUrl: null }; // Continue without image on error
                        }
                    }
                    return slide;
                })
            );

            const finalPresentation = {
                ...presentationData,
                slides: slidesWithImages,
            };

            this.logger.log(`Final presentation data: ${JSON.stringify(finalPresentation, null, 2)}`);

            // 3. Save result and complete generation
            const outputData = {
                provider: 'Replicate',
                mode: 'presentation',
                presentation: finalPresentation, // Save full JSON structure
                inputText,
                completedAt: new Date().toISOString(),
            };

            await this.generationHelpers.completeGeneration(generationRequestId, outputData);
            this.logger.log(`Generation request ${generationRequestId} completed successfully`);

        } catch (error: any) {
            this.logger.error(`Replicate presentation generation failed: ${error.message}`, error.stack);
            await this.generationHelpers.failGeneration(
                generationRequestId,
                error.message || 'Replicate presentation generation failed',
            );
            throw error;
        }
    }

    private async generatePresentationContent(inputText: string, numCards: number): Promise<PresentationStructure> {
        const prompt = `
You are an expert presentation creator. Create a presentation structure based on the following topic/text: "${inputText}".
The presentation should have exactly ${numCards} slides.

Output ONLY valid JSON in the following format, without any markdown formatting or extra text:
{
  "title": "Presentation Main Title",
  "slides": [
    {
      "title": "Slide Title",
      "content": "Key bullet points or concise text for the slide body.",
      "imagePrompt": "A detailed, descriptive prompt for an AI image generator to create a relevant illustration for this slide."
    }
  ]
}
`;
        // Replicate API call for text generation
        // Model: anthropic/claude-3.5-sonnet using the prediction API with 'stream: false' typically, or just waiting.
        // Since we need to wait for completion, we might need a simple polling helper or check if 'stream: false' waits (it usually returns immediately with an id).
        // For Replicate "predictions", we usually create a prediction and then poll for it.
        // However, for simplicity here, I'll implement a basic create-and-poll loop.

        const prediction = await this.runReplicatePrediction('anthropic/claude-3.5-sonnet', {
            prompt: prompt,
            max_tokens: 2000,
            system_prompt: "You are a helpful assistant that outputs only JSON.",
        });

        // The output from Claude on Replicate is usually an array of strings (parts of stream) or a joined string.
        // We need to join it if it's an array.
        let rawOutput = "";
        if (Array.isArray(prediction.output)) {
            rawOutput = prediction.output.join('');
        } else if (typeof prediction.output === 'string') {
            rawOutput = prediction.output;
        }

        // Clean up markdown blocks if present
        rawOutput = rawOutput.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            return JSON.parse(rawOutput) as PresentationStructure;
        } catch (e) {
            this.logger.error(`Failed to parse Claude output: ${rawOutput}`);
            throw new Error("Failed to parse generated presentation JSON");
        }
    }


    private async generateImage(imagePrompt: string): Promise<string> {
        // Model: google/nano-banana (as requested by user originally? or was it just valid for the previous example?)
        // Task description said "Картинки в презентации генерируй через https://api.replicate.com/v1/models/google/nano-banana/predictions"

        // Wait, 'google/nano-banana' sounds like a very specific model or maybe the user meant something else?
        // Let's assume the user knows what they are talking about or meant a Stable Diffusion variant. 
        // If 'google/nano-banana' is just an example URL or a misunderstanding, I might want to use a standard fast model like 'stability-ai/sdxl' or 'black-forest-labs/flux-schnell'.
        // BUT, I must follow USER instructions. The user provided this URL: https://api.replicate.com/v1/models/google/nano-banana/predictions
        // Wait, "google/nano-banana" does not sound like a real public Replicate model. It might be a user's private model or a typo.
        // However, I will try to use exactly what is requested or fall back to a standard one if it fails?
        // Actually, looking at the user prompt: "Картинки в презентации генерируй через https://api.replicate.com/v1/models/google/nano-banana/predictions"
        // I will use 'google/nano-banana' as the model string.

        const prediction = await this.runReplicatePrediction('google/nano-banana', {
            prompt: imagePrompt,
            num_inference_steps: 20, // Reasonable default
        });

        // Replicate image output is usually an array of URLs
        if (Array.isArray(prediction.output) && prediction.output.length > 0) {
            return prediction.output[0];
        }
        if (typeof prediction.output === 'string') {
            return prediction.output;
        }

        throw new Error("No image URL in output");
    }


    private async runReplicatePrediction(model: string, input: any): Promise<any> {
        const response = await axios.post(
            `https://api.replicate.com/v1/models/${model}/predictions`, // This might fail if model needs version, but usually /models/owner/name/predictions works for latest version
            // Verify if we need 'versions' instead. Replicate API usually supports /predictions with 'version' in body OR /models/.../predictions for latest.
            // Let's stick to the URL structure requested by user if possible, or the standard one.
            // User URL: https://api.replicate.com/v1/models/google/nano-banana/predictions
            // This implies using the owner/name format.
            {
                input: input,
            },
            {
                headers: {
                    Authorization: `Bearer ${this.replicateToken}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'wait', // Request to wait for completion if short
                },
            }
        );

        let prediction = response.data;

        // If not completed (Prefer: wait might return uncompleted if it takes too long), we need to poll
        if (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled') {
            prediction = await this.pollPrediction(prediction.id);
        }

        if (prediction.status === 'failed' || prediction.status === 'canceled') {
            throw new Error(`Replicate prediction failed: ${prediction.error}`);
        }

        return prediction;
    }

    private async pollPrediction(predictionId: string): Promise<any> {
        const maxAttempts = 60; // 120s timeout
        const delayMs = 2000;

        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, delayMs));

            const response = await axios.get(
                `https://api.replicate.com/v1/predictions/${predictionId}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.replicateToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            const prediction = response.data;
            if (prediction.status === 'succeeded' || prediction.status === 'failed' || prediction.status === 'canceled') {
                return prediction;
            }
        }
        throw new Error("Prediction timed out");
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job<ReplicatePresentationJobData>) {
        this.logger.log(`Replicate presentation job completed: ${job.id}`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<ReplicatePresentationJobData>, error: Error) {
        this.logger.error(`Replicate presentation job failed: ${job.id}, error: ${error.message}`);
    }
}
