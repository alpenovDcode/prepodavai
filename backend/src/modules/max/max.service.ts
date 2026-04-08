import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HtmlExportService } from '../../common/services/html-export.service';
import * as crypto from 'crypto';
import axios from 'axios';
import * as FormData from 'form-data';

@Injectable()
export class MaxService {
  private readonly logger = new Logger(MaxService.name);
  private token: string;
  private apiUrl: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private readonly htmlExportService: HtmlExportService,
  ) {
    this.token = this.configService.get<string>('MAX_BOT_TOKEN');
    this.apiUrl = this.configService.get<string>('MAX_API_URL') || 'https://platform-api.max.ru';
    
    this.logger.log(`MaxService initialized with API URL: ${this.apiUrl}`);
    if (!this.token) {
      this.logger.error('MAX_BOT_TOKEN is missing in configuration!');
    }
  }

  /**
   * Обработка входящего вебхука от MAX
   */
  async handleWebhook(body: any) {
    try {
      // Ищем текст сообщения и идентификаторы в разных форматах,
      // так как payload MAX может отличаться от Telegram.
      const message = body?.message || body?.event?.message || body?.payload?.message;
      if (!message) {
        this.logger.warn('No message object found in MAX webhook payload');
        return;
      }

      const user = message.from || message.sender;
      const text = message.text || message.content || message.body?.text;
      
      // Reverting to using the user's ID as the primary chatId for the URL, 
      // as it was the only one that didn't give 'dialog.not.found'.
      const chatId = user?.user_id || user?.id || message.chat?.id || message.recipient?.chat_id;

      let userIdForDb = user?.user_id || user?.id;
      if (!user || !chatId || !userIdForDb) {
        this.logger.warn('Could not extract user or chatId from MAX payload');
        return;
      }

      const botUser = { ...user, id: userIdForDb };
      const botUserId = message.recipient?.user_id;
      
      this.logger.log(`Parsed message from ${botUser.username || botUser.id}: ${text} (Target: ${chatId}, Bot: ${botUserId})`);

      if (text && text.startsWith('/start')) {
        // Extract optional argument: "/start link_TOKEN"
        const parts = text.trim().split(/\s+/);
        const payload = parts.length > 1 ? parts[1] : undefined;
        await this.handleStartCommand(botUser, chatId, botUserId, payload);
      }
    } catch (error) {
      this.logger.error('Error handling MAX webhook:', error);
    }
  }

  private async handleStartCommand(user: any, chatId: string | number, botUserId?: number, payload?: string) {
    const chatIdStr = chatId.toString();

    // Handle link token: /start link_TOKEN
    if (payload && payload.startsWith('link_')) {
      const token = payload.slice(5);
      await this.handleLinkToken(user, chatIdStr, token);
      return;
    }

    // Normal /start — only greet existing linked users
    let existingUser = await this.prisma.appUser.findUnique({
      where: { maxId: user.id.toString() },
    });

    if (existingUser) {
      existingUser = await this.prisma.appUser.update({
        where: { id: existingUser.id },
        data: {
          lastAccessAt: new Date(),
          chatId: chatIdStr,
          maxChatId: chatIdStr,
          firstName: user.first_name || existingUser.firstName,
          lastName: user.last_name || existingUser.lastName,
          username: user.username || existingUser.username,
        } as any,
      });
      await this.sendWelcomeMessage(chatIdStr, existingUser, botUserId);
    } else {
      // Not linked — prompt to register on web first
      const webAppUrl = this.configService.get<string>('WEBAPP_URL', 'https://prepodavai.ru');
      await this.sendMessage(
        chatIdStr,
        `Добро пожаловать в PrepodavAI! 🎓\n\n` +
        `Для использования бота сначала зарегистрируйтесь на сайте, а затем привяжите MAX в настройках профиля.\n\n` +
        `После привязки вы сможете получать результаты генерации прямо здесь:\n${webAppUrl}/auth`,
      );
    }
  }

  /**
   * Подтверждение привязки MAX по токену
   */
  private async handleLinkToken(user: any, chatId: string, token: string) {
    const linkToken = await this.prisma.linkToken.findUnique({ where: { token } });

    if (!linkToken || linkToken.platform !== 'max') {
      await this.sendMessage(chatId, '❌ Токен привязки не найден. Попробуйте сгенерировать новый в настройках профиля.');
      return;
    }

    if (linkToken.status !== 'pending') {
      await this.sendMessage(chatId, '⚠️ Этот токен уже использован или истёк. Сгенерируйте новый в настройках профиля.');
      return;
    }

    if (new Date() > linkToken.expiresAt) {
      await this.prisma.linkToken.update({ where: { id: linkToken.id }, data: { status: 'expired' } });
      await this.sendMessage(chatId, '⏰ Токен истёк. Пожалуйста, сгенерируйте новый в настройках профиля.');
      return;
    }

    // Check if this MAX account is already linked to another user
    const alreadyLinked = await this.prisma.appUser.findUnique({
      where: { maxId: user.id.toString() },
    });
    if (alreadyLinked && alreadyLinked.id !== linkToken.userId) {
      await this.sendMessage(chatId, '⚠️ Этот аккаунт MAX уже привязан к другому профилю PrepodavAI.');
      return;
    }

    const platformName = user.username ? `@${user.username}` : user.first_name || `id${user.id}`;

    await this.prisma.$transaction([
      this.prisma.appUser.update({
        where: { id: linkToken.userId },
        data: {
          maxId: user.id.toString(),
          maxChatId: chatId,
          chatId, // backward compat
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

    await this.sendMessage(
      chatId,
      `✅ MAX успешно привязан к вашему аккаунту PrepodavAI!\n\nТеперь вы будете получать результаты генерации прямо здесь.`,
    );
  }

  private async sendWelcomeMessage(chatId: string, appUser: any, botUserId?: number) {
    const text = this.getWelcomeMessage(appUser);
    // Не отправляем кастомные кнопки — MAX сам показывает нативную кнопку
    // мини-приложения (иконка 4 квадрата внизу чата). При открытии через неё
    // MAX инжектирует window.WebApp.initData для авторизации.
    await this.sendMessageWithMarkup(chatId, text);
  }

  /**
   * Отправка результата генерации в MAX
   */
  async sendGenerationResult(params: {
    userId: string;
    generationType: string;
    result: any;
    generationRequestId: string;
  }): Promise<{ success: boolean; message?: string }> {
    const { userId, generationType, result } = params;

    const appUser = await this.prisma.appUser.findUnique({
      where: { id: userId },
    }) as any;

    if (!appUser || !appUser.maxId) {
      return { success: false, message: 'MAX not linked for this user' };
    }

    // maxChatId — основной, chatId — fallback для старых пользователей
    const chatId = appUser.maxChatId || (appUser.source === 'max' ? appUser.chatId : null);
    if (!chatId) {
      return { success: false, message: 'No MAX chatId available' };
    }

    try {
      if (generationType === 'image' || generationType === 'photosession') {
        await this.sendImage(chatId, result);
      } else if (generationType === 'presentation') {
        await this.sendPresentation(chatId, result);
      } else {
        await this.sendTextResult(chatId, generationType, result);
      }
      return { success: true, message: 'Result sent successfully' };
    } catch (error) {
      this.logger.error('Error sending to MAX:', error);
      return { success: false, message: String(error) };
    }
  }

  private async sendMessage(chatId: string, text: string) {
    await this.sendMessageWithMarkup(chatId, text);
  }

  /**
   * Регистрация вебхука в API MAX
   */
  async subscribeWebhook(url: string) {
    if (!this.token) {
      throw new Error('MAX_BOT_TOKEN is missing');
    }

    const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
    const subscriptionUrl = `${baseUrl}/subscriptions`;

    const payload = {
      url,
      update_types: ['message_created', 'bot_started', 'message_callback'],
    };

    this.logger.log(`Registering webhook at MAX: POST ${subscriptionUrl} with URL ${url}`);

    try {
      const response = await axios.post(
        subscriptionUrl,
        payload,
        { headers: { Authorization: this.token } },
      );
      this.logger.log(`Subscription response: ${response.status} ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error: any) {
      const errorData = error?.response?.data ? JSON.stringify(error.response.data) : error.message;
      this.logger.error(`Failed to subscribe webhook: ${errorData}`);
      throw new Error(`Failed to subscribe: ${errorData}`);
    }
  }

  private async sendMessageWithMarkup(chatId: string, text: string, attachments?: any[]) {
    if (!this.token) {
      this.logger.error('MAX_BOT_TOKEN is not defined! Cannot send message.');
      return;
    }
    
    // BACK TO BASICS: Put user_id in query string as it was the only way that parsed the body successfully.
    // Use the provided chatId (which we'll ensure is the chat_id from the webhook).
    const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;
    const url = `${baseUrl}/messages?user_id=${chatId}`;

    try {
      const payload: any = {
        text,
      };

      if (attachments && attachments.length > 0) {
        payload.attachments = attachments;
      }
      
      this.logger.log(`Attempting request to MAX: POST ${url}`);
      
      const response = await axios.post(
        url,
        payload,
        { headers: { Authorization: this.token } },
      );
      this.logger.log(`MAX API response: ${response.status} ${JSON.stringify(response.data)}`);
    } catch (error: any) {
      this.logger.error(
        'Failed to send text message to MAX: ' + 
        (error?.response?.data ? JSON.stringify(error.response.data) : error.message)
      );
    }
  }

  private async sendPresentation(chatId: string, result: any) {
    const exportUrl = result?.exportUrl || result?.pptxUrl || result?.pdfUrl;
    const topic = result?.inputText ? `\n\n📌 Тема: ${result.inputText}` : '';

    if (exportUrl) {
      try {
        const isPptx = exportUrl.toLowerCase().includes('.pptx') || exportUrl.toLowerCase().includes('pptx');
        const ext = isPptx ? 'pptx' : 'pdf';
        const filename = `presentation_${Date.now()}.${ext}`;
        const fileResp = await axios.get(exportUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(fileResp.data);
        await this.uploadAndSendFile(chatId, buffer, filename, `✅ Ваша презентация готова!${topic}`);
        return;
      } catch (error) {
        this.logger.error('[MAX] Failed to download/upload presentation file:', error);
      }
    }

    // Fallback
    await this.sendMessage(
      chatId,
      `✅ Ваша презентация готова!${topic}\n\nПросмотр доступен в веб-версии PrepodavAI.`,
    );
  }

  private async sendImage(chatId: string, result: any) {
    const messageText = `✅ Ваше изображение готово!${result?.prompt ? `\n\n📝 Промпт: ${result.prompt}` : ''}`;
    await this.sendMessage(chatId, messageText + `\n\n[Изображение доступно в веб-версии]`);
  }

  private async sendTextResult(chatId: string, generationType: string, result: any) {
    const content = result?.content || result;
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    const filename = `${generationType}_${new Date().toISOString().split('T')[0]}.pdf`;

    try {
      const htmlPayload = this.extractHtmlPayload(text);
      const htmlContent = htmlPayload.isHtml ? htmlPayload.html : this.wrapPlainTextAsHtml(text);
      const pdfBuffer = await this.htmlExportService.htmlToPdf(htmlContent);
      await this.uploadAndSendFile(chatId, pdfBuffer, filename, '✅ Ваш материал готов!');
      return;
    } catch (error) {
      this.logger.error(`[MAX] PDF generation failed for ${generationType}:`, error);
    }

    // Fallback — без raw HTML
    await this.sendMessage(chatId, `✅ Ваш материал готов!\n\nПросмотр доступен в веб-версии PrepodavAI.`);
  }

  /**
   * Загружает файл в MAX и отправляет как документ.
   * MAX Bot API: POST /uploads?type=file → { url } → multipart POST → { token } → message с attachment.
   */
  private async uploadAndSendFile(chatId: string, buffer: Buffer, filename: string, caption: string) {
    const base = this.apiUrl.endsWith('/') ? this.apiUrl.slice(0, -1) : this.apiUrl;

    // 1. Получаем upload URL
    const uploadUrlResp = await axios.post(
      `${base}/uploads?type=file`,
      {},
      { headers: { Authorization: this.token } },
    );
    const uploadUrl: string = uploadUrlResp.data?.url;
    if (!uploadUrl) throw new Error('MAX did not return upload URL');

    // 2. Загружаем файл через multipart
    const form = new FormData();
    form.append('file', buffer, { filename, contentType: 'application/octet-stream' });
    const uploadResp = await axios.post(uploadUrl, form, {
      headers: { ...form.getHeaders(), Authorization: this.token },
    });

    // Токен может прийти в разных форматах в зависимости от версии API
    const token: string =
      uploadResp.data?.token ||
      uploadResp.data?.attachment?.payload?.token ||
      uploadResp.data?.attachment?.token;
    if (!token) throw new Error('MAX did not return file token');

    // 3. Отправляем сообщение с файловым вложением
    await this.sendMessageWithMarkup(chatId, caption, [
      { type: 'file', payload: { token } },
    ]);
  }

  private looksLikeHtml(value: string): boolean {
    if (!value) return false;
    const trimmed = value.trim();
    return /<!DOCTYPE html/i.test(trimmed) || /<html[\s>]/i.test(trimmed) || /<body[\s>]/i.test(trimmed);
  }

  private extractHtmlPayload(value: string): { isHtml: boolean; html: string } {
    if (!value) return { isHtml: false, html: '' };
    let processed = value.trim();
    if (processed.startsWith('```')) {
      processed = processed.replace(/^```(?:html)?/i, '').replace(/```$/, '').trim();
    }
    if ((processed.startsWith('"') && processed.endsWith('"')) ||
        (processed.startsWith("'") && processed.endsWith("'"))) {
      processed = processed.slice(1, -1);
    }
    const isHtml = this.looksLikeHtml(processed) || /<\/?[a-z][\s\S]*>/i.test(processed);
    return { isHtml, html: processed };
  }

  private wrapPlainTextAsHtml(text: string): string {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n\n+/g, '</p><p>')
      .replace(/\n/g, '<br>');
    return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"/><title>PrepodavAI</title>` +
      `<style>body{font-family:sans-serif;line-height:1.6;padding:24px;color:#1a1a1a}p{margin:12px 0}</style>` +
      `</head><body><p>${escaped}</p></body></html>`;
  }

  private generateApiKey(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private getWelcomeMessage(appUser: any): string {
    return (
      `Добро пожаловать в prepodavAI 🎓\n\n` +
      `🔑 Ваши данные для входа в веб-версию:\n\n` +
      `👤 Username: ${appUser.username}\n` +
      `🔐 API Key: ${appUser.apiKey}\n\n` +
      `⚠️ Сохраните эти данные! Они понадобятся для входа в веб-версию.\n\n` +
      `🌐 Веб-версия: https://prepodavai.ru/\n\n` +
      `Я твой интеллектуальный помощник для:\n` +
      `— Создания учебных материалов\n` +
      `— Планирования уроков\n` +
      `— Проверки работ учеников\n` +
      `— Адаптации контента\n` +
      `— Методической поддержки\n\n` +
      `Открой Mini App (Веб-приложение МАКС) для начала работы!`
    );
  }
}
