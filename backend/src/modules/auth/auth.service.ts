import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SmscService } from '../smsc/smsc.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

import { StudentsService } from '../students/students.service';
import { EmailService } from '../../common/services/email.service';

@Injectable()
export class AuthService {
  // One-time tokens для MAX mini app (userId -> { token, expiresAt })
  private readonly ottTokens = new Map<string, { userId: string; expiresAt: number }>();

  constructor(
    private usersService: UsersService,
    private studentsService: StudentsService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
    private smscService: SmscService,
    private emailService: EmailService,
  ) {}

  /**
   * Валидация Telegram initData с проверкой подписи
   */
  async validateTelegramInitData(initData: string) {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');

    if (!botToken) {
      throw new UnauthorizedException('Bot token not configured');
    }

    // Telegram SDK иногда передаёт &amp; вместо & (HTML-экранирование)
    const cleanInitData = initData?.replace(/&amp;/g, '&') || '';

    // Парсим initData
    const params = new URLSearchParams(cleanInitData);
    const hash = params.get('hash');

    if (!hash) {
      console.warn('[Auth:TG] Missing hash. Keys:', Array.from(params.keys()));
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
   * Валидация MAX Messenger initData с проверкой подписи
   */
  async validateMaxInitData(initData: string) {
    const botToken = this.configService.get<string>('MAX_BOT_TOKEN');

    if (!botToken) {
      throw new UnauthorizedException('MAX Bot token not configured');
    }

    // MAX SDK тоже может передать &amp; вместо &
    const cleanInitData = initData?.replace(/&amp;/g, '&') || '';

    // Парсим initData
    const params = new URLSearchParams(cleanInitData);
    const hash = params.get('hash');

    if (!hash) {
      throw new UnauthorizedException('Missing hash in initData');
    }

    // Удаляем hash из параметров для проверки
    params.delete('hash');

    // Воссоздаем строку (алфавитный порядок)
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Секретный ключ может вычисляться аналогично Telegram
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      throw new UnauthorizedException('Invalid MAX initData signature');
    }

    const authDate = params.get('auth_date');
    if (authDate) {
      const authTimestamp = parseInt(authDate, 10);
      const now = Math.floor(Date.now() / 1000);
      const maxAge = 24 * 60 * 60; // 24 часа

      if (isNaN(authTimestamp) || now - authTimestamp > maxAge) {
        throw new UnauthorizedException('initData expired');
      }
    }

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

    // Создаем/обновляем пользователя MAX
    let appUser = await this.prisma.appUser.findUnique({
      where: { maxId: userData.id?.toString() },
    });

    if (!appUser) {
      // Ищем по username для возможного слияния, если нужно. Иначе создаём нового
      appUser = await this.prisma.appUser.create({
        data: {
          maxId: userData.id?.toString(),
          firstName: userData.first_name,
          lastName: userData.last_name,
          username: userData.username,
          source: 'max',
          lastMaxAppAccess: new Date(),
          lastAccessAt: new Date(),
        },
      });
    } else {
      appUser = await this.prisma.appUser.update({
        where: { id: appUser.id },
        data: {
          firstName: userData.first_name || appUser.firstName,
          lastName: userData.last_name || appUser.lastName,
          username: userData.username || appUser.username,
          lastMaxAppAccess: new Date(),
          lastAccessAt: new Date(),
        },
      });
    }

    // Генерируем JWT токен
    const token = this.generateJwtToken(appUser.id);

    return {
      success: true,
      userHash: appUser.id,
      token,
      user: {
        id: appUser.id,
        maxId: appUser.maxId,
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

    // Определяем роль пользователя на основе ADMIN_USER_IDS
    const adminUserIds = (this.configService.get<string>('ADMIN_USER_IDS', '') || '')
      .split(',').map(id => id.trim()).filter(Boolean);
    const role = adminUserIds.includes(user.id) ? 'admin' : 'user';

    // Генерируем JWT токен с реальной ролью
    const token = this.generateJwtToken(user.id, role);

    return {
      success: true,
      token,
      userHash: user.id,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role,
      },
    };
  }

  /**
   * Генерация JWT токена
   */
  private generateJwtToken(userId: string, role: string = 'user'): string {
    const payload = { sub: userId, role };
    return this.jwtService.sign(payload);
  }

  /**
   * Валидация JWT токена (для стратегии)
   */
  async validateUser(payload: any) {
    if (payload.role === 'student') {
      // We can't use getStudent because it requires teacherId for check
      // We need a method to find student by ID without teacher check, or just check existence
      // Let's use prisma directly or add a method to StudentsService
      return this.studentsService.findById(payload.sub);
    }
    return this.usersService.findById(payload.sub);
  }

  /**
   * Авторизация студента по коду доступа (устаревший метод)
   */
  async studentLogin(accessCode: string) {
    const student = await this.studentsService.findByAccessCode(accessCode);

    if (!student) {
      throw new UnauthorizedException('Invalid access code');
    }

    const token = this.generateJwtToken(student.id, 'student');

    return {
      success: true,
      token,
      userHash: student.id,
      user: {
        id: student.id,
        name: student.name,
        role: 'student',
      },
    };
  }

  /**
   * Авторизация студента по email и паролю
   */
  async studentLoginWithEmail(email: string, password: string) {
    const student = await this.studentsService.findByEmailAndPassword(email, password);

    if (!student) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const token = this.generateJwtToken(student.id, 'student');

    return {
      success: true,
      token,
      user: {
        id: student.id,
        name: student.name,
        role: 'student',
      },
    };
  }

  /**
   * Отправка кода подтверждения на телефон
   */
  async sendPhoneVerificationCode(phone: string) {
    // 1. Генерируем код
    const code = crypto.randomInt(1000, 10000).toString(); // 4 цифры, криптобезопасный генератор

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
      userHash: user.id,
      user: {
        id: user.id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
      },
    };
  }

  /**
   * Генерация одноразового токена для MAX Mini App автологина.
   * Вызывается при /start, вставляется в URL кнопки.
   */
  generateMaxOtt(userId: string): string {
    // Чистим просроченные токены
    const now = Date.now();
    for (const [token, data] of this.ottTokens.entries()) {
      if (data.expiresAt < now) this.ottTokens.delete(token);
    }

    const token = crypto.randomBytes(24).toString('hex');
    this.ottTokens.set(token, { userId, expiresAt: now + 10 * 60 * 1000 }); // 10 минут
    return token;
  }

  /**
   * Регистрация по email: создаёт пользователя и отправляет приветственное письмо с данными для входа
   */
  async registerByEmail(email: string, firstName?: string) {
    // Проверяем, есть ли уже пользователь с таким email
    const existing = await this.prisma.appUser.findFirst({ where: { email } });
    if (existing) {
      throw new BadRequestException('Пользователь с таким email уже зарегистрирован');
    }

    // Создаём пользователя
    const user = await this.usersService.findOrCreateByEmail(email, firstName);

    // Отправляем приветственное письмо с данными для входа
    await this.emailService.sendWelcomeEmail(user.username, user.apiKey, email);

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
        email: user.email,
        source: user.source,
      },
    };
  }

  /**
   * Валидация OTT токена и выдача JWT.
   * Токен одноразовый — удаляется после использования.
   */
  async validateMaxOtt(token: string) {
    const data = this.ottTokens.get(token);
    if (!data || data.expiresAt < Date.now()) {
      throw new UnauthorizedException('Invalid or expired OTT token');
    }
    this.ottTokens.delete(token);

    const appUser = await this.prisma.appUser.findUnique({ where: { id: data.userId } });
    if (!appUser) throw new UnauthorizedException('User not found');

    await this.prisma.appUser.update({
      where: { id: appUser.id },
      data: { lastAccessAt: new Date() },
    });

    const jwtToken = this.generateJwtToken(appUser.id);
    return {
      success: true,
      token: jwtToken,
      userHash: appUser.id,
      user: {
        id: appUser.id,
        maxId: appUser.maxId,
        username: appUser.username,
        firstName: appUser.firstName,
        lastName: appUser.lastName,
        source: appUser.source,
      },
    };
  }
}
