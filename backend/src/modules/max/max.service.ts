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
    this.apiUrl = this.configService.get<string>('MAX_API_URL') || 'https://api.max.ru/api/v1';
  }

  /**
   * Обработка входящего вебхука от MAX
   */
  async handleWebhook(body: any) {
    try {
      const message = body?.message || body?.event?.message;
      if (!message) return;

      const user = message.from;
      const text = message.text;
      const chatId = message.chat?.id || user.id;

      if (text && text.startsWith('/start')) {
        await this.handleStartCommand(user, chatId);
      }
    } catch (error) {
      this.logger.error('Error handling MAX webhook:', error);
    }
  }

  private async handleStartCommand(user: any, chatId: string | number) {
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
      await this.sendMessage(chatId.toString(), this.getWelcomeMessage(existingUser));
    } else {
      const apiKey = this.generateApiKey();
      const newUser = await this.prisma.appUser.create({
        data: {
          maxId: user.id.toString(),
          chatId: chatId.toString(),
          firstName: user.first_name || 'User',
          lastName: user.last_name || '',
          username: user.username || `max_user_${user.id}`,
          source: 'max',
          apiKey,
          lastAccessAt: new Date(),
        },
      });
      await this.sendMessage(chatId.toString(), this.getWelcomeMessage(newUser));
    }
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
    if (!this.token) return;
    try {
      await axios.post(
        `${this.apiUrl}/messages/send`,
        { chat_id: chatId, text },
        { headers: { Authorization: `Bearer ${this.token}` } },
      );
    } catch (error) {
      this.logger.error('Failed to send text message to MAX', error);
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
      `Открой Mini App (Веб-приложение МАКС) для начала работы!`
    );
  }
}
