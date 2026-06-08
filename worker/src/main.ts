import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import { Bot, BotConfig, Context, InputFile } from 'grammy';
import * as puppeteer from 'puppeteer';
import { HttpsProxyAgent } from 'https-proxy-agent';

dotenv.config();

const prisma = new PrismaClient();
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl);
const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

function buildBotConfig(): BotConfig<Context> {
  const proxyUrl = (
    process.env.TELEGRAM_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    ''
  ).trim();
  if (proxyUrl) {
    const agent = new HttpsProxyAgent(proxyUrl);
    console.log(`[Worker] Routing Telegram egress through proxy: ${new URL(proxyUrl).host}`);
    return { client: { baseFetchConfig: { agent } as any } };
  }
  return {};
}

const bot = new Bot(botToken!, buildBotConfig());

// Puppeteer browser instance (reused across PDF generations)
let browserPromise: Promise<puppeteer.Browser> | null = null;

async function getBrowser(): Promise<puppeteer.Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--disable-crash-reporter',
        '--crash-dumps-dir=/tmp',
        '--disable-extensions',
        '--no-first-run',
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    }).then((browser) => {
      browser.on('disconnected', () => {
        console.warn('[HtmlExport] Chromium disconnected, will restart on next request');
        browserPromise = null;
      });
      return browser;
    }).catch((err) => {
      browserPromise = null;
      throw err;
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
  <title>PrepodavAI Result</title>
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

      // Проверяем, что у пользователя привязан Telegram (независимо от source)
      const chatId = userGeneration.user.telegramChatId || userGeneration.user.chatId;
      if (!userGeneration.user.telegramId || !chatId) {
        console.log(`ℹ️ No Telegram linked for user: ${userGeneration.userId}`);
        await prisma.userGeneration.update({
          where: { id: userGeneration.id },
          data: { sentToTelegram: true, telegramSentAt: new Date() },
        });
        return { success: false, message: 'No Telegram linked' };
      }

      // Отправляем результат в Telegram
      const result = (userGeneration.outputData || userGeneration.generationRequest?.result) as any;

      if (!result) {
        console.error(`❌ No result data for generation: ${generationRequestId}`);
        return { success: false, message: 'No result data' };
      }

      const generationType = userGeneration.generationType;

      if (
        generationType === 'image' ||
        generationType === 'image_generation' ||
        generationType === 'image_edit' ||
        generationType === 'photosession'
      ) {
        // Извлекаем URL из всех возможных форм результата (как в каноничном
        // /image эндпоинте). Раньше брался только result.imageUrl — для
        // image_generation/image_edit/string-результата он пуст, и пользователь
        // получал JSON-PDF вместо картинки.
        const imageUrl: string | null =
          (typeof result === 'string' && /^(https?:\/\/|data:image)/.test(result) ? result : null) ||
          result?.imageUrl ||
          (Array.isArray(result?.imageUrls) ? result.imageUrls[0] : null) ||
          result?.content?.imageUrl ||
          (typeof result?.content === 'string' && /^(https?:\/\/|data:image)/.test(result.content)
            ? result.content
            : null) ||
          null;
        if (!imageUrl) {
          console.error(`❌ No imageUrl in result for generation: ${generationRequestId}`);
          await bot.api.sendMessage(chatId, '✅ Изображение сгенерировано! Просмотрите его в веб-версии Преподавай.');
        } else {
          let caption = `✅ Ваше изображение готово!`;
          if (result?.prompt) caption += `\n\n📝 Промпт: ${result.prompt}`;
          if (result?.style) caption += `\n🎨 Стиль: ${result.style}`;
          if (caption.length > 1024) caption = caption.substring(0, 1021) + '...';
          try {
            await bot.api.sendPhoto(chatId, imageUrl, { caption });
          } catch (err) {
            // Если Telegram не смог сам скачать URL — скачиваем сами и шлём буфером.
            console.warn(`[TelegramSender] sendPhoto by URL failed, fallback to buffer:`, err);
            try {
              const axios = (await import('axios')).default;
              const resp = await axios.get<ArrayBuffer>(imageUrl, { responseType: 'arraybuffer', timeout: 30_000 });
              const buf = Buffer.from(resp.data);
              await bot.api.sendPhoto(chatId, new InputFile(buf, 'image.png'), { caption });
            } catch (err2) {
              console.error(`[TelegramSender] image fallback failed:`, err2);
              await bot.api.sendMessage(chatId, `✅ Изображение готово, ссылка: ${imageUrl}`);
            }
          }
        }
      } else if (generationType === 'presentation') {
        const presentationUrl = result.exportUrl || result.pdfUrl || result.pptxUrl;
        if (!presentationUrl) {
          const gammaLink = result.gammaUrl ? `\n\n🔗 Открыть в Gamma: ${result.gammaUrl}` : '';
          const topic = result.inputText ? `\n\n📌 Тема: ${result.inputText}` : '';
          await bot.api.sendMessage(chatId, `✅ Ваша презентация готова!${topic}${gammaLink}`);
        } else {
          let caption = `✅ Ваша презентация готова!`;
          if (result.inputText) caption += `\n\n📌 Тема: ${result.inputText}`;
          if (result.gammaUrl) caption += `\n\n🔗 Gamma: ${result.gammaUrl}`;
          if (caption.length > 1024) caption = caption.substring(0, 1021) + '...';
          await bot.api.sendDocument(chatId, presentationUrl, { caption });
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
          // Fallback: strip HTML tags before sending as plain text
          const plainText = text.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
          const fallbackText = plainText.length > 3000
            ? plainText.substring(0, 2900) + '\n\n... (полный текст слишком длинный).'
            : plainText;
          await bot.api.sendMessage(chatId, fallbackText || text.substring(0, 3000));
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

      // Отправляем клавиатуру выбора инструмента
      await bot.api.sendMessage(chatId, '🛠️ Выберите инструмент:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📄 Рабочий лист', callback_data: 'g:t:worksheet' }, { text: '📝 Генератор тестов', callback_data: 'g:t:quiz' }],
            [{ text: '📖 Словарь', callback_data: 'g:t:vocabulary' }, { text: '📋 Конструктор уроков', callback_data: 'g:t:lesson-plan' }],
            [{ text: '✨ Вау-урок', callback_data: 'g:t:lesson-preparation' }, { text: '🖼️ Генератор изображений', callback_data: 'g:t:image' }],
            [{ text: '🎮 Обучающая игра', callback_data: 'g:t:game' }, { text: '📊 Презентация', callback_data: 'g:t:presentation' }],
          ],
        },
      }).catch((e: any) => console.warn('[Worker] Failed to send tool keyboard:', e?.message));

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

