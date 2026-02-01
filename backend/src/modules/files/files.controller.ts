import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as path from 'path';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) { }

  /**
   * Загрузить файл
   * Поддерживает изображения и видео
   */
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 2 * 1024 * 1024 * 1024, // 2GB for video analysis
      },
      fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'video/mp4',
          'video/webm',
          'video/quicktime',
          'application/pdf',
          'audio/mpeg',
          'audio/mp3',
          'audio/wav',
          'audio/x-wav',
          'audio/webm',
          'audio/ogg',
          'audio/mp4',
          'audio/aac',
          'audio/m4a',
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
          return cb(new BadRequestException(`Invalid file type: ${file.mimetype}`), false);
        }

        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExtensions = [
          '.jpg',
          '.jpeg',
          '.png',
          '.gif',
          '.webp',
          '.mp4',
          '.webm',
          '.mov',
          '.pdf',
          '.mp3',
          '.wav',
          '.ogg',
          '.m4a',
          '.aac',
        ];
        if (!allowedExtensions.includes(ext)) {
          return cb(new BadRequestException(`Invalid file extension: ${ext}`), false);
        }

        cb(null, true);
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Файл не предоставлен');
    }

    const result = await this.filesService.saveFile(file);
    return {
      success: true,
      ...result,
    };
  }

  /**
   * Получить файл по hash
   */
  @Get(':hash')
  async getFile(@Param('hash') hash: string, @Res() res: Response) {
    const file = await this.filesService.getFile(hash);

    if (!file) {
      return res.status(404).json({ success: false, error: 'Файл не найден' });
    }

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${hash}"`);
    // Явно разрешаем кросс-доменные запросы для файлов
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(file.buffer);
  }

  /**
   * Удалить файл по hash
   */
  @Delete(':hash')
  @UseGuards(JwtAuthGuard)
  async deleteFile(@Param('hash') hash: string) {
    const deleted = await this.filesService.deleteFile(hash);
    return {
      success: deleted,
      message: deleted ? 'Файл удален' : 'Файл не найден',
    };
  }
}
