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
  StreamableFile,
  BadRequestException,
} from '@nestjs/common';
import { GenerationsService } from './generations.service';
import { HtmlExportService } from '../../common/services/html-export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GenerationsThrottlerGuard } from '../../common/guards/generations-throttler.guard';
import {
  GenerationBundleDto,
  UpdateGenerationDto,
  LinkToLessonDto,
} from './dto/generation.dto';

@Controller('generate')
export class GenerationsController {
  constructor(
    private readonly generationsService: GenerationsService,
    private readonly htmlExportService: HtmlExportService,
  ) {}

  private userId(req: any): string {
    return req.user?.role === 'student' ? req.user?.teacherId : req.user?.id;
  }

  // Текстовые генерации
  @Post('worksheet')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateWorksheet(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.generationsService.createGeneration({
      userId: this.userId(req),
      generationType: 'worksheet',
      inputParams: body,
    });
  }

  @Post('quiz')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateQuiz(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.generationsService.createGeneration({
      userId: this.userId(req),
      generationType: 'quiz',
      inputParams: body,
    });
  }

  @Post('vocabulary')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateVocabulary(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.generationsService.createGeneration({
      userId: this.userId(req),
      generationType: 'vocabulary',
      inputParams: body,
    });
  }

  @Post('lesson-plan')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateLessonPlan(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.generationsService.createGeneration({
      userId: this.userId(req),
      generationType: 'lesson-plan',
      inputParams: body,
    });
  }

  @Post('content-adaptation')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async adaptContent(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.generationsService.createGeneration({
      userId: this.userId(req),
      generationType: 'content-adaptation',
      inputParams: body,
    });
  }

  @Post('message')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateMessage(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.generationsService.createGeneration({
      userId: this.userId(req),
      generationType: 'message',
      inputParams: body,
    });
  }

  @Post('feedback')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateFeedback(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.generationsService.createGeneration({
      userId: this.userId(req),
      generationType: 'feedback',
      inputParams: body,
    });
  }

  // Медиа генерации
  @Post('image')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateImage(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.generationsService.createGeneration({
      userId: this.userId(req),
      generationType: 'image_generation',
      inputParams: body,
    });
  }

  @Post('photosession')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generatePhotosession(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.generationsService.createGeneration({
      userId: this.userId(req),
      generationType: 'photosession',
      inputParams: body,
    });
  }

  @Post('presentation')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generatePresentation(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.generationsService.createGeneration({
      userId: this.userId(req),
      generationType: 'presentation',
      inputParams: body,
    });
  }

  @Post('video-analysis')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateVideoAnalysis(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.generationsService.createGeneration({
      userId: this.userId(req),
      generationType: 'video-analysis',
      inputParams: body,
    });
  }

  @Post('transcribe-video')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async transcribeVideo(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.generationsService.createGeneration({
      userId: this.userId(req),
      generationType: 'transcription',
      inputParams: body,
    });
  }

  @Post('exam-variant')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateExamVariant(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.generationsService.createGeneration({
      userId: this.userId(req),
      generationType: 'exam-variant',
      inputParams: body,
    });
  }

  @Post('lesson-preparation')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateLessonPreparation(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.generationsService.createGeneration({
      userId: this.userId(req),
      generationType: 'lesson_preparation',
      inputParams: body,
    });
  }

  @Post('unpacking')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateUnpacking(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.generationsService.createGeneration({
      userId: this.userId(req),
      generationType: 'unpacking',
      inputParams: body,
    });
  }

  @Post('sales-advisor')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateSalesAdvisor(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.generationsService.createGeneration({
      userId: this.userId(req),
      generationType: 'sales_advisor',
      inputParams: body,
    });
  }

  @Post('assistant')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateAssistant(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.generationsService.createGeneration({
      userId: this.userId(req),
      generationType: 'assistant',
      inputParams: body,
    });
  }

  @Post('export-pdf')
  @UseGuards(JwtAuthGuard)
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="document.pdf"')
  async exportToPdf(@Body() body: { html: string }): Promise<StreamableFile> {
    if (!body?.html || typeof body.html !== 'string') {
      throw new BadRequestException('html is required');
    }
    const pdfBuffer = await this.htmlExportService.htmlToPdf(body.html);
    return new StreamableFile(pdfBuffer);
  }

  @Post('bundle')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateBundle(@Request() req: any, @Body() body: GenerationBundleDto) {
    return this.generationsService.createGenerationBundle({
      userId: this.userId(req),
      types: body.types,
      inputParams: body.params ?? {},
    });
  }

  // История генераций (должен быть выше :requestId)
  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getGenerationHistory(
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = Math.min(Math.max(parseInt(limit ?? '50', 10) || 50, 1), 200);
    const parsedOffset = Math.max(parseInt(offset ?? '0', 10) || 0, 0);
    return this.generationsService.getGenerationHistory(
      this.userId(req),
      parsedLimit,
      parsedOffset,
    );
  }

  // Получить статус генерации
  @Get(':requestId')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getGenerationStatus(@Request() req: any, @Param('requestId') requestId: string) {
    return this.generationsService.getGenerationStatus(requestId, this.userId(req));
  }

  // Удалить генерацию
  @Delete(':requestId')
  @UseGuards(JwtAuthGuard)
  async deleteGeneration(@Request() req: any, @Param('requestId') requestId: string) {
    return this.generationsService.deleteGeneration(requestId, this.userId(req));
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateGeneration(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: UpdateGenerationDto,
  ) {
    return this.generationsService.updateGeneration(id, this.userId(req), body);
  }

  @Post(':id/link-lesson')
  @UseGuards(JwtAuthGuard)
  async linkToLesson(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: LinkToLessonDto,
  ) {
    return this.generationsService.linkToLesson(id, this.userId(req), body.lessonId);
  }
}
