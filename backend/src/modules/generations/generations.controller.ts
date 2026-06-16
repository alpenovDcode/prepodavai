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
} from '@nestjs/common';
import { GenerationsService } from './generations.service';
import { WorksheetV2Service } from './v2/worksheet-v2.service';
import { TextV2Service } from './v2/text-v2.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GenerationsThrottlerGuard } from '../../common/guards/generations-throttler.guard';
import {
  GenerationBundleDto,
  UpdateGenerationDto,
  LinkToLessonDto,
  EditImageDto,
} from './dto/generation.dto';

@Controller('generate')
export class GenerationsController {
  constructor(
    private readonly generationsService: GenerationsService,
    private readonly worksheetV2Service: WorksheetV2Service,
    private readonly textV2Service: TextV2Service,
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

  // v2: JSON-blocks формат worksheet. Синхронный AI-вызов, без n8n.
  @Post('v2/worksheet')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateWorksheetV2(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.textV2Service.generateWorksheet(
      this.userId(req),
      {
        topic: String(body.topic || ''),
        subject: body.subject ? String(body.subject) : undefined,
        grade: body.grade as any,
        duration: body.duration ? String(body.duration) : undefined,
        numTasks: body.numTasks ? Number(body.numTasks) : undefined,
        extraNotes: body.extraNotes ? String(body.extraNotes) : undefined,
      },
      body.lessonId ? String(body.lessonId) : undefined,
    );
  }

  @Post('v2/quiz')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateQuizV2(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.textV2Service.generateQuiz(
      this.userId(req),
      {
        topic: String(body.topic || ''),
        subject: body.subject ? String(body.subject) : undefined,
        grade: body.grade as any,
        numQuestions: body.numQuestions ? Number(body.numQuestions) : undefined,
        numAnswers: body.numAnswers ? Number(body.numAnswers) : undefined,
        questionTypes: body.questionTypes as any,
        extraNotes: body.extraNotes ? String(body.extraNotes) : undefined,
      },
      body.lessonId ? String(body.lessonId) : undefined,
    );
  }

  @Post('v2/lesson-plan')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateLessonPlanV2(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.textV2Service.generateLessonPlan(
      this.userId(req),
      {
        topic: String(body.topic || ''),
        subject: body.subject ? String(body.subject) : undefined,
        grade: body.grade as any,
        duration: body.duration ? String(body.duration) : undefined,
        objectives: body.objectives ? String(body.objectives) : undefined,
        extraNotes: body.extraNotes ? String(body.extraNotes) : undefined,
      },
      body.lessonId ? String(body.lessonId) : undefined,
    );
  }

  @Post('v2/vocabulary')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateVocabularyV2(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.textV2Service.generateVocabulary(
      this.userId(req),
      {
        topic: String(body.topic || ''),
        sourceLanguage: body.sourceLanguage ? String(body.sourceLanguage) : undefined,
        targetLanguage: body.targetLanguage ? String(body.targetLanguage) : undefined,
        grade: body.grade as any,
        numWords: body.numWords ? Number(body.numWords) : undefined,
        extraNotes: body.extraNotes ? String(body.extraNotes) : undefined,
      },
      body.lessonId ? String(body.lessonId) : undefined,
    );
  }

  @Post('v2/lesson-preparation')
  @UseGuards(JwtAuthGuard, GenerationsThrottlerGuard)
  async generateLessonPreparationV2(@Request() req: any, @Body() body: Record<string, unknown>) {
    return this.textV2Service.generateLessonPreparation(
      this.userId(req),
      {
        topic: String(body.topic || ''),
        subject: body.subject ? String(body.subject) : undefined,
        grade: body.grade as any,
        duration: body.duration ? String(body.duration) : undefined,
        extraNotes: body.extraNotes ? String(body.extraNotes) : undefined,
      },
      body.lessonId ? String(body.lessonId) : undefined,
    );
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

  /**
   * Экспорт PDF по id генерации — ровно тот же путь, что у Telegram/MAX:
   * читаем `outputData` из БД, рендерим через единый `htmlToPdf`.
   * Фронт шлёт только `requestId`; никакой передачи HTML с клиента.
   */
  @Post(':requestId/pdf')
  @UseGuards(JwtAuthGuard)
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="document.pdf"')
  async exportGenerationPdf(
    @Request() req: any,
    @Param('requestId') requestId: string,
    @Query('withAnswers') withAnswers?: string,
    @Query('sectionIndex') sectionIndex?: string,
  ): Promise<StreamableFile> {
    // По умолчанию PDF для учителя — с ответами. Флаг передаём только
    // если явно указан `withAnswers=false` (режим «для ученика»).
    const withAnswersFlag = withAnswers === 'false' ? false : true;
    const parsedSectionIndex =
      typeof sectionIndex === 'string' && /^\d+$/.test(sectionIndex)
        ? parseInt(sectionIndex, 10)
        : undefined;
    const pdfBuffer = await this.generationsService.exportGenerationPdf(
      requestId,
      this.userId(req),
      { withAnswers: withAnswersFlag, sectionIndex: parsedSectionIndex },
    );
    return new StreamableFile(pdfBuffer);
  }

  /**
   * Экспорт DOCX по id генерации. Та же логика, что у `/pdf`, но конвертер —
   * html-to-docx. Удобно учителю довести лист в Word до печати.
   */
  @Post(':requestId/docx')
  @UseGuards(JwtAuthGuard)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  @Header('Content-Disposition', 'attachment; filename="document.docx"')
  async exportGenerationDocx(
    @Request() req: any,
    @Param('requestId') requestId: string,
    @Query('withAnswers') withAnswers?: string,
    @Query('sectionIndex') sectionIndex?: string,
  ): Promise<StreamableFile> {
    const withAnswersFlag = withAnswers === 'false' ? false : true;
    const parsedSectionIndex =
      typeof sectionIndex === 'string' && /^\d+$/.test(sectionIndex)
        ? parseInt(sectionIndex, 10)
        : undefined;
    const docxBuffer = await this.generationsService.exportGenerationDocx(
      requestId,
      this.userId(req),
      { withAnswers: withAnswersFlag, sectionIndex: parsedSectionIndex },
    );
    return new StreamableFile(docxBuffer);
  }

  /**
   * Скачать оригинальное изображение генерации (photosession / image_generation).
   * Бэкенд тянет картинку у провайдера и отдаёт фронту с правильным Content-Type
   * и расширением в filename — это фиксит «битые» файлы при скачивании напрямую
   * с replicate.delivery (которые на самом деле JPEG, но сохраняются как .png).
   */
  @Get(':requestId/image')
  @UseGuards(JwtAuthGuard)
  async downloadGenerationImage(
    @Request() req: any,
    @Param('requestId') requestId: string,
  ): Promise<StreamableFile> {
    const { buffer, contentType, filename } = await this.generationsService.streamGenerationImage(
      requestId,
      this.userId(req),
    );
    return new StreamableFile(buffer, {
      type: contentType,
      disposition: `attachment; filename="${filename}"`,
    });
  }

  /**
   * Export a presentation (SlideDoc) as PDF (landscape 16:9) or PPTX.
   * Distinct from /:requestId/pdf which is for worksheet-style HTML.
   */
  @Post(':requestId/presentation/:format')
  @UseGuards(JwtAuthGuard)
  async exportPresentation(
    @Request() req: any,
    @Param('requestId') requestId: string,
    @Param('format') format: string,
  ): Promise<StreamableFile> {
    const fmt: 'pdf' | 'pptx' = format === 'pptx' ? 'pptx' : 'pdf';
    const buffer = await this.generationsService.exportPresentation(
      requestId,
      this.userId(req),
      fmt,
    );
    const mime =
      fmt === 'pptx'
        ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        : 'application/pdf';
    return new StreamableFile(buffer, {
      type: mime,
      disposition: `attachment; filename="presentation.${fmt}"`,
    });
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
    @Query('type') type?: string,
    @Query('period') period?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('slim') slim?: string,
  ) {
    const parsedLimit = Math.min(Math.max(parseInt(limit ?? '100', 10) || 100, 1), 200);
    const parsedOffset = Math.max(parseInt(offset ?? '0', 10) || 0, 0);
    return this.generationsService.getGenerationHistory(
      this.userId(req),
      parsedLimit,
      parsedOffset,
      { type, period, search, sort, slim: slim === '1' || slim === 'true' },
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

  // Сбросить ручные правки результата — вернуться к исходной AI-версии
  // (берётся из generationRequest.result, который мы намеренно не перезаписываем
  // при сохранении правок, см. updateGeneration).
  @Post(':id/reset-edits')
  @UseGuards(JwtAuthGuard)
  async resetEdits(@Request() req: any, @Param('id') id: string) {
    return this.generationsService.resetGenerationEdits(id, this.userId(req));
  }

  // Редактирование готового изображения по текстовой инструкции
  @Post(':requestId/edit-image')
  @UseGuards(JwtAuthGuard)
  async editImage(
    @Request() req: any,
    @Param('requestId') requestId: string,
    @Body() body: EditImageDto,
  ) {
    return this.generationsService.startImageEdit(
      requestId,
      this.userId(req),
      body.instruction,
    );
  }

  @Post(':id/duplicate')
  @UseGuards(JwtAuthGuard)
  async duplicateGeneration(@Request() req: any, @Param('id') id: string) {
    return this.generationsService.duplicateGeneration(id, this.userId(req));
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
