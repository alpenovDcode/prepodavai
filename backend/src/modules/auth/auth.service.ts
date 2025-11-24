import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Валидация Telegram initData с проверкой подписи
   */
  async validateTelegramInitData(initData: string) {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');

    if (!botToken) {
      throw new UnauthorizedException('Bot token not configured');
    }

    // Парсим initData
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) {
      throw new UnauthorizedException('Missing hash in initData');
    }

    // Удаляем hash из параметров для проверки
    params.delete('hash');

    // Создаем data-check-string (сортировка по ключу)
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Вычисляем секретный ключ
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

    // Вычисляем подпись
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Проверяем подпись
    if (calculatedHash !== hash) {
      throw new UnauthorizedException('Invalid initData signature');
    }

    // Проверяем время (auth_date не должен быть старше 24 часов)
    const authDate = params.get('auth_date');
    if (authDate) {
      const authTimestamp = parseInt(authDate, 10);
      const now = Math.floor(Date.now() / 1000);
      const maxAge = 24 * 60 * 60; // 24 часа

      if (isNaN(authTimestamp) || now - authTimestamp > maxAge) {
        throw new UnauthorizedException('initData expired');
      }
    }

    // Только после проверки подписи парсим данные пользователя
    const userStr = params.get('user');
    if (!userStr) {
      throw new UnauthorizedException('No user data in initData');
    }

    let userData;
    try {
      userData = JSON.parse(userStr);
    } catch (error) {
      throw new UnauthorizedException('Invalid user data format in initData');
    }

    // Создаем/обновляем пользователя
    const appUser = await this.usersService.getOrCreateByTelegram({
      telegramId: userData.id?.toString(),
      firstName: userData.first_name,
      lastName: userData.last_name,
      username: userData.username,
    });

    // Генерируем JWT токен
    const token = this.generateJwtToken(appUser.id);

    return {
      success: true,
      userHash: appUser.id,
      token,
      user: {
        id: appUser.id,
        telegramId: appUser.telegramId,
        username: appUser.username,
        firstName: appUser.firstName,
        lastName: appUser.lastName,
        source: appUser.source,
      },
    };
  }

  /**
   * Авторизация через username + API key
   */
  async loginWithApiKey(username: string, apiKey: string) {
    const user = await this.usersService.findByUsernameAndApiKey(username, apiKey);

    if (!user) {
      throw new UnauthorizedException('Неверный username или персональный ключ');
    }

    // Обновляем lastAccessAt
    await this.usersService.updateLastAccess(user.id);

    // Генерируем JWT токен
    const token = this.generateJwtToken(user.id);

    return {
      success: true,
      token,
      userHash: user.id,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        telegramId: user.telegramId,
        source: user.source,
      },
    };
  }

  /**
   * Генерация JWT токена
   */
  private generateJwtToken(userId: string): string {
    const payload = { sub: userId };
    return this.jwtService.sign(payload);
  }

  /**
   * Валидация JWT токена (для стратегии)
   */
  async validateUser(userId: string) {
    return this.usersService.findById(userId);
  }
}
