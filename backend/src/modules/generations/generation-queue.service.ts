import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class GenerationQueueService {
  constructor(@InjectQueue('telegram-send') private telegramSendQueue: Queue) {}

  /**
   * Запланировать отправку результата в Telegram
   */
  async scheduleTelegramSend(generationRequestId: string) {
    await this.telegramSendQueue.add(
      'send-generation-result',
      { generationRequestId },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );
  }
}
