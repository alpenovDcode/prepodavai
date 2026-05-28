import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MaxService } from '../../max/max.service';

// lockDuration 2 min: text generations run Puppeteer (~60s cold start) inside this job
@Processor('max-send', { lockDuration: 120_000 })
export class MaxSenderProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    private maxService: MaxService,
  ) {
    super();
  }

  async process(job: Job<{ generationRequestId: string }>) {
    const { generationRequestId } = job.data;

    const userGeneration = await this.prisma.userGeneration.findUnique({
      where: { generationRequestId },
      include: { user: true, generationRequest: true },
    });

    if (!userGeneration) {
      throw new Error(`Generation not found: ${generationRequestId}`);
    }

    if (userGeneration.status !== 'completed') {
      throw new Error(`Generation not completed: ${generationRequestId}`);
    }

    // Проверяем, не была ли уже отправлена
    if (userGeneration.sentToMax) {
      return { success: true, message: 'Already sent to MAX' };
    }

    // Проверяем, что к аккаунту привязан MAX
    if (!userGeneration.user.maxId) {
      await this.prisma.userGeneration.update({
        where: { id: userGeneration.id },
        data: { sentToMax: true, maxSentAt: new Date() },
      });
      return { success: false, message: 'MAX not linked for this user' };
    }

    const result = userGeneration.outputData || userGeneration.generationRequest?.result;
    if (!result) {
      throw new Error(`No result data for generation: ${generationRequestId}`);
    }

    console.log(
      `[MaxSender] Sending ${userGeneration.generationType} to MAX, result type: ${typeof result}, result length: ${JSON.stringify(result).length}`,
    );

    const sendResult = await this.maxService.sendGenerationResult({
      userId: userGeneration.user.id,
      generationType: userGeneration.generationType,
      result,
      generationRequestId,
    });

    if (!sendResult.success) {
      throw new Error(sendResult.message || 'Failed to send MAX generation result');
    }

    await this.prisma.userGeneration.update({
      where: { id: userGeneration.id },
      data: { sentToMax: true, maxSentAt: new Date() },
    });

    return sendResult;
  }
}
