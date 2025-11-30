import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GigachatService } from './gigachat.service';
import { GigachatGenerationDto, GigachatMode } from './dto/gigachat-generation.dto';
import { GenerationHelpersService } from '../generations/generation-helpers.service';
import { SubscriptionsService, OperationType } from '../subscriptions/subscriptions.service';
import { FilesService } from '../files/files.service';

@Injectable()
export class GigachatGenerationsService {
  private readonly logger = new Logger(GigachatGenerationsService.name);

  private readonly modeToOperation: Record<GigachatMode, OperationType> = {
    chat: 'gigachat_text',
    image: 'gigachat_image',
    embeddings: 'gigachat_embeddings',
    tokens_count: 'gigachat_tokens_count',
  };

  constructor(
    private readonly gigachatService: GigachatService,
    private readonly generationHelpers: GenerationHelpersService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly filesService: FilesService,
  ) { }

  async generate(userId: string, dto: GigachatGenerationDto) {
    this.logger.log(`Starting GigaChat generation: userId=${userId}, mode=${dto.mode}, model=${dto.model}`);

    if (dto.mode === 'image' && !dto.prompt) {
      throw new BadRequestException('Поле "prompt" обязательно для генерации изображений');
    }
    if (dto.mode === 'chat' && !dto.userPrompt) {
      throw new BadRequestException('Поле "userPrompt" обязательно для текстовой генерации');
    }

    const operationType = this.modeToOperation[dto.mode] || 'gigachat_text';
    this.logger.log(`Checking credits: operationType=${operationType}`);

    const creditCheck = await this.subscriptionsService.checkAndDebitCredits(userId, operationType);

    if (!creditCheck.success) {
      this.logger.warn(`Insufficient credits: userId=${userId}, operationType=${operationType}`);
      throw new BadRequestException(creditCheck.error || 'Недостаточно кредитов');
    }

    const model = dto.model || this.gigachatService.getDefaultModel(dto.mode);
    this.logger.log(`Creating generation record: model=${model}`);

    const { generationRequest } = await this.generationHelpers.createGeneration({
      userId,
      generationType: `gigachat-${dto.mode}`,
      inputParams: dto,
      model,
    });

    try {
      this.logger.log(`Dispatching to GigaChat API: mode=${dto.mode}, model=${model}`);
      const rawResult = await this.dispatch(dto, model);
      this.logger.log(`GigaChat API response received, normalizing result`);

      const normalized = await this.normalizeResult(dto, model, rawResult);

      await this.generationHelpers.completeGeneration(generationRequest.id, normalized);
      this.logger.log(`Generation completed successfully: requestId=${generationRequest.id}`);

      return {
        success: true,
        requestId: generationRequest.id,
        status: 'completed',
      };
    } catch (error: any) {
      this.logger.error(`GigaChat generation failed: ${error?.message || error}`, error?.stack);

      await this.generationHelpers.failGeneration(
        generationRequest.id,
        error?.message || 'Ошибка интеграции с GigaChat',
      );

      const errorMessage = error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Ошибка интеграции с GigaChat';

      throw new BadRequestException(errorMessage);
    }
  }

  private async dispatch(dto: GigachatGenerationDto, model: string) {
    switch (dto.mode) {
      case 'chat': {
        const messages = [];
        if (dto.systemPrompt) {
          messages.push({ role: 'system', content: dto.systemPrompt });
        }
        messages.push({ role: 'user', content: dto.userPrompt });

        return this.gigachatService.createChatCompletion({
          model,
          messages,
          temperature: dto.temperature ?? 0.8,
          top_p: dto.topP ?? 0.9,
          max_tokens: dto.maxTokens ?? 1024,
        });
      }
      case 'image': {
        return this.gigachatService.createImage({
          model,
          prompt: dto.prompt,
          negative_prompt: dto.negativePrompt,
          size: dto.size || '1024x1024',
          quality: dto.quality || 'high',
        });
      }
      // case 'embeddings': {
      //   return this.gigachatService.createEmbeddings({
      //     model,
      //     input: dto.inputTexts || [],
      //   });
      // }
      case 'tokens_count': {
        return this.gigachatService.countTokens({
          model,
          input: [dto.text],
        });
      }
      default:
        throw new BadRequestException(`Неизвестный режим GigaChat: ${dto.mode}`);
    }
  }

  private async normalizeResult(dto: GigachatGenerationDto, model: string, rawResult: any) {
    const base = {
      provider: 'GigaChat',
      mode: dto.mode,
      model,
      completedAt: new Date().toISOString(),
    };

    switch (dto.mode) {
      case 'chat': {
        return {
          ...base,
          content: this.extractTextFromChat(rawResult),
          usage: rawResult?.usage,
          raw: rawResult,
        };
      }
      case 'image': {
        const urls = this.extractImages(rawResult);
        return {
          ...base,
          imageUrl: urls[0],
          imageUrls: urls,
          raw: rawResult,
        };
      }
      case 'embeddings': {
        const embedding = rawResult?.data?.[0]?.embedding || [];
        return {
          ...base,
          embedding,
          dimensions: embedding.length,
          raw: rawResult,
        };
      }
      default:
        return {
          ...base,
          raw: rawResult,
        };
    }
  }

  private extractTextFromChat(raw: any): string {
    if (!raw) {
      return '';
    }
    if (typeof raw === 'string') {
      return raw;
    }
    if (Array.isArray(raw?.choices)) {
      return raw.choices
        .map((choice: any) => choice?.message?.content || '')
        .filter(Boolean)
        .join('\n\n')
        .trim();
    }
    return raw?.message?.content || JSON.stringify(raw);
  }

  private extractImages(raw: any): string[] {
    if (!raw?.data) {
      return [];
    }

    return raw.data
      .map((item: any) => {
        if (item?.url) {
          return item.url;
        }
        if (item?.b64_json) {
          return this.bufferToDataUrl(
            Buffer.from(item.b64_json, 'base64'),
            item.mime_type || 'image/png',
          );
        }
        return null;
      })
      .filter(Boolean);
  }

  private extractTranscription(raw: any): string {
    if (!raw) {
      return '';
    }

    if (typeof raw === 'string') {
      return raw;
    }

    return raw?.text || raw?.result || raw?.data?.text || JSON.stringify(raw);
  }

  private bufferToDataUrl(buffer?: Buffer, mimeType = 'application/octet-stream'): string | null {
    if (!buffer) {
      return null;
    }

    const base64 = Buffer.isBuffer(buffer)
      ? buffer.toString('base64')
      : Buffer.from(buffer).toString('base64');
    return `data:${mimeType};base64,${base64}`;
  }
}
