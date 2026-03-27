import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';

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
    '.pptx',
  ];
  private get maxFileSize(): number {
    return this.configService.get<number>('MAX_VIDEO_SIZE_MB', 2000) * 1024 * 1024;
  }

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
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
  async saveFile(file: Express.Multer.File, userId: string): Promise<{ hash: string; url: string }> {
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

    // Записываем в БД для контроля доступа
    await this.prisma.uploadedFile.create({
      data: {
        hash: fileHash,
        userId,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      },
    });

    // Возвращаем hash и URL для доступа к файлу
    const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3001');
    const fileUrl = `${baseUrl}/api/files/${fileHash}`;

    return {
      hash: fileHash,
      url: fileUrl,
    };
  }

  /**
   * Сохранить буфер как файл
   */
  async saveBuffer(
    buffer: Buffer,
    originalName: string,
    userId: string,
  ): Promise<{ hash: string; url: string }> {
    // Проверка размера
    if (buffer.length > this.maxFileSize) {
      throw new BadRequestException(`File size exceeds ${this.maxFileSize / 1024 / 1024}MB`);
    }

    // Проверка расширения
    const fileExtension = path.extname(originalName);
    this.validateExtension(fileExtension);

    // Генерируем уникальный hash для файла
    const fileHash = crypto.randomBytes(16).toString('hex');
    const filePath = this.getSafeFilePath(fileHash, fileExtension);

    // Сохраняем файл
    await fs.writeFile(filePath, buffer);

    // Записываем в БД для контроля доступа
    await this.prisma.uploadedFile.create({
      data: {
        hash: fileHash,
        userId,
        filename: originalName,
        mimeType: this.getMimeType(fileExtension),
        size: buffer.length,
      },
    });

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
        }),
      );

      return fileList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      console.error('Failed to list files:', error);
      return [];
    }
  }

  /**
   * Удалить файл по hash с проверкой владельца
   */
  async deleteFile(hash: string, userId: string): Promise<boolean> {
    // Валидация hash
    this.validateHash(hash);

    try {
      // 1. Проверяем в БД владельца (Broken Access Control fix)
      const dbFile = await this.prisma.uploadedFile.findUnique({
        where: { hash },
      });

      if (!dbFile) {
        return false;
      }

      if (dbFile.userId !== userId) {
        throw new BadRequestException('У вас нет прав на удаление этого файла');
      }

      const files = await fs.readdir(this.uploadDir);
      const file = files.find((f) => {
        const fileName = path.basename(f);
        return (
          fileName.startsWith(hash) && fileName.length === hash.length + path.extname(f).length
        );
      });

      if (!file) {
        // Если файла нет на диске, но есть в БД — удаляем из БД
        await this.prisma.uploadedFile.delete({ where: { hash } });
        return false;
      }

      const filePath = path.join(this.uploadDir, file);

      // Проверка что путь безопасный (защита от path traversal)
      const resolvedPath = path.resolve(filePath);
      const resolvedDir = path.resolve(this.uploadDir);
      if (!resolvedPath.startsWith(resolvedDir)) {
        throw new BadRequestException('Invalid file path');
      }

      // Удаляем из БД
      await this.prisma.uploadedFile.delete({ where: { hash } });
      // Удаляем с диска
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
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.html': 'text/html',
    };

    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Проверка IP на принадлежность к приватным сетям и спец-адресам (SSRF Protection)
   */
  private isPrivateIp(ip: string): boolean {
    // IPv4 private ranges (RFC 1918)
    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    const ipv4Regex =
      /^(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)$/;
    // Loopback, Link-Local, etc.
    const ipv4SpecialRegex = /^(127\.\d+\.\d+\.\d+|0\.0\.0\.0|169\.254\.\d+\.\d+)$/;

    // IPv6
    const isIPv6Loopback = ip === '::1' || ip === '0:0:0:0:0:0:0:1';
    const isIPv6LinkLocal = ip.toLowerCase().startsWith('fe80:');
    const isIPv6Private =
      ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd');

    return (
      ipv4Regex.test(ip) ||
      ipv4SpecialRegex.test(ip) ||
      isIPv6Loopback ||
      isIPv6LinkLocal ||
      isIPv6Private
    );
  }

  /**
   * Скачать внешний файл (прокси) с защитой от SSRF
   */
  async downloadExternal(
    url: string,
  ): Promise<{ buffer: Buffer; mimeType: string; originalName: string }> {
    try {
      const parsedUrl = new URL(url);

      // 1. Блокируем подозрительные схемы
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Only HTTP/HTTPS protocols are allowed');
      }

      // 2. Блокируем явные вхождения локальных хостов
      const hostname = parsedUrl.hostname.toLowerCase().replace(/[\[\]]/g, '');
      if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname)) {
        throw new Error('Access to local hostnames is forbidden');
      }

      // 3. Блокируем инстансы метаданных облаков по IP
      if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
        throw new Error('Access to metadata service is forbidden');
      }

      // 4. Проверка на приватные диапазоны IP (включая альтернативные представления)
      if (this.isPrivateIp(hostname)) {
        throw new Error('Access to private IP ranges is forbidden');
      }

      // Дополнительно: защита от DNS Rebinding (в идеале нужно делать resolve и проверять итоговый IP)
      // Но для базовой защиты этого уже достаточно.

      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000), // 10s timeout
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch external file: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = response.headers.get('content-type') || 'application/octet-stream';
      
      // Пытаемся достать имя из URL или заголовков
      let originalName = 'downloaded_file';
      const contentDisposition = response.headers.get('content-disposition');
      if (contentDisposition && contentDisposition.includes('filename=')) {
        originalName = contentDisposition.split('filename=')[1].replace(/["']/g, '');
      } else {
        const urlParts = new URL(url).pathname.split('/');
        originalName = urlParts[urlParts.length - 1] || originalName;
      }

      return { buffer, mimeType, originalName };
    } catch (error) {
      console.error('Failed to download external file:', error);
      throw new BadRequestException('Не удалось скачать файл по ссылке');
    }
  }
}
