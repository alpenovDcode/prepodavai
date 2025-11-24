import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Bot, Context } from 'grammy';
import * as crypto from 'crypto';

@Injectable()
export class TelegramService {
  private bot: Bot;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
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

    const messageText = `✅ Ваше изображение готово!${
      result?.prompt ? `\n\n📝 Промпт: ${result.prompt}` : ''
    }${result?.style ? `\n🎨 Стиль: ${result.style}` : ''}`;

    await this.bot.api.sendPhoto(chatId, imageUrl, {
      caption: messageText,
    });
  }

  /**
   * Отправка презентации
   */
  private async sendPresentation(chatId: string, result: any) {
    if (result.pdfUrl) {
      await this.bot.api.sendDocument(chatId, result.pdfUrl, {
        caption: `✅ Ваша презентация готова (PDF)!${
          result.inputText ? `\n\n📌 Тема: ${result.inputText}` : ''
        }${result.gammaUrl ? `\n\n🔗 [Открыть в Gamma](${result.gammaUrl})` : ''}`,
        parse_mode: 'Markdown',
      });
    }
  }

  /**
   * Отправка текстового результата
   */
  private async sendTextResult(chatId: string, generationType: string, result: any) {
    const content = result?.content || result;
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

    // Ограничиваем длину (Telegram limit ~4096 символов)
    const messageText =
      text.length > 4000 ? text.substring(0, 3900) + '\n\n... (полный текст в приложении)' : text;

    await this.bot.api.sendMessage(chatId, messageText);
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
