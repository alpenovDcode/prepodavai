import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SmscService } from '../smsc/smsc.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
    private smscService: SmscService,
  ) { }

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
   * Авторизация через username + password
   */
  async login(username: string, pass: string) {
    const user = await this.usersService.findByUsername(username);

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }



    // ... (inside class)

    const isMatch = await bcrypt.compare(pass, user.passwordHash);

    if (!isMatch) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    // Обновляем lastAccessAt
    await this.usersService.updateLastAccess(user.id);

    // Генерируем JWT токен
    const token = this.generateJwtToken(user.id);

    return {
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: 'admin', // Временно хардкодим роль, так как это админский вход
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

  /**
   * Отправка кода подтверждения на телефон
   */
  async sendPhoneVerificationCode(phone: string) {
    // 1. Генерируем код
    const code = Math.floor(1000 + Math.random() * 9000).toString(); // 4 цифры

    // 2. Сохраняем в БД (или обновляем)
    // Удаляем старые коды для этого телефона
    await this.prisma.verificationCode.deleteMany({
      where: { phone, type: 'sms' },
    });

    // Создаем новый
    await this.prisma.verificationCode.create({
      data: {
        phone,
        code,
        type: 'sms',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 минут
      },
    });

    // 3. Отправляем SMS
    const message = `Ваш код подтверждения PrepodavAI: ${code}`;
    const sent = await this.smscService.sendSms(phone, message);

    if (!sent) {
      throw new BadRequestException('Не удалось отправить SMS. Попробуйте позже.');
    }

    return { success: true, message: 'SMS отправлено' };
  }

  /**
   * Вход по номеру телефона и коду
   */
  async loginWithPhone(phone: string, code: string) {
    // 1. Ищем код
    const record = await this.prisma.verificationCode.findFirst({
      where: {
        phone,
        code,
        type: 'sms',
        verified: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!record) {
      throw new UnauthorizedException('Неверный код или срок действия истек');
    }

    // 2. Помечаем как использованный
    await this.prisma.verificationCode.update({
      where: { id: record.id },
      data: { verified: true },
    });

    // 3. Находим или создаем пользователя
    const user = await this.usersService.findOrCreateByPhone(phone);

    // 4. Обновляем lastAccess
    await this.usersService.updateLastAccess(user.id);

    // 5. Генерируем токен
    const token = this.generateJwtToken(user.id);

    return {
      success: true,
      token,
      user: {
        id: user.id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
      },
    };
  }
}
