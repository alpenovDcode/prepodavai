import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as crypto from 'crypto';
import axios from 'axios';

@Injectable()
export class MaxService {
  private readonly logger = new Logger(MaxService.name);
  private token: string;
  private apiUrl: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
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
      
      // CRITICAL: In MAX, the dialog ID is often found in message.recipient.chat_id
      const chatId = message.chat?.id || message.recipient?.chat_id || user?.user_id || user?.id;

      let userIdForDb = user?.user_id || user?.id;
      if (!user || !chatId || !userIdForDb) {
        this.logger.warn('Could not extract user or chatId from MAX payload');
        return;
      }

      const botUser = { ...user, id: userIdForDb };
      const botUserId = message.recipient?.user_id;
      
      this.logger.log(`Parsed message from ${botUser.username || botUser.id}: ${text} (Chat: ${chatId}, Bot: ${botUserId})`);

      if (text && text.startsWith('/start')) {
        await this.handleStartCommand(botUser, chatId, botUserId);
      }
    } catch (error) {
      this.logger.error('Error handling MAX webhook:', error);
    }
  }

  private async handleStartCommand(user: any, chatId: string | number, botUserId?: number) {
    let existingUser = await this.prisma.appUser.findUnique({
      where: { maxId: user.id.toString() },
    });

    if (existingUser) {
      existingUser = await this.prisma.appUser.update({
        where: { id: existingUser.id },
        data: {
          lastAccessAt: new Date(),
          chatId: chatId.toString(),
          firstName: user.first_name || existingUser.firstName,
          lastName: user.last_name || existingUser.lastName,
          username: user.username || existingUser.username,
        },
      });
      await this.sendWelcomeMessage(chatId.toString(), existingUser, botUserId);
    } else {
      const apiKey = this.generateApiKey();
      const newUser = await this.prisma.appUser.create({
        data: {
          maxId: user.id.toString(),
          chatId: chatId.toString(),
          firstName: user.first_name || 'User',
          lastName: user.last_name || '',
          username: user.username || `user${user.id}`,
          source: 'max',
          apiKey,
          lastAccessAt: new Date(),
        },
      });
      await this.sendWelcomeMessage(chatId.toString(), newUser, botUserId);
    }
  }

  private async sendWelcomeMessage(chatId: string, appUser: any, botUserId?: number) {
    const text = this.getWelcomeMessage(appUser);
    
    const attachments = [
      {
        type: 'inline_keyboard',
        payload: {
          buttons: [
            [
              {
                type: 'link',
                text: 'Открыть Mini App (Тест)',
                url: 'https://prepodavai.ru',
              },
            ],
          ],
        },
      },
    ];
    await this.sendMessageWithMarkup(chatId, text, attachments);
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
    });

    if (!appUser || appUser.source !== 'max' || !appUser.chatId) {
      return { success: false, message: 'Not a valid MAX user' };
    }

    try {
      if (generationType === 'image' || generationType === 'photosession') {
        await this.sendImage(appUser.chatId, result);
      } else if (generationType === 'presentation') {
        await this.sendMessage(
          appUser.chatId,
          `✅ Ваша презентация готова! Просмотр доступен в веб-версии.`,
        );
      } else {
        await this.sendTextResult(appUser.chatId, generationType, result);
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

  private async sendImage(chatId: string, result: any) {
    const messageText = `✅ Ваше изображение готово!${result?.prompt ? `\n\n📝 Промпт: ${result.prompt}` : ''}`;
    await this.sendMessage(chatId, messageText + `\n\n[Изображение доступно в веб-версии]`);
  }

  private async sendTextResult(chatId: string, generationType: string, result: any) {
    const content = result?.content || result;
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

    const fallbackText =
      text.length > 3000
        ? text.substring(0, 2900) + '\n\n... (полный текст слишком длинный).'
        : text;
    await this.sendMessage(chatId, fallbackText);
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
