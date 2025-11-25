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
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { HtmlExportService } from '../../common/services/html-export.service';

@Controller('gigachat')
export class GigachatController {
  private readonly logger = new Logger(GigachatController.name);

  constructor(
    private readonly gigachatGenerationsService: GigachatGenerationsService,
    private readonly gigachatService: GigachatService,
    private readonly configService: ConfigService,
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

  @Get('files/:fileId')
  @UseGuards(JwtAuthGuard)
  async getFile(@Param('fileId') fileId: string): Promise<any> {
    try {
      return await this.gigachatService.getFile(fileId);
    } catch (error: any) {
      this.logger.error(`Get file error: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  @Get('files/:fileId/content')
  @UseGuards(JwtAuthGuard)
  async getFileContent(@Param('fileId') fileId: string): Promise<{ success: boolean; content: string }> {
    try {
      const content = await this.gigachatService.getFileContent(fileId);
      return { success: true, content: content.toString('base64') };
    } catch (error: any) {
      this.logger.error(`Get file content error: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }
  @Get('files/:fileId/download')
  async downloadFile(
    @Param('fileId') fileId: string,
    @Query('token') token: string,
    @Query('expires') expires: string,
    @Query('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!token || !expires) {
      throw new BadRequestException('Missing token or expires parameter');
    }
    const expiresNum = Number(expires);
    if (!Number.isFinite(expiresNum) || Date.now() > expiresNum) {
      throw new BadRequestException('Link expired');
    }
    if (!this.validateShareToken(fileId, expiresNum, token)) {
      throw new BadRequestException('Invalid token');
    }

    const buffer = await this.gigachatService.getFileContent(fileId);
    const meta = await this.gigachatService.getFile(fileId);
    const downloadName =
      filename || meta?.filename || `gigachat-file-${new Date().toISOString().split('T')[0]}.pdf`;

    res.setHeader('Content-Type', meta?.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);
    res.send(Buffer.from(buffer));
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

  private validateShareToken(fileId: string, expires: number, token: string) {
    const secret =
      this.configService.get<string>('GIGACHAT_FILE_SHARE_SECRET') ||
      this.configService.get<string>('JWT_SECRET');
    const expected = crypto.createHmac('sha256', secret).update(`${fileId}:${expires}`).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  }
}
