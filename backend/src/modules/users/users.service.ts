import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Генерация API ключа
   */
  private generateApiKey(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Получить или создать пользователя по Telegram данным
   */
  async getOrCreateByTelegram(data: {
    telegramId: string;
    firstName?: string;
    lastName?: string;
    username?: string;
  }) {
    const { telegramId, firstName, lastName, username } = data;

    // Ищем существующего пользователя
    let appUser = await this.prisma.appUser.findUnique({
      where: { telegramId },
    });

    if (appUser) {
      // Обновляем данные
      appUser = await this.prisma.appUser.update({
        where: { id: appUser.id },
        data: {
          lastAccessAt: new Date(),
          lastTelegramAppAccess: new Date(),
          source: 'telegram',
          chatId: telegramId, // Для личных чатов chatId = telegramId
          firstName: firstName || appUser.firstName,
          lastName: lastName || appUser.lastName,
          username: username || appUser.username,
        },
      });
    } else {
      // Создаем нового пользователя
      const apiKey = this.generateApiKey();
      const userHash = username || `tg_${telegramId}`;

      appUser = await this.prisma.appUser.create({
        data: {
          userHash,
          source: 'telegram',
          telegramId,
          chatId: telegramId,
          username: username || telegramId,
          apiKey,
          firstName: firstName || '',
          lastName: lastName || '',
          lastAccessAt: new Date(),
          lastTelegramAppAccess: new Date(),
        },
      });
    }

    return appUser;
  }

  /**
   * Найти пользователя по ID
   */
  async findById(id: string) {
    return this.prisma.appUser.findUnique({
      where: { id },
    });
  }

  /**
   * Найти пользователя по username и API key
   */
  async findByUsernameAndApiKey(username: string, apiKey: string) {
    return this.prisma.appUser.findFirst({
      where: {
        username,
        apiKey,
      },
    });
  }

  /**
   * Обновить lastAccessAt
   */
  async updateLastAccess(userId: string) {
    return this.prisma.appUser.update({
      where: { id: userId },
      data: { lastAccessAt: new Date() },
    });
  }
}

