import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MaxService } from '../../max/max.service';

@Processor('max-send')
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

    // Idempotency: используем metadata для флага отправки в MAX
    const meta = (userGeneration as any).metadata as Record<string, any> | null;
    if (meta?.sentToMax) {
      return { success: true, message: 'Already sent to MAX' };
    }

    if (!userGeneration.user.maxId) {
      await this.prisma.userGeneration.update({
        where: { id: userGeneration.id },
        data: { metadata: { ...(meta ?? {}), sentToMax: true, maxSentAt: new Date().toISOString() } } as any,
      });
      return { success: false, message: 'MAX not linked for this user' };
    }

    const result = userGeneration.outputData || userGeneration.generationRequest?.result;
    if (!result) {
      throw new Error(`No result data for generation: ${generationRequestId}`);
    }

    const sendResult = await this.maxService.sendGenerationResult({
      userId: userGeneration.user.id,
      generationType: userGeneration.generationType,
      result,
      generationRequestId,
    });

    await this.prisma.userGeneration.update({
      where: { id: userGeneration.id },
      data: { metadata: { ...(meta ?? {}), sentToMax: true, maxSentAt: new Date().toISOString() } } as any,
    });

    return sendResult;
  }
}
