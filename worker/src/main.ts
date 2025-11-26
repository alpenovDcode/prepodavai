import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import { Bot, InputFile } from 'grammy';
import * as puppeteer from 'puppeteer';

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

// Puppeteer browser instance (reused across PDF generations)
let browserPromise: Promise<puppeteer.Browser> | null = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });
  }
  return browserPromise;
}

async function htmlToPdf(html: string): Promise<Buffer> {
  console.log(`[HtmlExport] Starting PDF generation, HTML length: ${html.length}`);
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Try to render formulas with MathJax
    try {
      console.log('[HtmlExport] Waiting for MathJax...');
      // @ts-ignore - window exists in browser context
      await page.waitForFunction(() => (window as any).MathJax, { timeout: 5000 }).catch(() => null);

      await page.evaluate(async () => {
        // @ts-ignore - window exists in browser context
        if ((window as any).MathJax && (window as any).MathJax.typesetPromise) {
          console.log('[HtmlExport] MathJax found, starting typeset');
          // @ts-ignore - window exists in browser context
          await (window as any).MathJax.typesetPromise();
        } else {
          console.log('[HtmlExport] MathJax NOT found');
        }
      });

      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (e) {
      console.warn('[HtmlExport] MathJax rendering warning:', e);
    }

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
    });

    console.log(`[HtmlExport] PDF generated successfully, size: ${pdf.length}`);
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

function looksLikeHtml(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return /<!DOCTYPE html/i.test(trimmed) || /<html[\s>]/i.test(trimmed) || /<body[\s>]/i.test(trimmed);
}

function extractHtmlPayload(value: string): { isHtml: boolean; html: string } {
  if (!value) {
    return { isHtml: false, html: '' };
  }

  let processed = value.trim();

  // Remove markdown code blocks ```html ... ```
  if (processed.startsWith('```')) {
    processed = processed.replace(/^```(?:html)?/i, '').replace(/```$/, '').trim();
  }

  // Remove quotes
  if (
    (processed.startsWith('"') && processed.endsWith('"')) ||
    (processed.startsWith("'") && processed.endsWith("'"))
  ) {
    processed = processed.slice(1, -1);
  }

  const isHtml = looksLikeHtml(processed) || /<\/?[a-z][\s\S]*>/i.test(processed);
  return { isHtml, html: processed };
}

function wrapPlainTextAsHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>GigaChat Result</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
      line-height: 1.6;
      padding: 24px;
      background: #ffffff;
      color: #1a1a1a;
    }
    p { margin: 12px 0; }
    .math-inline { font-weight: 500; }
    .math-block { margin: 16px 0; }
    pre {
      background: #f5f5f5;
      padding: 12px;
      border-radius: 8px;
      font-family: "JetBrains Mono", Consolas, monospace;
    }
  </style>
</head>
<body>
  <p>${escaped}</p>
</body>
</html>`;
}

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
        // Текстовый результат - генерируем PDF
        console.log(`[TelegramSender] Sending ${generationType} to Telegram, result type: ${typeof result}`);
        const content = result?.content || result;
        const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

        console.log(`[Telegram] sendTextResult called for ${generationType}, chatId: ${chatId}`);
        const htmlPayload = extractHtmlPayload(text);
        const filename = `${generationType}_${new Date().toISOString().split('T')[0]}_${Date.now()}.pdf`;

        try {
          console.log(`[Telegram] Generating PDF for ${generationType}, text length: ${text.length}`);
          const htmlContent = htmlPayload.isHtml ? htmlPayload.html : wrapPlainTextAsHtml(text);
          console.log(`[Telegram] HTML content prepared, length: ${htmlContent.length}`);

          const pdfBuffer = await htmlToPdf(htmlContent);
          console.log(`[Telegram] PDF generated successfully, size: ${pdfBuffer.length} bytes`);

          await bot.api.sendDocument(chatId, new InputFile(pdfBuffer, filename), {
            caption: '✅ Ваш материал готов! Мы прикрепили его в формате PDF.',
          });
          console.log(`[Telegram] PDF sent successfully to ${chatId}`);
        } catch (error) {
          console.error(`[Telegram] Failed to render PDF for ${generationType}:`, error);
          // Fallback: send text message
          const fallbackText =
            text.length > 3000 ? text.substring(0, 2900) + '\n\n... (полный текст слишком длинный).' : text;
          await bot.api.sendMessage(chatId, fallbackText);
        }
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

