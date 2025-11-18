import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Worker для отправки результатов в Telegram
const telegramSendWorker = new Worker(
  'telegram-send',
  async (job) => {
    const { generationRequestId } = job.data;
    console.log(`📤 Processing telegram send job: ${generationRequestId}`);

    // Здесь будет логика отправки в Telegram
    // Пока заглушка
    return { success: true };
  },
  {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    concurrency: 5,
  }
);

telegramSendWorker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

telegramSendWorker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err);
});

console.log('🚀 Worker started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await telegramSendWorker.close();
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
});

