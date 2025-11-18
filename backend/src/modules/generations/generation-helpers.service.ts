import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GenerationQueueService } from './generation-queue.service';

@Injectable()
export class GenerationHelpersService {
  constructor(
    private prisma: PrismaService,
    private generationQueue: GenerationQueueService,
  ) {}

  /**
   * Создать запись генерации в обеих таблицах
   */
  async createGeneration(params: {
    userId: string;
    generationType: string;
    inputParams: any;
    model: string;
  }) {
    const { userId, generationType, inputParams, model } = params;

    // Создаем запись в старой таблице (для совместимости)
    const generationRequest = await this.prisma.generationRequest.create({
      data: {
        userId,
        type: generationType,
        params: inputParams,
        status: 'pending',
        model,
      },
    });

    // Создаем запись в новой таблице
    const userGeneration = await this.prisma.userGeneration.create({
      data: {
        userId,
        generationType,
        status: 'pending',
        inputParams: inputParams,
        model,
        generationRequestId: generationRequest.id,
        sentToTelegram: false,
      },
    });

    return {
      generationRequest,
      userGeneration,
    };
  }

  /**
   * Завершить генерацию успешно
   */
  async completeGeneration(generationRequestId: string, outputData: any) {
    // Обновляем старую таблицу
    await this.prisma.generationRequest.update({
      where: { id: generationRequestId },
      data: {
        status: 'completed',
        result: outputData,
      },
    });

    // Обновляем новую таблицу
    const userGeneration = await this.prisma.userGeneration.findUnique({
      where: { generationRequestId },
    });

    if (userGeneration) {
      await this.prisma.userGeneration.update({
        where: { id: userGeneration.id },
        data: {
          status: 'completed',
          outputData,
        },
      });

      // Запускаем Job для отправки в Telegram
      await this.generationQueue.scheduleTelegramSend(generationRequestId);
    }
  }

  /**
   * Пометить генерацию как неудачную
   */
  async failGeneration(generationRequestId: string, errorMessage: string) {
    // Обновляем старую таблицу
    await this.prisma.generationRequest.update({
      where: { id: generationRequestId },
      data: {
        status: 'failed',
        error: errorMessage,
      },
    });

    // Обновляем новую таблицу
    const userGeneration = await this.prisma.userGeneration.findUnique({
      where: { generationRequestId },
    });

    if (userGeneration) {
      await this.prisma.userGeneration.update({
        where: { id: userGeneration.id },
        data: {
          status: 'failed',
          errorMessage,
        },
      });
    }
  }
}
