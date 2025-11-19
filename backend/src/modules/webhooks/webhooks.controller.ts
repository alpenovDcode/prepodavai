import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhookAuthGuard } from './guards/webhook-auth.guard';

/**
 * Контроллер для обработки callback'ов от n8n webhooks
 * Все генерации работают через асинхронные webhooks
 */
@Controller('webhooks')
@UseGuards(WebhookAuthGuard) // Защита всех webhook endpoints
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  // Callback для текстовых генераций
  @Post('worksheet-callback')
  async worksheetCallback(@Body() body: any) {
    return this.webhooksService.handleTextGenerationCallback('worksheet', body);
  }

  @Post('quiz-callback')
  async quizCallback(@Body() body: any) {
    return this.webhooksService.handleTextGenerationCallback('quiz', body);
  }

  @Post('vocabulary-callback')
  async vocabularyCallback(@Body() body: any) {
    return this.webhooksService.handleTextGenerationCallback('vocabulary', body);
  }

  @Post('lesson-plan-callback')
  async lessonPlanCallback(@Body() body: any) {
    return this.webhooksService.handleTextGenerationCallback('lesson-plan', body);
  }

  @Post('content-callback')
  async contentCallback(@Body() body: any) {
    return this.webhooksService.handleTextGenerationCallback('content-adaptation', body);
  }

  @Post('message-callback')
  async messageCallback(@Body() body: any) {
    return this.webhooksService.handleTextGenerationCallback('message', body);
  }

  @Post('feedback-callback')
  async feedbackCallback(@Body() body: any) {
    return this.webhooksService.handleTextGenerationCallback('feedback', body);
  }

  // Callback для изображений
  @Post('image-callback')
  async imageCallback(@Body() body: any) {
    return this.webhooksService.handleImageCallback(body);
  }

  // Callback для презентаций
  @Post('presentation-callback')
  async presentationCallback(@Body() body: any) {
    return this.webhooksService.handlePresentationCallback(body);
  }

  // Callback для транскрипций
  @Post('transcription-callback')
  async transcriptionCallback(@Body() body: any) {
    return this.webhooksService.handleTranscriptionCallback(body);
  }

  /**
   * Универсальный callback для n8n
   * Принимает любой JSON, требует generationRequestId
   */
  @Post('n8n-callback')
  async n8nGenericCallback(@Body() body: any) {
    return this.webhooksService.handleGenericCallback(body);
  }
}

