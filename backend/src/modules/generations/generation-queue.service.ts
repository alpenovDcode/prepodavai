import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

const RETRY_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
};

@Injectable()
export class GenerationQueueService {
  constructor(
    @InjectQueue('telegram-send') private telegramSendQueue: Queue,
    @InjectQueue('max-send') private maxSendQueue: Queue,
  ) {}

  async scheduleTelegramSend(generationRequestId: string) {
    await this.telegramSendQueue.add(
      'send-generation-result',
      { generationRequestId },
      RETRY_OPTIONS,
    );
  }

  async scheduleMaxSend(generationRequestId: string) {
    await this.maxSendQueue.add(
      'send-generation-result',
      { generationRequestId },
      RETRY_OPTIONS,
    );
  }
}
