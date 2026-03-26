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
  Header,
  Patch,
} from '@nestjs/common';
import { GenerationsService } from './generations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('generate')
export class GenerationsController {
  constructor(private readonly generationsService: GenerationsService) {}

  // Текстовые генерации
  @Post('worksheet')
  @UseGuards(JwtAuthGuard)
  async generateWorksheet(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      generationType: 'worksheet',
      inputParams: body,
    });
  }

  @Post('quiz')
  @UseGuards(JwtAuthGuard)
  async generateQuiz(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      generationType: 'quiz',
      inputParams: body,
    });
  }

  @Post('vocabulary')
  @UseGuards(JwtAuthGuard)
  async generateVocabulary(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      generationType: 'vocabulary',
      inputParams: body,
    });
  }

  @Post('lesson-plan')
  @UseGuards(JwtAuthGuard)
  async generateLessonPlan(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      generationType: 'lesson-plan',
      inputParams: body,
    });
  }

  @Post('content-adaptation')
  @UseGuards(JwtAuthGuard)
  async adaptContent(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      generationType: 'content-adaptation',
      inputParams: body,
    });
  }

  @Post('message')
  @UseGuards(JwtAuthGuard)
  async generateMessage(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      generationType: 'message',
      inputParams: body,
    });
  }

  @Post('feedback')
  @UseGuards(JwtAuthGuard)
  async generateFeedback(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      generationType: 'feedback',
      inputParams: body,
    });
  }

  // Медиа генерации
  @Post('image')
  @UseGuards(JwtAuthGuard)
  async generateImage(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      generationType: 'image_generation',
      inputParams: body,
    });
  }

  @Post('photosession')
  @UseGuards(JwtAuthGuard)
  async generatePhotosession(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      generationType: 'photosession',
      inputParams: body,
    });
  }

  @Post('presentation')
  @UseGuards(JwtAuthGuard)
  async generatePresentation(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      generationType: 'presentation',
      inputParams: body,
    });
  }

  @Post('video-analysis')
  @UseGuards(JwtAuthGuard)
  async generateVideoAnalysis(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      generationType: 'video-analysis',
      inputParams: body,
    });
  }

  @Post('transcribe-video')
  @UseGuards(JwtAuthGuard)
  async transcribeVideo(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      generationType: 'transcription',
      inputParams: body,
    });
  }

  @Post('exam-variant')
  @UseGuards(JwtAuthGuard)
  async generateExamVariant(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      generationType: 'exam-variant',
      inputParams: body,
    });
  }

  @Post('lesson-preparation')
  @UseGuards(JwtAuthGuard)
  async generateLessonPreparation(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      generationType: 'lesson_preparation',
      inputParams: body,
    });
  }

  @Post('unpacking')
  @UseGuards(JwtAuthGuard)
  async generateUnpacking(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      generationType: 'unpacking',
      inputParams: body,
    });
  }

  @Post('sales-advisor')
  @UseGuards(JwtAuthGuard)
  async generateSalesAdvisor(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      generationType: 'sales_advisor',
      inputParams: body,
    });
  }

  @Post('assistant')
  @UseGuards(JwtAuthGuard)
  async generateAssistant(@Request() req, @Body() body: any) {
    return this.generationsService.createGeneration({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      generationType: 'assistant',
      inputParams: body,
    });
  }

  @Post('bundle')
  @UseGuards(JwtAuthGuard)
  async generateBundle(@Request() req, @Body() body: { types: string[]; params: any }) {
    return this.generationsService.createGenerationBundle({
      userId: req.user?.role === 'student' ? req.user?.teacherId : req.user?.id,
      types: body.types,
      inputParams: body.params,
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
      req.user.role === 'student' ? req.user.teacherId : req.user.id,
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  // Получить статус генерации
  @Get(':requestId')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getGenerationStatus(@Request() req, @Param('requestId') requestId: string) {
    return this.generationsService.getGenerationStatus(
      requestId,
      req.user.role === 'student' ? req.user.teacherId : req.user.id,
    );
  }

  // Удалить генерацию
  @Delete(':requestId')
  @UseGuards(JwtAuthGuard)
  async deleteGeneration(@Request() req, @Param('requestId') requestId: string) {
    return this.generationsService.deleteGeneration(
      requestId,
      req.user.role === 'student' ? req.user.teacherId : req.user.id,
    );
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateGeneration(@Request() req, @Param('id') id: string, @Body() body: any) {
    return this.generationsService.updateGeneration(
      id,
      req.user.role === 'student' ? req.user.teacherId : req.user.id,
      body,
    );
  }

  @Post(':id/link-lesson')
  @UseGuards(JwtAuthGuard)
  async linkToLesson(@Request() req, @Param('id') id: string, @Body() body: { lessonId: string }) {
    return this.generationsService.linkToLesson(
      id,
      req.user.role === 'student' ? req.user.teacherId : req.user.id,
      body.lessonId,
    );
  }
}
