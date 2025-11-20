import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import { Bot } from 'grammy';

dotenv.config();

const prisma = new PrismaClient();
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl);
const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

const bot = new Bot(botToken);

// Парсим REDIS_URL для BullMQ (поддерживает пароль)
const redisUrlObj = new URL(redisUrl);
const redisConnection = {
  host: redisUrlObj.hostname,
  port: parseInt(redisUrlObj.port || '6379'),
  ...(redisUrlObj.password && { password: redisUrlObj.password }),
};

// Worker для отправки результатов в Telegram
const telegramSendWorker = new Worker(
  'telegram-send',
  async (job) => {
    const { generationRequestId } = job.data;
    console.log(`📤 Processing telegram send job: ${generationRequestId}`);

    try {
      // Находим генерацию
      const userGeneration = await prisma.userGeneration.findUnique({
        where: { generationRequestId },
        include: {
          user: true,
          generationRequest: true,
        },
      });

      if (!userGeneration) {
        console.error(`❌ Generation not found: ${generationRequestId}`);
        return { success: false, message: 'Generation not found' };
      }

      // Проверяем статус
      if (userGeneration.status !== 'completed') {
        console.warn(`⚠️ Generation not completed: ${generationRequestId}`);
        return { success: false, message: 'Generation not completed' };
      }

      // Проверяем, не была ли уже отправлена
      if (userGeneration.sentToTelegram) {
        console.log(`ℹ️ Already sent: ${generationRequestId}`);
        return { success: true, message: 'Already sent' };
      }

      // Проверяем, что пользователь из Telegram
      if (userGeneration.user.source !== 'telegram') {
        console.log(`ℹ️ Not a Telegram user: ${userGeneration.userId}`);
        // Помечаем как отправленное, чтобы не пытаться снова
        await prisma.userGeneration.update({
          where: { id: userGeneration.id },
          data: { sentToTelegram: true, telegramSentAt: new Date() },
        });
        return { success: false, message: 'Not a Telegram user' };
      }

      const chatId = userGeneration.user.chatId;
      if (!chatId) {
        console.error(`❌ No chatId for user: ${userGeneration.userId}`);
        return { success: false, message: 'No chatId available' };
      }

      // Отправляем результат в Telegram
      const result = (userGeneration.outputData || userGeneration.generationRequest?.result) as any;

      if (!result) {
        console.error(`❌ No result data for generation: ${generationRequestId}`);
        return { success: false, message: 'No result data' };
      }

      const generationType = userGeneration.generationType;

      if (generationType === 'image' || generationType === 'photosession') {
        const imageUrl = result?.imageUrl;
        if (imageUrl) {
          const messageText = `✅ Ваше изображение готово!${result?.prompt ? `\n\n📝 Промпт: ${result.prompt}` : ''
            }${result?.style ? `\n🎨 Стиль: ${result.style}` : ''}`;

          await bot.api.sendPhoto(chatId, imageUrl, { caption: messageText });
        }
      } else if (generationType === 'presentation') {
        if (result.pdfUrl) {
          await bot.api.sendDocument(chatId, result.pdfUrl, {
            caption: `✅ Ваша презентация готова (PDF)!${result.inputText ? `\n\n📌 Тема: ${result.inputText}` : ''
              }${result.gammaUrl ? `\n\n🔗 [Открыть в Gamma](${result.gammaUrl})` : ''}`,
            parse_mode: 'Markdown',
          });
        }
      } else {
        // Текстовый результат
        const content = result?.content || result;
        const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

        // Ограничиваем длину (Telegram limit ~4096 символов)
        const messageText = text.length > 4000 ? text.substring(0, 3900) + '\n\n... (полный текст в приложении)' : text;

        await bot.api.sendMessage(chatId, messageText);
      }

      // Помечаем как отправленное
      await prisma.userGeneration.update({
        where: { id: userGeneration.id },
        data: {
          sentToTelegram: true,
          telegramSentAt: new Date(),
        },
      });

      console.log(`✅ Result sent to Telegram for generation: ${generationRequestId}`);
      return { success: true };

    } catch (error) {
      console.error(`❌ Error processing job ${job.id}:`, error);
      throw error; // BullMQ will retry
    }
  },
  {
    connection: redisConnection,
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

