import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SmscService } from '../smsc/smsc.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

const PHONE_VERIFICATION_BONUS = 50;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private smscService: SmscService,
  ) { }

  /**
   * Отправка кода подтверждения телефона (для уже авторизованного пользователя)
   */
  async sendPhoneVerificationCode(userId: string, phone: string): Promise<void> {
    // Проверяем, не верифицирован ли уже телефон
    const user = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Пользователь не найден');
    if (user.phoneVerified) throw new BadRequestException('Телефон уже подтверждён');

    // Удаляем старые коды для этого телефона
    await this.prisma.verificationCode.deleteMany({
      where: { phone, type: 'sms' },
    });

    const code = crypto.randomInt(1000, 10000).toString(); // 4 цифры

    await this.prisma.verificationCode.create({
      data: {
        phone,
        code,
        type: 'sms',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 минут
      },
    });

    const sent = await this.smscService.sendSms(phone, `Ваш код подтверждения PrepodavAI: ${code}`);
    if (!sent) throw new BadRequestException('Не удалось отправить SMS. Попробуйте позже.');
  }

  /**
   * Подтверждение кода и начисление +50 Токенов (однократно)
   */
  async verifyPhoneAndGrantBonus(userId: string, phone: string, code: string): Promise<{ creditsGranted: number }> {
    const user = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Пользователь не найден');
    if (user.phoneVerified) throw new BadRequestException('Телефон уже подтверждён');

    const record = await this.prisma.verificationCode.findFirst({
      where: { phone, code, type: 'sms', verified: false, expiresAt: { gt: new Date() } },
    });

    if (!record) throw new UnauthorizedException('Неверный код или срок действия истёк');

    await this.prisma.$transaction(async (tx) => {
      // Помечаем код как использованный
      await tx.verificationCode.update({
        where: { id: record.id },
        data: { verified: true },
      });

      // Сохраняем телефон и ставим флаг
      await tx.appUser.update({
        where: { id: userId },
        data: { phone, phoneVerified: true },
      });

      // Начисляем extraCredits
      const subscription = await tx.userSubscription.findUnique({ where: { userId } });
      if (subscription) {
        const balanceBefore = subscription.creditsBalance + subscription.extraCredits;
        await tx.userSubscription.update({
          where: { id: subscription.id },
          data: { extraCredits: { increment: PHONE_VERIFICATION_BONUS } },
        });
        await tx.creditTransaction.create({
          data: {
            userId,
            subscriptionId: subscription.id,
            type: 'grant',
            amount: PHONE_VERIFICATION_BONUS,
            balanceBefore,
            balanceAfter: balanceBefore + PHONE_VERIFICATION_BONUS,
            operationType: 'phone_verification',
            generationRequestId: '',
            description: 'Бонус за подтверждение номера телефона',
          },
        });
      }
    });

    return { creditsGranted: PHONE_VERIFICATION_BONUS };
  }

  /**
   * Смена пароля для авторизованного пользователя
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Пользователь не найден');

    if (user.passwordHash) {
      const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isMatch) throw new UnauthorizedException('Неверный текущий пароль');
    }

    if (newPassword.length < 8) {
      throw new BadRequestException('Новый пароль должен содержать не менее 8 символов');
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.appUser.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });
  }

  /**
   * Генерация пароля: 8 читаемых символов (буквы + цифры, без путаницы)
   */
  private generateApiKey(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from(crypto.randomBytes(8))
      .map((b) => chars[b % chars.length])
      .join('');
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
   * Найти пользователя по username
   */
  async findByUsername(username: string) {
    return this.prisma.appUser.findFirst({
      where: {
        username,
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

  /**
   * Найти или создать пользователя по номеру телефона
   */
  async findOrCreateByPhone(phone: string) {
    let user = await this.prisma.appUser.findFirst({
      // Phone is not unique in schema, but we treat it as unique here
      where: { phone },
    });

    if (!user) {
      const apiKey = this.generateApiKey();
      const userHash = `phone_${phone}`;

      user = await this.prisma.appUser.create({
        data: {
          phone,
          userHash,
          apiKey,
          source: 'web', // Default for phone auth
          phoneVerified: true,
          lastAccessAt: new Date(),
        },
      });
    }

    return user;
  }

  /**
   * Найти или создать пользователя по email
   */
  async findOrCreateByEmail(email: string, firstName?: string, utm?: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    utmLandingPage?: string;
    utmLinkId?: string;
  }) {
    let user = await this.prisma.appUser.findFirst({
      where: { email },
    });

    if (!user) {
      const apiKey = this.generateApiKey();
      const username = email;
      const userHash = `email_${email}`;

      user = await this.prisma.appUser.create({
        data: {
          email,
          username,
          userHash,
          apiKey,
          firstName: firstName || '',
          source: 'web',
          lastAccessAt: new Date(),
          // UTM-параметры и Link ID для бонусов
          utmSource: utm?.utmSource || null,
          utmMedium: utm?.utmMedium || null,
          utmCampaign: utm?.utmCampaign || null,
          utmContent: utm?.utmContent || null,
          utmTerm: utm?.utmTerm || null,
          utmLandingPage: utm?.utmLandingPage || null,
          utmLinkId: utm?.utmLinkId || null,
        } as any,
      });

      // Инкрементируем счётчик регистраций на ссылке
      // Бонусные токены применяются позже — в getOrCreateUserSubscription при создании подписки
      if (utm?.utmLinkId) {
        try {
          await (this.prisma as any).utmLink.update({
            where: { id: utm.utmLinkId },
            data: { registrations: { increment: 1 } },
          });
        } catch (e) { console.error('[UTM] Failed to increment registrations:', e); }
      }
    }

    return user;
  }

  /**
   * Обновить профиль пользователя
   */
  async updateProfile(userId: string, data: any) {
    return this.prisma.appUser.update({
      where: { id: userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        bio: data.bio,
        subject: data.subject,
        grades: data.grades,
        avatar: data.avatar,
        phone: data.phone,
        notifyNewCourse: data.notifyNewCourse,
        notifyStudentProgress: data.notifyStudentProgress,
        notifyWeeklyReport: data.notifyWeeklyReport,
      },
    });
  }
}
