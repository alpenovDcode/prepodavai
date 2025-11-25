import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
  Logger,
  BadRequestException,
  Param,
  Res,
} from '@nestjs/common';
import { GigachatGenerationsService } from './gigachat-generations.service';
import { GigachatGenerationDto } from './dto/gigachat-generation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GigachatService } from './gigachat.service';
import { Response } from 'express';
import { HtmlExportService } from '../../common/services/html-export.service';

@Controller('gigachat')
export class GigachatController {
  private readonly logger = new Logger(GigachatController.name);

  constructor(
    private readonly gigachatGenerationsService: GigachatGenerationsService,
    private readonly gigachatService: GigachatService,
    private readonly htmlExportService: HtmlExportService,
  ) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  async generate(@Request() req, @Body() dto: GigachatGenerationDto) {
    try {
      this.logger.log(`GigaChat generation request: mode=${dto.mode}, model=${dto.model}, userId=${req.user.id}`);
      this.logger.debug(`Request body: ${JSON.stringify(dto, null, 2)}`);
      return await this.gigachatGenerationsService.generate(req.user.id, dto);
    } catch (error: any) {
      this.logger.error(`GigaChat generation error: ${error.message}`, error.stack);
      if (error.response) {
        this.logger.error(`GigaChat API error response: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  @Get('models')
  @UseGuards(JwtAuthGuard)
  async listModels(@Query('capability') capability?: string) {
    return this.gigachatService.listModels(capability);
  }

  @Post('files/upload')
  @UseGuards(JwtAuthGuard)
  async uploadFile(@Request() req, @Body() body: { file: string; filename: string; purpose?: string }) {
    try {
      // Decode base64 file
      const fileBuffer = Buffer.from(body.file, 'base64');
      const fileId = await this.gigachatService.uploadFile(
        fileBuffer,
        body.filename,
        body.purpose || 'assistants',
      );
      return { success: true, fileId, hash: fileId };
    } catch (error: any) {
      this.logger.error(`File upload error: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  @Post('export/pdf')
  @UseGuards(JwtAuthGuard)
  async exportPdf(
    @Body() body: { html: string; filename?: string },
    @Res() res: Response,
  ): Promise<void> {
    if (!body?.html) {
      throw new BadRequestException('HTML payload is required');
    }

    const pdfBuffer = await this.htmlExportService.htmlToPdf(body.html);
    const filename =
      body.filename ||
      `gigachat-material-${new Date().toISOString().split('T')[0]}-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(pdfBuffer);
  }

}
