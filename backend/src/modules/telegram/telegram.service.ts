import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Bot, Context, InputFile } from 'grammy';
import { HtmlExportService } from '../../common/services/html-export.service';

@Injectable()
export class TelegramService {
  private bot: Bot;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private readonly htmlExportService: HtmlExportService,
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

      // Check for link token argument: /start link_XXXXXXXX
      const payload = ctx.match as string | undefined;
      if (payload && payload.startsWith('link_')) {
        const token = payload.slice(5); // strip "link_" prefix
        await this.handleLinkToken(ctx, user, token);
        return;
      }

      // Normal /start — find existing linked user
      let existingUser = await this.prisma.appUser.findUnique({
        where: { telegramId: user.id.toString() },
      });

      if (existingUser) {
        existingUser = await this.prisma.appUser.update({
          where: { id: existingUser.id },
          data: {
            lastAccessAt: new Date(),
            chatId: ctx.chat.id.toString(),
            telegramChatId: ctx.chat.id.toString(),
            firstName: user.first_name || existingUser.firstName,
            lastName: user.last_name || existingUser.lastName,
            username: user.username || existingUser.username,
          } as any,
        });
        await this.sendWelcomeWithWebApp(ctx, existingUser);
      } else {
        // User not linked — prompt to register on the web
        const webAppUrl = this.configService.get<string>('WEBAPP_URL', 'https://prepodavai.ru');
        await ctx.reply(
          `Добро пожаловать в PrepodavAI! 🎓\n\n` +
          `Для использования бота сначала зарегистрируйтесь на сайте, а затем привяжите Telegram в настройках профиля.\n\n` +
          `После привязки вы сможете получать результаты генерации прямо здесь.`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: '🌐 Зарегистрироваться', url: `${webAppUrl}/auth` }]],
            },
          },
        );
      }
    });
  }

  /**
   * Подтверждение привязки Telegram по токену
   */
  private async handleLinkToken(ctx: Context, user: any, token: string) {
    const linkToken = await this.prisma.linkToken.findUnique({ where: { token } });

    if (!linkToken || linkToken.platform !== 'telegram') {
      await ctx.reply('❌ Токен привязки не найден. Попробуйте сгенерировать новый в настройках профиля.');
      return;
    }

    if (linkToken.status !== 'pending') {
      await ctx.reply('⚠️ Этот токен уже использован или истёк. Сгенерируйте новый в настройках профиля.');
      return;
    }

    if (new Date() > linkToken.expiresAt) {
      await this.prisma.linkToken.update({ where: { id: linkToken.id }, data: { status: 'expired' } });
      await ctx.reply('⏰ Токен истёк. Пожалуйста, сгенерируйте новый в настройках профиля.');
      return;
    }

    // Check if this Telegram account is already linked to another user
    const alreadyLinked = await this.prisma.appUser.findUnique({
      where: { telegramId: user.id.toString() },
    });
    if (alreadyLinked && alreadyLinked.id !== linkToken.userId) {
      await ctx.reply('⚠️ Этот аккаунт Telegram уже привязан к другому профилю PrepodavAI.');
      return;
    }

    const platformName = user.username ? `@${user.username}` : user.first_name || `id${user.id}`;

    // Link the platform and mark token as completed
    const telegramChatId = ctx.chat.id.toString();
    await this.prisma.$transaction([
      this.prisma.appUser.update({
        where: { id: linkToken.userId },
        data: {
          telegramId: user.id.toString(),
          telegramChatId,
          chatId: telegramChatId, // backward compat
          username: user.username || undefined,
          firstName: user.first_name || undefined,
          lastName: user.last_name || undefined,
        } as any,
      }),
      this.prisma.linkToken.update({
        where: { id: linkToken.id },
        data: { status: 'completed', linkedId: user.id.toString(), linkedName: platformName },
      }),
    ]);

    await ctx.reply(
      `✅ Telegram успешно привязан к вашему аккаунту PrepodavAI!\n\n` +
      `Теперь вы будете получать результаты генерации прямо здесь.`,
    );
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
    }) as any;

    if (!appUser || !appUser.telegramId) {
      return { success: false, message: 'Telegram not linked for this user' };
    }

    // telegramChatId — основной, chatId — fallback для старых пользователей
    const chatId = appUser.telegramChatId || (appUser.source === 'telegram' ? appUser.chatId : null);
    if (!chatId) {
      return { success: false, message: 'No Telegram chatId available' };
    }

    // Skip for dummy test user
    if (chatId === '123456789') {
      console.log('[Telegram] Skipping send for test user (dummy chatId)');
      return { success: true, message: 'Skipped for test user' };
    }

    try {
      // Отправляем в зависимости от типа генерации
      if (generationType === 'image' || generationType === 'photosession') {
        await this.sendImage(chatId, result);
      } else if (generationType === 'presentation') {
        await this.sendPresentation(chatId, result);
      } else {
        await this.sendTextResult(chatId, generationType, result);
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

    const messageText = `✅ Ваше изображение готово!${
      result?.prompt ? `\n\n📝 Промпт: ${result.prompt}` : ''
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
      // Если это внешний URL (например, от Replicate), скачиваем его
      else if (
        typeof imageUrl === 'string' &&
        (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))
      ) {
        try {
          const axios = (await import('axios')).default;
          const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
          const buffer = Buffer.from(response.data);
          photo = new InputFile(buffer, 'image.png');
        } catch (downloadError) {
          console.error('Error downloading image:', downloadError);
          // Fallback: try sending URL directly
          photo = imageUrl;
        }
      }

      await this.bot.api.sendPhoto(chatId, photo, {
        caption: messageText,
      });
    } catch (error) {
      console.error('Error sending photo to Telegram:', error);
      await this.bot.api.sendMessage(
        chatId,
        `⚠️ Не удалось отправить изображение в Telegram, но оно доступно в истории.\n\n${messageText}`,
      );
    }
  }

  /**
   * Отправка презентации
   */
  private async sendPresentation(chatId: string, result: any) {
    const exportUrl = result.exportUrl || result.pdfUrl || result.pptxUrl;

    if (!exportUrl) {
      // Check if we have raw presentation data (Replicate)
      if (result.presentation) {
        const message = `✅ Ваша презентация готова!${
          result.inputText ? `\n\n📌 Тема: ${result.inputText}` : ''
        }\n\n🌐 Просмотр доступен в веб-версии: https://prrv.pro`;
        await this.bot.api.sendMessage(chatId, message);
        return;
      }

      // Если нет файла для скачивания, отправляем только ссылку на Gamma
      const message = `✅ Ваша презентация готова!${
        result.inputText ? `\n\n📌 Тема: ${result.inputText}` : ''
      }${result.gammaUrl ? `\n\n🔗 [Открыть в Gamma](${result.gammaUrl})` : ''}`;

      await this.bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      return;
    }

    try {
      // Определяем тип файла по URL
      const isPptx =
        exportUrl.toLowerCase().includes('.pptx') || exportUrl.toLowerCase().includes('pptx');
      const fileExtension = isPptx ? 'pptx' : 'pdf';
      const fileType = isPptx ? 'PPTX' : 'PDF';
      const filename = `presentation_${Date.now()}.${fileExtension}`;

      // Скачиваем файл
      const axios = (await import('axios')).default;
      const response = await axios.get(exportUrl, { responseType: 'arraybuffer' });
      const fileBuffer = Buffer.from(response.data);

      // Отправляем файл в Telegram
      await this.bot.api.sendDocument(chatId, new InputFile(fileBuffer, filename), {
        caption: `✅ Ваша презентация готова (${fileType})!${
          result.inputText ? `\n\n📌 Тема: ${result.inputText}` : ''
        }${result.gammaUrl ? `\n\n🔗 [Открыть в Gamma](${result.gammaUrl})` : ''}`,
        parse_mode: 'Markdown',
      });
    } catch (error) {
      console.error('Error downloading/sending presentation file:', error);
      // Fallback: отправляем только ссылку
      const message = `✅ Ваша презентация готова!${
        result.inputText ? `\n\n📌 Тема: ${result.inputText}` : ''
      }${
        result.gammaUrl ? `\n\n🔗 [Открыть в Gamma](${result.gammaUrl})` : ''
      }${exportUrl ? `\n\n📥 [Скачать файл](${exportUrl})` : ''}`;

      await this.bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
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
      text.length > 3000
        ? text.substring(0, 2900) + '\n\n... (полный текст слишком длинный).'
        : text;
    await this.bot.api.sendMessage(chatId, fallbackText);
  }

  private looksLikeHtml(value: string) {
    if (!value) return false;
    const trimmed = value.trim();
    return (
      /<!DOCTYPE html/i.test(trimmed) || /<html[\s>]/i.test(trimmed) || /<body[\s>]/i.test(trimmed)
    );
  }

  private extractHtmlPayload(value: string): { isHtml: boolean; html: string } {
    if (!value) {
      return { isHtml: false, html: '' };
    }

    let processed = value.trim();

    // Убираем markdown-блоки ```html ... ```
    if (processed.startsWith('```')) {
      processed = processed
        .replace(/^```(?:html)?/i, '')
        .replace(/```$/, '')
        .trim();
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

  /**
   * Отправка приветствия с кнопкой WebApp
   */
  private async sendWelcomeWithWebApp(ctx: Context, appUser: any) {
    const webAppUrl = this.configService.get<string>('WEBAPP_URL', 'https://prepodavai.ru');

    const message = this.getWelcomeMessage(appUser);

    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Открыть PrepodavAI',
              web_app: { url: `${webAppUrl}/dashboard` },
            },
          ],
        ],
      },
    });
  }

  /**
   * Приветственное сообщение
   */
  private getWelcomeMessage(_appUser?: any): string {
    return (
      `Добро пожаловать в prepodavAI 🎓\n\n` +
      `Я твой интеллектуальный помощник для:\n` +
      `— Создания учебных материалов\n` +
      `— Планирования уроков\n` +
      `— Проверки работ учеников\n` +
      `— Адаптации контента\n` +
      `— Методической поддержки\n\n` +
      `Нажмите кнопку ниже, чтобы начать работу!`
    );
  }
}
