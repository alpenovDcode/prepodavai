import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TelegramService } from '../../telegram/telegram.service';

@Processor('telegram-send')
export class TelegramSenderProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    private telegramService: TelegramService,
  ) {
    super();
  }

  async process(job: Job<{ generationRequestId: string }>) {
    const { generationRequestId } = job.data;

    // Находим генерацию
    const userGeneration = await this.prisma.userGeneration.findUnique({
      where: { generationRequestId },
      include: {
        user: true,
        generationRequest: true,
      },
    });

    if (!userGeneration) {
      throw new Error(`Generation not found: ${generationRequestId}`);
    }

    // Проверяем статус
    if (userGeneration.status !== 'completed') {
      throw new Error(`Generation not completed: ${generationRequestId}`);
    }

    // Проверяем, не была ли уже отправлена
    if (userGeneration.sentToTelegram) {
      return { success: true, message: 'Already sent' };
    }

    // Проверяем, что пользователь из Telegram
    if (userGeneration.user.source !== 'telegram') {
      // Помечаем как отправленное, чтобы не пытаться снова
      await this.prisma.userGeneration.update({
        where: { id: userGeneration.id },
        data: {
          sentToTelegram: true,
          telegramSentAt: new Date(),
        },
      });
      return { success: false, message: 'Not a Telegram user' };
    }

    // Отправляем результат в Telegram
    const result = userGeneration.outputData || userGeneration.generationRequest?.result;

    if (!result) {
      throw new Error(`No result data for generation: ${generationRequestId}`);
    }

    const sendResult = await this.telegramService.sendGenerationResult({
      userId: userGeneration.user.id,
      generationType: userGeneration.generationType,
      result,
      generationRequestId,
    });

    if (sendResult.success) {
      // Помечаем как отправленное
      await this.prisma.userGeneration.update({
        where: { id: userGeneration.id },
        data: {
          sentToTelegram: true,
          telegramSentAt: new Date(),
        },
      });
    }

    return sendResult;
  }
}
