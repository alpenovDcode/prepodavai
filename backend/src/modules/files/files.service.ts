import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class FilesService {
  private readonly uploadDir: string;
  private readonly allowedExtensions = [
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
  private readonly maxFileSize = 100 * 1024 * 1024; // 100MB

  constructor(private configService: ConfigService) {
    // Создаем директорию для загрузки файлов (используем абсолютный путь)
    const uploadDir = this.configService.get<string>('UPLOAD_DIR', './uploads');
    this.uploadDir = path.resolve(uploadDir);
    this.ensureUploadDir();
  }

  private async ensureUploadDir() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create upload directory:', error);
    }
  }

  /**
   * Валидация hash файла
   */
  private validateHash(hash: string): void {
    // Hash должен быть hex строкой длиной 32 символа
    if (!/^[a-f0-9]{32}$/i.test(hash)) {
      throw new BadRequestException('Invalid file hash format');
    }
  }

  /**
   * Валидация расширения файла
   */
  private validateExtension(extension: string): void {
    const ext = extension.toLowerCase();
    if (!this.allowedExtensions.includes(ext)) {
      throw new BadRequestException(`File extension ${ext} is not allowed`);
    }
  }

  /**
   * Безопасное получение пути к файлу с проверкой path traversal
   */
  private getSafeFilePath(hash: string, extension?: string): string {
    this.validateHash(hash);

    if (extension) {
      this.validateExtension(extension);
      const fileName = `${hash}${extension}`;
      const filePath = path.join(this.uploadDir, fileName);
      const resolvedPath = path.resolve(filePath);
      const resolvedDir = path.resolve(this.uploadDir);

      if (!resolvedPath.startsWith(resolvedDir)) {
        throw new BadRequestException('Invalid file path');
      }

      return filePath;
    }

    // Если расширение не указано, ищем файл по hash
    return null;
  }

  /**
   * Сохранить загруженный файл
   * Возвращает hash файла для использования в генерациях
   */
  async saveFile(file: Express.Multer.File): Promise<{ hash: string; url: string }> {
    if (!file) {
      throw new BadRequestException('Файл не предоставлен');
    }

    // Проверка размера
    if (file.size > this.maxFileSize) {
      throw new BadRequestException(`File size exceeds ${this.maxFileSize / 1024 / 1024}MB`);
    }

    // Проверка расширения
    const fileExtension = path.extname(file.originalname);
    this.validateExtension(fileExtension);

    // Генерируем уникальный hash для файла
    const fileHash = crypto.randomBytes(16).toString('hex');
    const filePath = this.getSafeFilePath(fileHash, fileExtension);

    // Сохраняем файл
    await fs.writeFile(filePath, file.buffer);

    // Возвращаем hash и URL для доступа к файлу
    const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3001');
    const fileUrl = `${baseUrl}/api/files/${fileHash}`;

    return {
      hash: fileHash,
      url: fileUrl,
    };
  }

  /**
   * Получить файл по hash
   */
  async getFile(hash: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    // Валидация hash
    this.validateHash(hash);

    try {
      // Ищем файл по hash (может быть с разными расширениями)
      const files = await fs.readdir(this.uploadDir);
      const file = files.find((f) => {
        const fileName = path.basename(f);
        return (
          fileName.startsWith(hash) && fileName.length === hash.length + path.extname(f).length
        );
      });

      if (!file) {
        return null;
      }

      const filePath = path.join(this.uploadDir, file);

      // Проверка что путь безопасный (защита от path traversal)
      const resolvedPath = path.resolve(filePath);
      const resolvedDir = path.resolve(this.uploadDir);
      if (!resolvedPath.startsWith(resolvedDir)) {
        throw new BadRequestException('Invalid file path');
      }

      const buffer = await fs.readFile(filePath);
      const mimeType = this.getMimeType(path.extname(file));

      return { buffer, mimeType };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Failed to get file:', error);
      return null;
    }
  }

  /**
   * Получить список всех файлов
   */
  async listFiles(): Promise<Array<{ name: string; size: number; createdAt: Date; url: string }>> {
    try {
      const files = await fs.readdir(this.uploadDir);
      const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3001');

      const fileList = await Promise.all(
        files.map(async (fileName) => {
          const filePath = path.join(this.uploadDir, fileName);
          const stats = await fs.stat(filePath);
          const hash = fileName.split('.')[0];

          return {
            name: fileName,
            size: stats.size,
            createdAt: stats.birthtime,
            url: `${baseUrl}/api/files/${hash}`,
          };
        })
      );

      return fileList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      console.error('Failed to list files:', error);
      return [];
    }
  }

  /**
   * Удалить файл по hash
   */
  async deleteFile(hash: string): Promise<boolean> {
    // Валидация hash
    this.validateHash(hash);

    try {
      const files = await fs.readdir(this.uploadDir);
      const file = files.find((f) => {
        const fileName = path.basename(f);
        return (
          fileName.startsWith(hash) && fileName.length === hash.length + path.extname(f).length
        );
      });

      if (!file) {
        return false;
      }

      const filePath = path.join(this.uploadDir, file);

      // Проверка что путь безопасный (защита от path traversal)
      const resolvedPath = path.resolve(filePath);
      const resolvedDir = path.resolve(this.uploadDir);
      if (!resolvedPath.startsWith(resolvedDir)) {
        throw new BadRequestException('Invalid file path');
      }

      await fs.unlink(filePath);
      return true;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Failed to delete file:', error);
      return false;
    }
  }

  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.pdf': 'application/pdf',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }
}
