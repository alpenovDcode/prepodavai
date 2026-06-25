import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GenerationHelpersService } from './generation-helpers.service';
import {
    isAllowedMaterialMime,
    isAllowedMaterialSize,
    materialTitleFromFilename,
    MAX_MATERIAL_SIZE_BYTES,
} from './upload-material.validators';

/**
 * Загрузка пользовательских материалов (PDF/JPG/PNG).
 *
 * Дизайн (см. Этап 1 фичи «Материалы»):
 *   - Загруженный файл становится записью UserGeneration с
 *     generationType='uploaded_file' и status='completed' сразу.
 *   - Это позволяет переиспользовать всю инфраструктуру:
 *     список «Материалы» (GET /generate/history), переименование,
 *     папки, дублирование, удаление, «выдать ученикам».
 *   - Сам файл хранится через FilesService (локальный диск,
 *     дедупликация по hash, контроль владельца).
 */
@Injectable()
export class UploadMaterialService {
    private readonly logger = new Logger(UploadMaterialService.name);

    constructor(
        private readonly filesService: FilesService,
        private readonly generationHelpers: GenerationHelpersService,
        private readonly prisma: PrismaService,
    ) {}

    async upload(params: {
        userId: string;
        file: Express.Multer.File;
        title?: string;
        lessonId?: string;
    }): Promise<{
        success: true;
        generationId: string;
        fileHash: string;
        fileUrl: string;
    }> {
        const { userId, file, title, lessonId } = params;

        if (!file) {
            throw new BadRequestException('Файл не предоставлен');
        }
        if (!isAllowedMaterialMime(file.mimetype)) {
            throw new BadRequestException(
                'Поддерживаются только PDF, JPG и PNG. Получен: ' + file.mimetype,
            );
        }
        if (!isAllowedMaterialSize(file.size)) {
            throw new BadRequestException(
                `Размер файла превышает лимит ${MAX_MATERIAL_SIZE_BYTES / 1024 / 1024}MB`,
            );
        }

        const saved = await this.filesService.saveFile(file, userId);

        const resolvedTitle =
            title && title.trim() ? title.trim() : materialTitleFromFilename(file.originalname);

        const inputParams = {
            fileHash: saved.hash,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            title: resolvedTitle,
        };

        const { generationRequest, userGeneration } = await this.generationHelpers.createGeneration({
            userId,
            generationType: 'uploaded_file',
            inputParams,
            model: 'none',
            lessonId,
        });

        const outputData = {
            fileHash: saved.hash,
            fileUrl: saved.url,
            mimeType: file.mimetype,
            originalName: file.originalname,
            size: file.size,
        };

        await this.generationHelpers.completeGeneration(generationRequest.id, outputData);

        // Title хранится отдельно в UserGeneration.title — задаём явно, чтобы
        // не зависеть от inputParams в списке материалов.
        await this.setTitle(userGeneration.id, resolvedTitle);

        this.logger.log(
            `uploaded material: userId=${userId} generationId=${userGeneration.id} hash=${saved.hash} size=${file.size}`,
        );

        return {
            success: true,
            generationId: userGeneration.id,
            fileHash: saved.hash,
            fileUrl: saved.url,
        };
    }

    private async setTitle(userGenerationId: string, title: string): Promise<void> {
        // completeGeneration не пишет title — обновляем отдельно,
        // чтобы он появлялся в списке материалов сразу.
        await this.prisma.userGeneration.update({
            where: { id: userGenerationId },
            data: { title },
        });
    }
}
