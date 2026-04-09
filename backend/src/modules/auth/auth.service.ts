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

    // Ищем пользователя по telegramId
    const telegramId = userData.id?.toString();
    let appUser = await this.prisma.appUser.findUnique({ where: { telegramId } });

    if (!appUser) {
      // Аккаунт Telegram не привязан ни к одному аккаунту.
      // Возвращаем NOT_REGISTERED — фронтенд покажет экран с просьбой
      // пройти регистрацию в боте (а не просто "привяжи аккаунт на сайте").
      return { success: false, error: 'NOT_REGISTERED' };
    }

    // Обновляем данные профиля
    appUser = await this.prisma.appUser.update({
      where: { id: appUser.id },
      data: {
        lastAccessAt: new Date(),
        lastTelegramAppAccess: new Date(),
        firstName: userData.first_name || appUser.firstName,
        lastName: userData.last_name || appUser.lastName,
        username: userData.username || appUser.username,
      },
    });

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

    // Ищем пользователя по maxId — создавать не будем (регистрация только через веб)
    const maxId = userData.id?.toString();
    let appUser = await this.prisma.appUser.findUnique({ where: { maxId } });

    if (!appUser) {
      // Аккаунт MAX не привязан ни к одному веб-аккаунту
      return { success: false, error: 'NOT_LINKED' };
    }

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
  async registerByEmail(email: string) {
    // Проверяем, есть ли уже пользователь с таким email
    const existing = await this.prisma.appUser.findFirst({ where: { email } });
    if (existing) {
      throw new BadRequestException('Пользователь с таким email уже зарегистрирован');
    }

    // Генерируем 6-значный код
    const code = crypto.randomInt(100000, 1000000).toString();

    // Удаляем старые коды для этого email
    await this.prisma.verificationCode.deleteMany({
      where: { phone: email, type: 'email' },
    });

    // Сохраняем код (поле phone используется как идентификатор — здесь email)
    await this.prisma.verificationCode.create({
      data: {
        phone: email,
        code,
        type: 'email',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 минут
      },
    });

    // Отправляем письмо с кодом
    await this.emailService.sendEmailVerificationCode(email, code);

    return { success: true, pending: true };
  }

  /**
   * Подтверждение email-кода и завершение регистрации
   */
  async verifyEmailCode(email: string, code: string, firstName?: string, utm?: {
    utmSource?: string; utmMedium?: string; utmCampaign?: string;
    utmContent?: string; utmTerm?: string; utmLandingPage?: string; utmLinkId?: string;
  }) {
    const record = await this.prisma.verificationCode.findFirst({
      where: {
        phone: email,
        code,
        type: 'email',
        verified: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!record) {
      throw new UnauthorizedException('Неверный код или срок действия истек');
    }

    // Помечаем код как использованный
    await this.prisma.verificationCode.update({
      where: { id: record.id },
      data: { verified: true },
    });

    // Создаём пользователя
    const user = await this.usersService.findOrCreateByEmail(email, firstName, utm);

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

  // ─────────────────────────────────────────────────────────────────
  // Привязка платформ (Telegram / Max) к web-аккаунту
  // ─────────────────────────────────────────────────────────────────

  /**
   * Генерирует временный токен привязки для авторизованного web-пользователя.
   * Возвращает 8-символьный hex-код и ссылку на бота.
   */
  async generateLinkToken(userId: string, platform: string) {
    if (!['telegram', 'max'].includes(platform)) {
      throw new BadRequestException('Неподдерживаемая платформа');
    }

    // Удаляем старые pending-токены этого пользователя для данной платформы
    await this.prisma.linkToken.deleteMany({
      where: { userId, platform, status: 'pending' },
    });

    // 8 hex-байт = 16 символов, но для отображения берём 8 → удобно читать
    const token = crypto.randomBytes(4).toString('hex').toUpperCase(); // напр. "A3F9C2D1"

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 минут

    await this.prisma.linkToken.create({
      data: { token, userId, platform, expiresAt },
    });

    const deepLink =
      platform === 'telegram'
        ? `https://t.me/${this.configService.get<string>('TELEGRAM_BOT_USERNAME', 'prrv_prepodavAI_bot')}?start=link_${token}`
        : `https://max.ru/${this.configService.get<string>('MAX_BOT_ID', 'id9714075294_bot')}`;

    return { success: true, token, deepLink, expiresAt, platform };
  }

  /**
   * Polling-статус токена привязки для web-клиента.
   */
  async getLinkTokenStatus(token: string, userId: string) {
    const linkToken = await this.prisma.linkToken.findUnique({ where: { token } });

    if (!linkToken || linkToken.userId !== userId) {
      throw new BadRequestException('Токен не найден');
    }

    // Автоматически помечаем истёкшие
    if (linkToken.status === 'pending' && linkToken.expiresAt < new Date()) {
      await this.prisma.linkToken.update({ where: { id: linkToken.id }, data: { status: 'expired' } });
      return { status: 'expired' };
    }

    return {
      status: linkToken.status,
      platform: linkToken.platform,
      linkedName: linkToken.linkedName ?? undefined,
    };
  }

  /**
   * Отвязывает платформу от аккаунта пользователя.
   */
  async unlinkPlatform(userId: string, platform: string) {
    if (!['telegram', 'max'].includes(platform)) {
      throw new BadRequestException('Неподдерживаемая платформа');
    }

    await this.prisma.appUser.update({
      where: { id: userId },
      data: {
        ...(platform === 'telegram'
          ? { telegramId: null, chatId: null, telegramChatId: null }
          : { maxId: null, maxChatId: null }),
      } as any,
    });

    return { success: true };
  }

  /**
   * Возвращает список привязанных платформ пользователя.
   */
  async getUserPlatforms(userId: string) {
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
      select: { telegramId: true, maxId: true, username: true },
    });

    if (!user) throw new BadRequestException('Пользователь не найден');

    return {
      telegram: user.telegramId
        ? { linked: true, platformId: user.telegramId }
        : { linked: false },
      max: user.maxId
        ? { linked: true, platformId: user.maxId }
        : { linked: false },
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
