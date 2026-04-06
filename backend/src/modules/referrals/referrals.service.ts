import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as crypto from 'crypto';

// Прогрессивная шкала наград за рефералов-учителей
const TEACHER_REWARD_TIERS = [
  { minReferrals: 0, maxReferrals: 3, reward: 50 },
  { minReferrals: 4, maxReferrals: 7, reward: 75 },
  { minReferrals: 8, maxReferrals: Infinity, reward: 100 },
];

// Награда за конверсию (реферал оплатил подписку)
const CONVERSION_REWARD = 200;

// Награда учителю за активного ученика-реферала
const STUDENT_REFERRAL_REWARD = 15;

// Количество сданных заданий для активации ученика-реферала
const STUDENT_ACTIVATION_THRESHOLD = 3;

// Максимум активаций рефералов в месяц
const MAX_MONTHLY_ACTIVATIONS = 30;

// Максимум рефералов в списке (пагинация)
const MAX_REFERRALS_PER_PAGE = 50;

// Milestones и их награды
const MILESTONES = [
  { key: 'students_5', type: 'teacher_student', count: 5, reward: 50 },
  { key: 'students_10', type: 'teacher_student', count: 10, reward: 100 },
  { key: 'teachers_3', type: 'teacher_teacher', count: 3, reward: 100 },
  { key: 'teachers_8', type: 'teacher_teacher', count: 8, reward: 200 },
];

@Injectable()
export class ReferralsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Создать или получить реферальный код учителя
   */
  async getOrCreateReferralCode(userId: string, customCode?: string) {
    // Проверяем существующий код
    const existing = await this.prisma.referralCode.findFirst({
      where: { userId, isActive: true },
    });

    if (existing) {
      return existing;
    }

    // Генерируем или валидируем код
    const code = customCode
      ? await this._validateAndReserveCode(customCode)
      : this._generateCode();

    return this.prisma.referralCode.create({
      data: {
        userId,
        userType: 'teacher',
        code,
      },
    });
  }

  /**
   * Получить реферальный код пользователя
   */
  async getReferralCode(userId: string) {
    return this.prisma.referralCode.findFirst({
      where: { userId, isActive: true },
    });
  }

  /**
   * Применить реферальный код при регистрации нового пользователя.
   * Вся логика внутри транзакции для предотвращения race conditions.
   */
  async applyReferralCode(
    newUserId: string,
    userType: 'teacher' | 'student',
    code: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const referralCode = await tx.referralCode.findUnique({
        where: { code },
      });

      // Унифицированное сообщение об ошибке для предотвращения перебора кодов
      if (!referralCode || !referralCode.isActive) {
        throw new BadRequestException('Недействительный реферальный код');
      }

      if (referralCode.maxUsages && referralCode.usageCount >= referralCode.maxUsages) {
        throw new BadRequestException('Недействительный реферальный код');
      }

      // Защита от самореферала
      if (referralCode.userId === newUserId) {
        throw new BadRequestException('Нельзя использовать собственный реферальный код');
      }

      // Проверка: не был ли пользователь уже приглашён (внутри транзакции)
      const existingReferral = await tx.referral.findUnique({
        where: {
          referredUserId_referredType: {
            referredUserId: newUserId,
            referredType: userType,
          },
        },
      });

      if (existingReferral) {
        return existingReferral;
      }

      // Определяем тип реферала
      const referralType =
        referralCode.userType === 'teacher' && userType === 'teacher'
          ? 'teacher_teacher'
          : referralCode.userType === 'teacher' && userType === 'student'
            ? 'teacher_student'
            : 'student_student';

      // Создаём реферал
      const referral = await tx.referral.create({
        data: {
          referralCodeId: referralCode.id,
          referrerUserId: referralCode.userId,
          referrerType: referralCode.userType,
          referredUserId: newUserId,
          referredType: userType,
          referralType,
          status: 'registered',
        },
      });

      // Обновляем счётчик использований кода
      await tx.referralCode.update({
        where: { id: referralCode.id },
        data: { usageCount: { increment: 1 } },
      });

      // Сохраняем referredByCode в профиле пользователя
      if (userType === 'teacher') {
        await tx.appUser.update({
          where: { id: newUserId },
          data: { referredByCode: code },
        });
      } else {
        await tx.student.update({
          where: { id: newUserId },
          data: { referredByCode: code },
        });
      }

      return referral;
    });
  }

  /**
   * Активировать реферал учитель→учитель (при первой генерации).
   * Проверка лимита и обновление статуса внутри одной транзакции.
   */
  async activateTeacherReferral(referredUserId: string) {
    await this.prisma.$transaction(async (tx) => {
      // Читаем реферал с блокировкой (SELECT внутри транзакции)
      const referral = await tx.referral.findUnique({
        where: {
          referredUserId_referredType: {
            referredUserId,
            referredType: 'teacher',
          },
        },
      });

      if (!referral || referral.status !== 'registered' || referral.rewardGranted) {
        return;
      }

      // Проверяем месячный лимит внутри транзакции
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const monthlyActivations = await tx.referral.count({
        where: {
          referrerUserId: referral.referrerUserId,
          activatedAt: { gte: monthStart },
        },
      });

      if (monthlyActivations >= MAX_MONTHLY_ACTIVATIONS) {
        return;
      }

      // Определяем награду по прогрессивной шкале
      const activatedCount = await tx.referral.count({
        where: {
          referrerUserId: referral.referrerUserId,
          referralType: 'teacher_teacher',
          status: { in: ['activated', 'converted'] },
        },
      });
      const reward = this._getTeacherReward(activatedCount);

      // Обновляем статус реферала
      await tx.referral.update({
        where: { id: referral.id },
        data: {
          status: 'activated',
          rewardGranted: true,
          activatedAt: new Date(),
        },
      });

      // Начисляем кредиты рефереру
      await this._grantCredits(tx, referral.referrerUserId, reward, 'referral_signup',
        `Реферальный бонус за приглашённого учителя`);

      // Начисляем кредиты приглашённому
      await this._grantCredits(tx, referredUserId, reward, 'referral_signup',
        `Бонус за регистрацию по реферальной ссылке`);
    });

    // Уведомления вне транзакции (не критичны для целостности)
    const referral = await this.prisma.referral.findUnique({
      where: {
        referredUserId_referredType: {
          referredUserId,
          referredType: 'teacher',
        },
      },
    });

    if (referral?.status === 'activated') {
      const referredUser = await this.prisma.appUser.findUnique({
        where: { id: referredUserId },
        select: { firstName: true, lastName: true, username: true },
      });
      const referredName = referredUser?.firstName || referredUser?.username || 'Новый учитель';

      await this.notificationsService.createNotification({
        userId: referral.referrerUserId,
        userType: 'teacher',
        type: 'referral_activated',
        title: 'Реферал активирован!',
        message: `${referredName} начал(а) пользоваться платформой по вашей ссылке. Вам начислены кредиты!`,
        metadata: { referralId: referral.id, referredName },
      });

      await this._checkMilestones(referral.referrerUserId);
    }
  }

  /**
   * Обработка сдачи задания учеником (для teacher→student рефералов).
   * Атомарная проверка порога и активация.
   */
  async onStudentSubmission(studentId: string) {
    const activated = await this.prisma.$transaction(async (tx) => {
      const referral = await tx.referral.findUnique({
        where: {
          referredUserId_referredType: {
            referredUserId: studentId,
            referredType: 'student',
          },
        },
      });

      if (!referral || referral.status === 'activated' || referral.rewardGranted) {
        return false;
      }

      // Считаем количество сданных заданий
      const submissionsCount = await tx.submission.count({
        where: { studentId },
      });

      // Обновляем metadata с текущим счётчиком
      await tx.referral.update({
        where: { id: referral.id },
        data: { metadata: { submissionsCount } },
      });

      if (submissionsCount < STUDENT_ACTIVATION_THRESHOLD) {
        return false;
      }

      // Проверяем месячный лимит внутри транзакции
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const monthlyActivations = await tx.referral.count({
        where: {
          referrerUserId: referral.referrerUserId,
          activatedAt: { gte: monthStart },
        },
      });

      if (monthlyActivations >= MAX_MONTHLY_ACTIVATIONS) {
        return false;
      }

      // Активируем реферал
      await tx.referral.update({
        where: { id: referral.id },
        data: {
          status: 'activated',
          rewardGranted: true,
          activatedAt: new Date(),
          metadata: { submissionsCount },
        },
      });

      // Начисляем кредиты учителю
      await this._grantCredits(tx, referral.referrerUserId, STUDENT_REFERRAL_REWARD,
        'referral_student', `Реферальный бонус за активного ученика`);

      return true;
    });

    if (!activated) return;

    // Уведомления вне транзакции
    const referral = await this.prisma.referral.findUnique({
      where: {
        referredUserId_referredType: {
          referredUserId: studentId,
          referredType: 'student',
        },
      },
    });

    if (referral) {
      const student = await this.prisma.student.findUnique({
        where: { id: studentId },
        select: { name: true },
      });

      await this.notificationsService.createNotification({
        userId: referral.referrerUserId,
        userType: 'teacher',
        type: 'referral_activated',
        title: 'Ученик-реферал активирован!',
        message: `${student?.name || 'Ученик'} выполнил(а) ${STUDENT_ACTIVATION_THRESHOLD} заданий. Вам начислено ${STUDENT_REFERRAL_REWARD} кредитов!`,
        metadata: { referralId: referral.id, reward: STUDENT_REFERRAL_REWARD, studentName: student?.name },
      });

      await this._checkMilestones(referral.referrerUserId);
    }
  }

  /**
   * Конверсия реферала (приглашённый учитель оплатил подписку)
   */
  async convertReferral(referredUserId: string) {
    await this.prisma.$transaction(async (tx) => {
      const referral = await tx.referral.findUnique({
        where: {
          referredUserId_referredType: {
            referredUserId,
            referredType: 'teacher',
          },
        },
      });

      if (!referral || referral.conversionRewardGranted) {
        return;
      }

      await tx.referral.update({
        where: { id: referral.id },
        data: {
          status: 'converted',
          conversionRewardGranted: true,
          convertedAt: new Date(),
        },
      });

      // Начисляем конверсионный бонус рефереру
      await this._grantCredits(tx, referral.referrerUserId, CONVERSION_REWARD,
        'referral_conversion', `Бонус за оплату подписки приглашённым учителем`);
    });

    // Уведомления вне транзакции
    const referral = await this.prisma.referral.findUnique({
      where: {
        referredUserId_referredType: {
          referredUserId,
          referredType: 'teacher',
        },
      },
    });

    if (referral?.conversionRewardGranted) {
      const referredUser = await this.prisma.appUser.findUnique({
        where: { id: referredUserId },
        select: { firstName: true, username: true },
      });
      const referredName = referredUser?.firstName || referredUser?.username || 'Приглашённый учитель';

      await this.notificationsService.createNotification({
        userId: referral.referrerUserId,
        userType: 'teacher',
        type: 'referral_converted',
        title: 'Реферал оплатил подписку!',
        message: `${referredName} оплатил(а) подписку! Вам начислено ${CONVERSION_REWARD} кредитов!`,
        metadata: { referralId: referral.id, reward: CONVERSION_REWARD, referredName },
      });
    }
  }

  /**
   * Автоматическое создание реферала учитель→ученик при добавлении ученика в класс
   */
  async createTeacherStudentReferral(teacherId: string, studentId: string) {
    // Проверяем, нет ли уже реферала для этого ученика
    const existing = await this.prisma.referral.findUnique({
      where: {
        referredUserId_referredType: {
          referredUserId: studentId,
          referredType: 'student',
        },
      },
    });

    if (existing) return existing;

    // Получаем или создаём код учителя
    const referralCode = await this.getOrCreateReferralCode(teacherId);

    return this.prisma.referral.create({
      data: {
        referralCodeId: referralCode.id,
        referrerUserId: teacherId,
        referrerType: 'teacher',
        referredUserId: studentId,
        referredType: 'student',
        referralType: 'teacher_student',
        status: 'registered',
      },
    });
  }

  /**
   * Статистика рефералов пользователя
   */
  async getReferralStats(userId: string) {
    const [totalReferrals, activated, converted] = await Promise.all([
      this.prisma.referral.count({ where: { referrerUserId: userId } }),
      this.prisma.referral.count({ where: { referrerUserId: userId, status: 'activated' } }),
      this.prisma.referral.count({ where: { referrerUserId: userId, status: 'converted' } }),
    ]);

    // Подсчитываем заработанные кредиты из CreditTransaction
    const creditTransactions = await this.prisma.creditTransaction.findMany({
      where: {
        userId,
        operationType: { in: ['referral_signup', 'referral_conversion', 'referral_student', 'referral_milestone'] },
      },
      select: { amount: true },
    });

    const creditsEarned = creditTransactions.reduce((sum, t) => sum + t.amount, 0);

    // Milestones
    const milestones = await this.prisma.referralMilestone.findMany({
      where: { userId },
    });

    // Текущий tier
    const activatedTeachers = await this._getActivatedReferralsCount(userId, 'teacher_teacher');
    const currentTier = TEACHER_REWARD_TIERS.find(
      (t) => activatedTeachers >= t.minReferrals && activatedTeachers <= t.maxReferrals,
    ) || TEACHER_REWARD_TIERS[0];

    return {
      totalReferrals,
      activated,
      converted,
      creditsEarned,
      currentTier: {
        rewardPerReferral: currentTier.reward,
        activatedTeachers,
      },
      milestones: milestones.map((m) => ({ milestone: m.milestone, reward: m.reward, grantedAt: m.grantedAt })),
    };
  }

  /**
   * Список рефералов пользователя с пагинацией.
   * Использует batch-запросы вместо N+1.
   */
  async getReferralsList(userId: string, limit = MAX_REFERRALS_PER_PAGE, offset = 0) {
    const safeLimit = Math.min(Math.max(1, limit), MAX_REFERRALS_PER_PAGE);
    const safeOffset = Math.max(0, offset);

    const referrals = await this.prisma.referral.findMany({
      where: { referrerUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
      skip: safeOffset,
    });

    if (referrals.length === 0) return [];

    // Batch-запросы вместо N+1
    const teacherIds = referrals.filter((r) => r.referredType === 'teacher').map((r) => r.referredUserId);
    const studentIds = referrals.filter((r) => r.referredType === 'student').map((r) => r.referredUserId);

    const [teachers, students] = await Promise.all([
      teacherIds.length > 0
        ? this.prisma.appUser.findMany({
            where: { id: { in: teacherIds } },
            select: { id: true, firstName: true, lastName: true, username: true },
          })
        : [],
      studentIds.length > 0
        ? this.prisma.student.findMany({
            where: { id: { in: studentIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const teacherMap = new Map(teachers.map((t) => [t.id, t]));
    const studentMap = new Map(students.map((s) => [s.id, s]));

    return referrals.map((r) => {
      let referredName = 'Пользователь';
      if (r.referredType === 'teacher') {
        const user = teacherMap.get(r.referredUserId);
        referredName = user?.firstName
          ? `${user.firstName} ${user.lastName?.[0] || ''}.`
          : user?.username || 'Учитель';
      } else {
        const student = studentMap.get(r.referredUserId);
        referredName = student?.name || 'Ученик';
      }

      return {
        id: r.id,
        referredName,
        referredType: r.referredType,
        referralType: r.referralType,
        status: r.status,
        rewardGranted: r.rewardGranted,
        conversionRewardGranted: r.conversionRewardGranted,
        createdAt: r.createdAt,
        activatedAt: r.activatedAt,
        convertedAt: r.convertedAt,
      };
    });
  }

  // ========== Приватные методы ==========

  /**
   * Начисление кредитов через extraCredits + запись CreditTransaction
   */
  private async _grantCredits(
    tx: any,
    userId: string,
    amount: number,
    operationType: string,
    description: string,
  ) {
    const subscription = await tx.userSubscription.findUnique({
      where: { userId },
    });

    if (!subscription) return;

    const balanceBefore = subscription.creditsBalance + subscription.extraCredits;

    await tx.userSubscription.update({
      where: { id: subscription.id },
      data: { extraCredits: { increment: amount } },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        subscriptionId: subscription.id,
        type: 'grant',
        amount,
        balanceBefore,
        balanceAfter: balanceBefore + amount,
        operationType,
        generationRequestId: '',
        description,
      },
    });
  }

  /**
   * Количество активированных рефералов по типу
   */
  private async _getActivatedReferralsCount(userId: string, referralType: string): Promise<number> {
    return this.prisma.referral.count({
      where: {
        referrerUserId: userId,
        referralType,
        status: { in: ['activated', 'converted'] },
      },
    });
  }

  /**
   * Прогрессивная награда за учителя-реферала
   */
  private _getTeacherReward(activatedCount: number): number {
    const tier = TEACHER_REWARD_TIERS.find(
      (t) => activatedCount >= t.minReferrals && activatedCount <= t.maxReferrals,
    );
    return tier?.reward || TEACHER_REWARD_TIERS[0].reward;
  }

  /**
   * Проверка и начисление milestones
   */
  private async _checkMilestones(userId: string) {
    for (const milestone of MILESTONES) {
      const existing = await this.prisma.referralMilestone.findUnique({
        where: {
          userId_milestone: { userId, milestone: milestone.key },
        },
      });

      if (existing) continue;

      const count = await this._getActivatedReferralsCount(userId, milestone.type);

      if (count >= milestone.count) {
        await this.prisma.$transaction(async (tx) => {
          await tx.referralMilestone.create({
            data: {
              userId,
              milestone: milestone.key,
              reward: milestone.reward,
            },
          });

          await this._grantCredits(tx, userId, milestone.reward, 'referral_milestone',
            `Milestone бонус: ${milestone.key}`);
        });

        await this.notificationsService.createNotification({
          userId,
          userType: 'teacher',
          type: 'referral_milestone',
          title: 'Достижение разблокировано!',
          message: `Вы достигли milestone "${milestone.key}"! Бонус: +${milestone.reward} кредитов.`,
          metadata: { milestone: milestone.key, reward: milestone.reward },
        });
      }
    }
  }

  /**
   * Валидация кастомного кода
   */
  private async _validateAndReserveCode(code: string): Promise<string> {
    const normalized = code.toUpperCase().trim();

    if (!/^[A-Z0-9_]{4,16}$/.test(normalized)) {
      throw new BadRequestException('Код должен содержать 4-16 символов (латиница, цифры, _)');
    }

    const existing = await this.prisma.referralCode.findUnique({
      where: { code: normalized },
    });

    if (existing) {
      throw new BadRequestException('Этот код уже занят');
    }

    return normalized;
  }

  /**
   * Генерация криптографически стойкого случайного кода
   */
  private _generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(8);
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(bytes[i] % chars.length);
    }
    return code;
  }
}
