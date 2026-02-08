import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { GenerationsService } from './generations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('generate')
export class GenerationsController {
  constructor(private readonly generationsService: GenerationsService) { }

  // Текстовые генерации
  @Post('worksheet')
  @UseGuards(JwtAuthGuard)
  async generateWorksheet(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user.id,
      generationType: 'worksheet',
      inputParams: body,
    });
  }

  @Post('quiz')
  @UseGuards(JwtAuthGuard)
  async generateQuiz(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user.id,
      generationType: 'quiz',
      inputParams: body,
    });
  }

  @Post('vocabulary')
  @UseGuards(JwtAuthGuard)
  async generateVocabulary(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user.id,
      generationType: 'vocabulary',
      inputParams: body,
    });
  }

  @Post('lesson-plan')
  @UseGuards(JwtAuthGuard)
  async generateLessonPlan(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user.id,
      generationType: 'lesson-plan',
      inputParams: body,
    });
  }

  @Post('content-adaptation')
  @UseGuards(JwtAuthGuard)
  async adaptContent(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user.id,
      generationType: 'content-adaptation',
      inputParams: body,
    });
  }

  @Post('message')
  @UseGuards(JwtAuthGuard)
  async generateMessage(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user.id,
      generationType: 'message',
      inputParams: body,
    });
  }

  @Post('feedback')
  @UseGuards(JwtAuthGuard)
  async generateFeedback(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user.id,
      generationType: 'feedback',
      inputParams: body,
    });
  }

  // Медиа генерации
  @Post('image')
  @UseGuards(JwtAuthGuard)
  async generateImage(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user.id,
      generationType: 'image',
      inputParams: body,
    });
  }

  @Post('photosession')
  @UseGuards(JwtAuthGuard)
  async generatePhotosession(@Request() req, @Body() body: any) {
    console.log('[DEBUG] Photosession request body:', JSON.stringify(body, null, 2));
    console.log('[DEBUG] photoHash:', body.photoHash);
    console.log('[DEBUG] photoUrl:', body.photoUrl);
    return this.generationsService.createGeneration({
      userId: req.user.id,
      generationType: 'photosession',
      inputParams: body,
    });
  }

  @Post('presentation')
  @UseGuards(JwtAuthGuard)
  async generatePresentation(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user.id,
      generationType: 'presentation',
      inputParams: body,
    });
  }

  @Post('transcribe-video')
  @UseGuards(JwtAuthGuard)
  async transcribeVideo(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user.id,
      generationType: 'transcription',
      inputParams: body,
    });
  }

  // История генераций (должен быть выше :requestId)
  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getGenerationHistory(
    @Request() req,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.generationsService.getGenerationHistory(
      req.user.id,
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  // Получить статус генерации
  @Get(':requestId')
  @UseGuards(JwtAuthGuard)
  async getGenerationStatus(@Request() req, @Param('requestId') requestId: string) {
    return this.generationsService.getGenerationStatus(requestId, req.user.id);
  }

  // Удалить генерацию
  @Delete(':requestId')
  @UseGuards(JwtAuthGuard)
  async deleteGeneration(@Request() req, @Param('requestId') requestId: string) {
    return this.generationsService.deleteGeneration(requestId, req.user.id);
  }

  @Post('lesson-preparation')
  @UseGuards(JwtAuthGuard)
  async generateLessonPreparation(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user.id,
      generationType: 'lessonPreparation',
      inputParams: body,
    });
  }

  @Post('video-analysis')
  @UseGuards(JwtAuthGuard)
  async analyzeVideo(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user.id,
      generationType: 'video-analysis',
      inputParams: body,
    });
  }

  @Post('sales-advisor')
  @UseGuards(JwtAuthGuard)
  async analyzeSalesDialog(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user.id,
      generationType: 'sales-advisor',
      inputParams: body,
    });
  }
}
