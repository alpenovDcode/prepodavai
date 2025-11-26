import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Bot, Context, InputFile } from 'grammy';
import * as crypto from 'crypto';
import { HtmlExportService } from '../../common/services/html-export.service';
import { GigachatService } from '../gigachat/gigachat.service';

@Injectable()
export class TelegramService {
  private bot: Bot;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private readonly htmlExportService: HtmlExportService,
    @Inject(forwardRef(() => GigachatService))
    private readonly gigachatService: GigachatService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (token) {
      this.bot = new Bot(token);
      this.setupHandlers();
    }
  }

  /**
   * Настройка обработчиков бота
   */
  private setupHandlers() {
    // Обработка команды /start
    this.bot.command('start', async (ctx: Context) => {
      const user = ctx.from;
      if (!user) return;

      // Создаем/обновляем пользователя
      const appUser = await this.prisma.appUser.upsert({
        where: { telegramId: user.id.toString() },
        update: {
          lastAccessAt: new Date(),
          chatId: ctx.chat.id.toString(),
        },
        create: {
          userHash: user.username || `tg_${user.id}`,
          source: 'telegram',
          telegramId: user.id.toString(),
          chatId: ctx.chat.id.toString(),
          username: user.username || user.id.toString(),
          apiKey: this.generateApiKey(),
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          lastAccessAt: new Date(),
          lastTelegramAppAccess: new Date(),
        },
      });

      // Отправляем приветственное сообщение
      const welcomeMessage = this.getWelcomeMessage(appUser);
      await ctx.reply(welcomeMessage);
    });
  }

  /**
   * Отправка результата генерации в Telegram
   */
  async sendGenerationResult(params: {
    userId: string;
    generationType: string;
    result: any;
    generationRequestId: string;
  }): Promise<{ success: boolean; message?: string }> {
    const { userId, generationType, result } = params;

    // Находим пользователя
    const appUser = await this.prisma.appUser.findUnique({
      where: { id: userId },
    });

    if (!appUser || appUser.source !== 'telegram') {
      return { success: false, message: 'Not a Telegram user' };
    }

    if (!appUser.chatId) {
      return { success: false, message: 'No chatId available' };
    }

    try {
      // Отправляем в зависимости от типа генерации
      if (generationType === 'image' || generationType === 'photosession') {
        await this.sendImage(appUser.chatId, result);
      } else if (generationType === 'presentation') {
        await this.sendPresentation(appUser.chatId, result);
      } else {
        await this.sendTextResult(appUser.chatId, generationType, result);
      }

      return { success: true, message: 'Result sent successfully' };
    } catch (error) {
      console.error('Error sending to Telegram:', error);
      return { success: false, message: String(error) };
    }
  }

  /**
   * Отправка изображения
   */
  private async sendImage(chatId: string, result: any) {
    const imageUrl = result?.imageUrl;
    if (!imageUrl) return;

    const messageText = `✅ Ваше изображение готово!${result?.prompt ? `\n\n📝 Промпт: ${result.prompt}` : ''
      }${result?.style ? `\n🎨 Стиль: ${result.style}` : ''}`;

    try {
      let photo: string | InputFile = imageUrl;

      // Если это data URL (base64), конвертируем в Buffer
      if (typeof imageUrl === 'string' && imageUrl.startsWith('data:image')) {
        const base64Data = imageUrl.split(',')[1];
        if (base64Data) {
          const buffer = Buffer.from(base64Data, 'base64');
          photo = new InputFile(buffer, 'image.jpg');
        }
      }

      await this.bot.api.sendPhoto(chatId, photo, {
        caption: messageText,
      });
    } catch (error) {
      console.error('Error sending photo to Telegram:', error);
      await this.bot.api.sendMessage(chatId, `⚠️ Не удалось отправить изображение в Telegram, но оно доступно в истории.\n\n${messageText}`);
    }
  }

  /**
   * Отправка презентации
   */
  private async sendPresentation(chatId: string, result: any) {
    if (result.pdfUrl) {
      await this.bot.api.sendDocument(chatId, result.pdfUrl, {
        caption: `✅ Ваша презентация готова (PDF)!${result.inputText ? `\n\n📌 Тема: ${result.inputText}` : ''
          }${result.gammaUrl ? `\n\n🔗 [Открыть в Gamma](${result.gammaUrl})` : ''}`,
        parse_mode: 'Markdown',
      });
    }
  }

  /**
   * Отправка текстового результата
   */
  private async sendTextResult(chatId: string, generationType: string, result: any) {
    console.log(`[Telegram] sendTextResult called for ${generationType}, chatId: ${chatId}`);
    const content = result?.content || result;
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

    const htmlPayload = this.extractHtmlPayload(text);
    const filename = `${generationType}_${new Date().toISOString().split('T')[0]}_${Date.now()}.pdf`;

    try {
      console.log(`[Telegram] Generating PDF for ${generationType}, text length: ${text.length}`);
      const htmlContent = htmlPayload.isHtml ? htmlPayload.html : this.wrapPlainTextAsHtml(text);
      console.log(`[Telegram] HTML content prepared, length: ${htmlContent.length}`);

      const pdfBuffer = await this.htmlExportService.htmlToPdf(htmlContent);
      console.log(`[Telegram] PDF generated successfully, size: ${pdfBuffer.length} bytes`);

      await this.bot.api.sendDocument(chatId, new InputFile(pdfBuffer, filename), {
        caption: '✅ Ваш материал готов! Мы прикрепили его в формате PDF.',
      });
      return;
    } catch (error) {
      console.error(`[Telegram] Failed to render PDF for ${generationType}:`, error);
      // Fallback удален по требованию: отправляем только PDF или ошибку (в логах)
    }

    // Если PDF не сгенерировался, отправляем текстовое сообщение (но не HTML файл)
    const fallbackText =
      text.length > 3000 ? text.substring(0, 2900) + '\n\n... (полный текст слишком длинный).' : text;
    await this.bot.api.sendMessage(chatId, fallbackText);
  }

  private looksLikeHtml(value: string) {
    if (!value) return false;
    const trimmed = value.trim();
    return /<!DOCTYPE html/i.test(trimmed) || /<html[\s>]/i.test(trimmed) || /<body[\s>]/i.test(trimmed);
  }

  private extractHtmlPayload(value: string): { isHtml: boolean; html: string } {
    if (!value) {
      return { isHtml: false, html: '' };
    }

    let processed = value.trim();

    // Убираем markdown-блоки ```html ... ```
    if (processed.startsWith('```')) {
      processed = processed.replace(/^```(?:html)?/i, '').replace(/```$/, '').trim();
    }

    // Иногда ответ окружён кавычками / JSON-строками
    if (
      (processed.startsWith('"') && processed.endsWith('"')) ||
      (processed.startsWith("'") && processed.endsWith("'"))
    ) {
      processed = processed.slice(1, -1);
    }

    const isHtml = this.looksLikeHtml(processed) || /<\/?[a-z][\s\S]*>/i.test(processed);
    return { isHtml, html: processed };
  }

  private wrapPlainTextAsHtml(text: string) {
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


  /**
   * Генерация API ключа
   */
  private generateApiKey(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Приветственное сообщение
   */
  private getWelcomeMessage(appUser: any): string {
    return (
      `Добро пожаловать в prepodavAI 🎓\n\n` +
      `Я твой интеллектуальный помощник для:\n` +
      `— Создания учебных материалов\n` +
      `— Планирования уроков\n` +
      `— Проверки работ учеников\n` +
      `— Адаптации контента\n` +
      `— Методической поддержки\n\n` +
      `Вы зарегистрированы! ✅\n\n` +
      `🔑 Username: ${appUser.username}\n` +
      `🔐 Персональный ключ: ${appUser.apiKey}\n\n` +
      `⚠️ Сохраните эти данные — они понадобятся для входа в веб-версию.\n\n` +
      `🌐 Перейти в веб-версию: https://prrv.pro`
    );
  }
}
