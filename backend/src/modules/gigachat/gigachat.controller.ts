import { Body, Controller, Get, Post, Query, Request, UseGuards, Logger, BadRequestException } from '@nestjs/common';
import { GigachatGenerationsService } from './gigachat-generations.service';
import { GigachatGenerationDto } from './dto/gigachat-generation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GigachatService } from './gigachat.service';

@Controller('gigachat')
@UseGuards(JwtAuthGuard)
export class GigachatController {
  private readonly logger = new Logger(GigachatController.name);

  constructor(
    private readonly gigachatGenerationsService: GigachatGenerationsService,
    private readonly gigachatService: GigachatService,
  ) { }

  @Post('generate')
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
  async listModels(@Query('capability') capability?: string) {
    return this.gigachatService.listModels(capability);
  }

  @Post('files/upload')
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
  async getFile(@Request() req, @Query('fileId') fileId: string) {
    try {
      return await this.gigachatService.getFile(fileId);
    } catch (error: any) {
      this.logger.error(`Get file error: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  @Get('files/:fileId/content')
  async getFileContent(@Request() req, @Query('fileId') fileId: string) {
    try {
      const content = await this.gigachatService.getFileContent(fileId);
      return { success: true, content: content.toString('base64') };
    } catch (error: any) {
      this.logger.error(`Get file content error: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }
}
