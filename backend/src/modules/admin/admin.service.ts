import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { EmailService } from '../../common/services/email.service';
import { LogsService } from '../logs/logs.service';
import { ReferralsService } from '../referrals/referrals.service';
import { TelegramService } from '../telegram/telegram.service';
import { MaxService } from '../max/max.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private filesService: FilesService,
    private emailService: EmailService,
    private logsService: LogsService,
    private referralsService: ReferralsService,
    private telegramService: TelegramService,
    private maxService: MaxService,
  ) {}

  /**
   * Смена собственного пароля администратора.
   * Проверяет текущий пароль, хеширует новый и сохраняет в БД.
   * Все старые cookie-сессии продолжат работать (JWT не инвалидируется),
   * но повторный вход уже будет требовать новый пароль.
   */
  async changeOwnPassword(
    adminId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (currentPassword === newPassword) {
      throw new BadRequestException('Новый пароль должен отличаться от текущего');
    }

    const user = await this.prisma.appUser.findUnique({
      where: { id: adminId },
      select: { id: true, passwordHash: true },
    });

    if (!user || !user.passwordHash) {
      throw new NotFoundException('Пользователь не найден или не имеет пароля');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Неверный текущий пароль');
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.appUser.update({
      where: { id: adminId },
      data: { passwordHash: newHash },
    });

    await this.audit('admin_password_changed', adminId, { userId: adminId });
    return { success: true, message: 'Пароль успешно изменён' };
  }

  private async audit(action: string, adminId: string, details?: any) {
    try {
      await this.logsService.saveLog({
        level: 'info',
        category: 'admin_audit',
        message: action,
        data: { adminId, ...details },
        userId: adminId,
      });
    } catch (e) {
      console.error('[AdminAudit] Failed to save audit log:', e);
    }
  }

  // ========== USERS ==========
  async getUsers(limit = 50, offset = 0, search?: string, source?: string) {
    const where: any = {};
    if (source) {
      where.source = source;
    }
    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.appUser.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: {
          include: { plan: true },
        },
      },
    });

    const total = await this.prisma.appUser.count({ where });

    return {
      success: true,
      users: users.map((user) => {
        const { passwordHash, ...rest } = user;
        return {
          ...rest,
          hasPassword: !!passwordHash,
        };
      }),
      total,
      limit,
      offset,
    };
  }

  async getUser(id: string) {
    const user = await this.prisma.appUser.findUnique({
      where: { id },
      select: {
        id: true,
        userHash: true,
        source: true,
        telegramId: true,
        username: true,
        apiKey: true,
        firstName: true,
        lastName: true,
        phone: true,
        phoneVerified: true,
        lastAccessAt: true,
        lastTelegramAppAccess: true,
        createdAt: true,
        updatedAt: true,
        subscription: true,
        creditTransactions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        generations: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            generationRequest: true,
          },
        },
        // Исключаем чувствительные поля: passwordHash
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      user,
    };
  }

  async createUser(data: any, adminId?: string) {
    const { username, password, firstName, lastName, phone, creditsBalance } = data;

    if (!username) {
      throw new BadRequestException('Username is required');
    }

    // Проверяем существование пользователя
    const existing = await this.prisma.appUser.findFirst({
      where: { username },
    });

    if (existing) {
      throw new BadRequestException('User with this username already exists');
    }

    // Хешируем пароль, если передан
    let passwordHash = null;
    if (password) {
      const bcrypt = await import('bcryptjs');
      passwordHash = await bcrypt.hash(password, 10);
    }

    // Генерация пароля
    const crypto = require('crypto');
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const apiKey = Array.from(crypto.randomBytes(8)).map((b: number) => chars[b % chars.length]).join('');
    const userHash = username;

    const user = await this.prisma.appUser.create({
      data: {
        username,
        userHash,
        apiKey,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        phone: phone || null,
        source: 'web',
      },
    });

    // Создаем подписку по умолчанию Starter
    const starterPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { planKey: 'starter' },
    });

    if (starterPlan) {
      const now = new Date();
      const endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + 1);

      // Используем переданный баланс или 100 по умолчанию
      const numCredits = creditsBalance !== undefined ? parseInt(creditsBalance) : 100;

      await this.prisma.userSubscription.create({
        data: {
          userId: user.id,
          planId: starterPlan.id,
          status: 'active',
          creditsBalance: isNaN(numCredits) ? 100 : numCredits,
          extraCredits: 0,
          creditsUsed: 0,
          overageCreditsUsed: 0,
          startDate: now,
          endDate,
          autoRenew: true,
        },
      });
    }

    // Отправляем письмо с доступами
    try {
      if (user.email || user.username) {
        await this.emailService.sendWelcomeEmail(
          user.username,
          apiKey,
          user.email || user.username,
        );
      }
    } catch (error) {
      console.error('[Admin] Failed to send welcome email:', error);
      // Не прерываем процесс создания пользователя, если письмо не отправилось
    }

    const createdUser = await this.prisma.appUser.findUnique({
      where: { id: user.id },
      include: { subscription: true },
    });

    await this.audit('admin.user.create', adminId, { targetUserId: user.id, username });

    return {
      success: true,
      user: createdUser,
      message: 'User created successfully',
    };
  }

  async updateUser(id: string, data: any, adminId?: string) {
    // Whitelist approach: only allow specific fields to be updated
    const ALLOWED_FIELDS = ['firstName', 'lastName', 'phone', 'username', 'email', 'phoneVerified', 'source'] as const;
    const updateData: Record<string, any> = {};
    for (const field of ALLOWED_FIELDS) {
      if (data[field] !== undefined) {
        // Convert empty strings to null for optional fields
        if ((data[field] === '' || data[field] === null) && ['phone', 'lastName'].includes(field)) {
          updateData[field] = null;
        } else if (data[field] !== '' && data[field] !== null) {
          updateData[field] = data[field];
        }
      }
    }

    // Hash password separately if provided
    const password = data.password;
    const creditsBalance = data.creditsBalance;
    const planKey = data.planKey;

    // Хешируем новый пароль, если он передан
    if (password) {
      const bcrypt = await import('bcryptjs');
      (updateData as any).passwordHash = await bcrypt.hash(password, 10);
    }

    // Обновляем пользователя
    let user: Awaited<ReturnType<typeof this.prisma.appUser.update>> & {
      subscription: any;
    };
    try {
      user = await this.prisma.appUser.update({
        where: { id },
        data: updateData,
        include: {
          subscription: { include: { plan: true } },
        },
      });
    } catch (err: any) {
      console.error('[AdminService.updateUser] Prisma error', {
        userId: id,
        fields: Object.keys(updateData),
        code: err?.code,
        meta: err?.meta,
        message: err?.message,
      });
      if (err?.code === 'P2025') {
        throw new NotFoundException(`Пользователь ${id} не найден`);
      }
      if (err?.code === 'P2002') {
        const target = Array.isArray(err?.meta?.target)
          ? err.meta.target.join(', ')
          : err?.meta?.target ?? 'поле';
        throw new BadRequestException(`Значение уже занято: ${target}`);
      }
      throw new BadRequestException(
        `Не удалось обновить пользователя: ${err?.message || 'unknown error'}`,
      );
    }

    // Если передан creditsBalance, обновляем подписку пользователя
    if (creditsBalance !== undefined) {
      const numCredits = parseInt(creditsBalance);
      if (!isNaN(numCredits) && user.subscription) {
        await this.prisma.userSubscription.update({
          where: { id: user.subscription.id },
          data: { creditsBalance: numCredits },
        });
        (user.subscription as any).creditsBalance = numCredits;
      }
    }

    // Если передан planKey, меняем тариф
    if (planKey && user.subscription) {
      const newPlan = await this.prisma.subscriptionPlan.findUnique({ where: { planKey } });
      if (newPlan) {
        await this.prisma.userSubscription.update({
          where: { id: user.subscription.id },
          data: { planId: newPlan.id },
        });
        (user.subscription as any).plan = newPlan;
      }
    }

    await this.audit('admin.user.update', adminId, { targetUserId: id, fields: Object.keys(updateData).concat(planKey ? ['planKey'] : []) });

    return {
      success: true,
      user,
      message: 'User updated successfully',
    };
  }

  async deleteUser(id: string, adminId?: string) {
    // Удаляем связанные записи
    await this.prisma.creditTransaction.deleteMany({ where: { userId: id } });
    await this.prisma.userGeneration.deleteMany({ where: { userId: id } });
    await this.prisma.userSubscription.deleteMany({ where: { userId: id } });
    await this.prisma.generationRequest.deleteMany({ where: { userId: id } });

    const user = await this.prisma.appUser.delete({
      where: { id },
    });

    await this.audit('admin.user.delete', adminId, { targetUserId: id });

    return {
      success: true,
      message: 'User deleted successfully',
      user,
    };
  }

  // ========== GENERATIONS ==========
  async getGenerations(limit = 50, offset = 0) {
    const generations = await this.prisma.generationRequest.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        userGeneration: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    const total = await this.prisma.generationRequest.count();

    return {
      success: true,
      generations,
      total,
      limit,
      offset,
    };
  }

  async getGeneration(id: string) {
    const generation = await this.prisma.generationRequest.findUnique({
      where: { id },
      include: {
        userGeneration: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!generation) {
      throw new NotFoundException('Generation not found');
    }

    return {
      success: true,
      generation,
    };
  }

  async updateGeneration(id: string, data: any, adminId?: string) {
    const { id: _, createdAt, updatedAt, userId, user, userGeneration, ...updateData } = data;

    // Валидация статуса
    if (updateData.status && !['pending', 'completed', 'failed'].includes(updateData.status)) {
      throw new BadRequestException('Invalid status value');
    }

    // Валидация result (должен быть JSON)
    if (updateData.result && typeof updateData.result === 'string') {
      try {
        updateData.result = JSON.parse(updateData.result);
      } catch (e) {
        // Оставляем как строку если не валидный JSON
      }
    }

    const generation = await this.prisma.generationRequest.update({
      where: { id },
      data: updateData,
      include: {
        userGeneration: true,
      },
    });

    await this.audit('admin.generation.update', adminId, { generationId: id });

    return {
      success: true,
      generation,
      message: 'Generation updated successfully',
    };
  }

  async deleteGeneration(id: string, adminId?: string) {
    // Удаляем связанные записи
    const generation = await this.prisma.generationRequest.findUnique({
      where: { id },
      include: { userGeneration: true },
    });

    if (!generation) {
      throw new NotFoundException('Generation not found');
    }

    if (generation.userGeneration) {
      await this.prisma.userGeneration.delete({
        where: { id: generation.userGeneration.id },
      });
    }

    await this.prisma.generationRequest.delete({
      where: { id },
    });

    await this.audit('admin.generation.delete', adminId, { generationId: id });

    return {
      success: true,
      message: 'Generation deleted successfully',
    };
  }

  // ========== SUBSCRIPTIONS ==========
  async getSubscriptions(limit = 50, offset = 0) {
    const subscriptions = await this.prisma.userSubscription.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
        plan: true,
      },
    });

    const total = await this.prisma.userSubscription.count();

    return {
      success: true,
      subscriptions,
      total,
      limit,
      offset,
    };
  }

  async getSubscription(id: string) {
    const subscription = await this.prisma.userSubscription.findUnique({
      where: { id },
      include: {
        user: true,
        plan: true,
        transactions: {
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return {
      success: true,
      subscription,
    };
  }

  async updateSubscription(id: string, data: any, adminId?: string) {
    const { id: _, createdAt, updatedAt, user, plan, creditTransactions, ...updateData } = data;

    // Преобразуем userId и planId если они пришли как объекты
    if (updateData.userId && typeof updateData.userId === 'object') {
      updateData.userId = updateData.userId.id || updateData.userId;
    }
    if (updateData.planId && typeof updateData.planId === 'object') {
      updateData.planId = updateData.planId.id || updateData.planId;
    }

    // Валидация числовых полей
    if (updateData.creditsBalance !== undefined) {
      updateData.creditsBalance = parseInt(updateData.creditsBalance) || 0;
    }
    if (updateData.extraCredits !== undefined) {
      updateData.extraCredits = parseInt(updateData.extraCredits) || 0;
    }
    if (updateData.creditsUsed !== undefined) {
      updateData.creditsUsed = parseInt(updateData.creditsUsed) || 0;
    }
    if (updateData.overageCreditsUsed !== undefined) {
      updateData.overageCreditsUsed = parseInt(updateData.overageCreditsUsed) || 0;
    }

    // Валидация boolean полей
    if (updateData.autoRenew !== undefined) {
      updateData.autoRenew = updateData.autoRenew === true || updateData.autoRenew === 'true';
    }

    const subscription = await this.prisma.userSubscription.update({
      where: { id },
      data: updateData,
      include: {
        user: true,
        plan: true,
      },
    });

    await this.audit('admin.subscription.update', adminId, { subscriptionId: id });

    // Реферальная система: если план изменился на платный — конверсия реферала
    if (updateData.planId && subscription.plan.planKey !== 'starter') {
      this.referralsService.convertReferral(subscription.userId).catch(() => {});
    }

    return {
      success: true,
      subscription,
      message: 'Subscription updated successfully',
    };
  }

  // ========== TRANSACTIONS ==========
  async getTransactions(limit = 50, offset = 0) {
    const transactions = await this.prisma.creditTransaction.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
        subscription: {
          include: {
            plan: true,
          },
        },
      },
    });

    const total = await this.prisma.creditTransaction.count();

    return {
      success: true,
      transactions,
      total,
      limit,
      offset,
    };
  }

  // ========== FILES ==========
  async getFiles() {
    const files = await this.filesService.listFiles();
    return {
      success: true,
      files,
      total: files.length,
    };
  }

  async deleteFile(hash: string, adminId?: string) {
    const result = await this.filesService.deleteFile(hash, undefined, true);
    if (!result) {
      throw new NotFoundException('File not found');
    }
    await this.audit('admin.file.delete', adminId, { fileHash: hash });

    return {
      success: true,
      message: 'File deleted successfully',
    };
  }

  // ========== SYSTEM LOGS ==========
  async getSystemLogs(limit = 50, offset = 0) {
    const logs = await this.prisma.systemLog.findMany({
      take: limit,
      skip: offset,
      orderBy: { timestamp: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    const total = await this.prisma.systemLog.count();

    return {
      success: true,
      logs,
      total,
      limit,
      offset,
    };
  }

  // ========== STATISTICS ==========
  async getStats() {
    const [
      totalUsers,
      activeUsers,
      totalGenerations,
      completedGenerations,
      totalSubscriptions,
      activeSubscriptions,
      totalCredits,
      totalTransactions,
    ] = await Promise.all([
      this.prisma.appUser.count(),
      this.prisma.appUser.count({
        where: {
          lastAccessAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Последние 30 дней
          },
        },
      }),
      this.prisma.generationRequest.count(),
      this.prisma.generationRequest.count({
        where: { status: 'completed' },
      }),
      this.prisma.userSubscription.count(),
      this.prisma.userSubscription.count({
        where: { status: 'active' },
      }),
      this.prisma.userSubscription.aggregate({
        _sum: {
          creditsBalance: true,
        },
      }),
      this.prisma.creditTransaction.count(),
    ]);

    return {
      success: true,
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
        },
        generations: {
          total: totalGenerations,
          completed: completedGenerations,
          pending: totalGenerations - completedGenerations,
        },
        subscriptions: {
          total: totalSubscriptions,
          active: activeSubscriptions,
        },
        credits: {
          total: totalCredits._sum.creditsBalance || 0,
        },
        transactions: {
          total: totalTransactions,
        },
      },
    };
  }

  // ========== TARIFF ANALYTICS ==========
  async getTariffAnalytics() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      orderBy: { price: 'asc' },
    });

    const planStats = await Promise.all(
      plans.map(async (plan) => {
        const [count, credits, newThisMonth] = await Promise.all([
          this.prisma.userSubscription.count({ where: { planId: plan.id, status: 'active' } }),
          this.prisma.userSubscription.aggregate({
            where: { planId: plan.id, status: 'active' },
            _sum: { creditsBalance: true, extraCredits: true },
          }),
          this.prisma.userSubscription.count({
            where: {
              planId: plan.id,
              createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            },
          }),
        ]);
        return {
          plan,
          count,
          totalCredits: (credits._sum.creditsBalance || 0) + (credits._sum.extraCredits || 0),
          newThisMonth,
          mrr: count * Number(plan.price),
        };
      }),
    );

    const totalActive = planStats.reduce((sum, p) => sum + p.count, 0);
    const totalMrr = planStats.reduce((sum, p) => sum + p.mrr, 0);

    const recentChanges = await this.prisma.userSubscription.findMany({
      take: 20,
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, firstName: true, lastName: true } },
        plan: true,
      },
    });

    return {
      success: true,
      plans: planStats,
      totalActive,
      totalMrr,
      recentChanges,
    };
  }

  // ========== CREDIT COSTS ==========
  async getCreditCosts() {
    const costs = await this.prisma.creditCost.findMany({
      orderBy: { creditCost: 'asc' },
    });

    return {
      success: true,
      costs,
    };
  }

  async updateCreditCost(
    operationType: string,
    data: { creditCost?: number; isUnderMaintenance?: boolean },
    adminId?: string,
  ) {
    const cost = await this.prisma.creditCost.update({
      where: { operationType },
      data,
    });

    await this.audit('admin.creditCost.update', adminId, { operationType, ...data });

    return {
      success: true,
      cost,
      message: 'Credit cost updated successfully',
    };
  }

  // ========== USER DETAILED STATS ==========
  async getUserStats(userId: string) {
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, firstName: true, lastName: true,
        source: true, createdAt: true,
        email: true, phone: true, phoneVerified: true,
        bio: true, subject: true, grades: true, avatar: true,
        telegramId: true, maxId: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const prismaAny = this.prisma as any;
    const [
      generationsTotal,
      generationsByType,
      classesCount,
      studentsCount,
      referralsInvited,
      referralsConverted,
      subscription,
      onboardingSteps,
      creditsSpent,
      creditsGranted,
      recentGenerations,
    ] = await Promise.all([
      this.prisma.userGeneration.count({ where: { userId } }),
      this.prisma.userGeneration.groupBy({
        by: ['generationType'],
        where: { userId },
        _count: { generationType: true },
      }),
      this.prisma.class.count({ where: { teacherId: userId } }),
      this.prisma.student.count({
        where: { class: { teacherId: userId } },
      }),
      this.prisma.referral.count({ where: { referrerUserId: userId } }),
      this.prisma.referral.count({ where: { referrerUserId: userId, status: 'converted' } }),
      this.prisma.userSubscription.findUnique({
        where: { userId },
        include: { plan: { select: { planName: true, planKey: true } } },
      }),
      prismaAny.onboardingQuestStep.findMany({ where: { userId } }),
      this.prisma.creditTransaction.aggregate({
        where: { userId, type: 'debit' },
        _sum: { amount: true },
      }),
      this.prisma.creditTransaction.aggregate({
        where: { userId, type: { in: ['credit', 'grant', 'monthly_reset'] } },
        _sum: { amount: true },
      }),
      this.prisma.userGeneration.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, generationType: true, status: true, creditCost: true, createdAt: true },
      }),
    ]);

    return {
      success: true,
      stats: {
        user,
        generations: {
          total: generationsTotal,
          byType: generationsByType.map((g) => ({ type: g.generationType, count: g._count.generationType })),
          recent: recentGenerations,
        },
        classes: { count: classesCount, studentsTotal: studentsCount },
        referrals: { invited: referralsInvited, converted: referralsConverted },
        subscription: subscription
          ? {
              plan: subscription.plan.planName,
              planKey: subscription.plan.planKey,
              status: subscription.status,
              creditsBalance: subscription.creditsBalance,
              creditsUsed: subscription.creditsUsed,
              endDate: subscription.endDate,
            }
          : null,
        onboarding: { completedSteps: onboardingSteps.map((s) => s.step) },
        credits: {
          spent: Math.abs(creditsSpent._sum.amount || 0),
          granted: creditsGranted._sum.amount || 0,
        },
      },
    };
  }

  // ========== ANALYTICS ==========
  async getAnalytics(period: 'week' | 'month' | 'quarter' = 'month') {
    const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [registrations, generations, tokensStat, genByType, sourceBreakdown, conversionFunnel] =
      await Promise.all([
        // Регистрации по дням
        this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT DATE_TRUNC('day', "createdAt")::date::text as date, COUNT(*) as count
          FROM app_users
          WHERE "createdAt" >= ${since}
          GROUP BY DATE_TRUNC('day', "createdAt")
          ORDER BY date ASC
        `,
        // Генерации по дням
        this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT DATE_TRUNC('day', "createdAt")::date::text as date, COUNT(*) as count
          FROM user_generations
          WHERE "createdAt" >= ${since}
          GROUP BY DATE_TRUNC('day', "createdAt")
          ORDER BY date ASC
        `,
        // Токены: потрачено vs начислено по дням
        this.prisma.$queryRaw<{ date: string; spent: bigint; granted: bigint }[]>`
          SELECT
            DATE_TRUNC('day', "createdAt")::date::text as date,
            SUM(CASE WHEN type = 'debit' THEN ABS(amount) ELSE 0 END) as spent,
            SUM(CASE WHEN type IN ('credit','grant','monthly_reset') THEN amount ELSE 0 END) as granted
          FROM credit_transactions
          WHERE "createdAt" >= ${since}
          GROUP BY DATE_TRUNC('day', "createdAt")
          ORDER BY date ASC
        `,
        // Генерации по типам
        this.prisma.userGeneration.groupBy({
          by: ['generationType'],
          where: { createdAt: { gte: since } },
          _count: { generationType: true },
          orderBy: { _count: { generationType: 'desc' } },
        }),
        // Источники пользователей
        this.prisma.appUser.groupBy({
          by: ['source'],
          _count: { source: true },
        }),
        // Воронка конверсии (totals)
        Promise.all([
          this.prisma.appUser.count(),
          this.prisma.userGeneration.groupBy({ by: ['userId'], _count: true }).then((r) => r.length),
          this.prisma.referral.groupBy({ by: ['referrerUserId'], _count: true }).then((r) => r.length),
          this.prisma.userSubscription.count({ where: { plan: { planKey: { not: 'starter' } } } }),
        ]),
      ]);

    const toNum = (v: bigint | number) => (typeof v === 'bigint' ? Number(v) : v);

    return {
      success: true,
      period,
      registrations: registrations.map((r) => ({ date: r.date, count: toNum(r.count) })),
      generations: generations.map((g) => ({ date: g.date, count: toNum(g.count) })),
      tokens: tokensStat.map((t) => ({
        date: t.date,
        spent: toNum(t.spent),
        granted: toNum(t.granted),
      })),
      generationsByType: genByType.map((g) => ({
        type: g.generationType,
        count: g._count.generationType,
      })),
      sourceBreakdown: sourceBreakdown.map((s) => ({
        source: s.source || 'unknown',
        count: s._count.source,
      })),
      conversionFunnel: {
        totalUsers: conversionFunnel[0],
        usersWithGenerations: conversionFunnel[1],
        usersWithReferrals: conversionFunnel[2],
        paidSubscriptions: conversionFunnel[3],
      },
    };
  }

  // ========== CLASSES OVERVIEW ==========
  async getClasses(limit = 50, offset = 0, search?: string) {
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { teacher: { username: { contains: search, mode: 'insensitive' } } },
        { teacher: { firstName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const classes = await this.prisma.class.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        teacher: { select: { id: true, username: true, firstName: true, lastName: true } },
        _count: { select: { students: true, assignments: true } },
      },
    });

    const total = await this.prisma.class.count({ where });

    return { success: true, classes, total, limit, offset };
  }

  async getClassStudents(classId: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        teacher: { select: { id: true, username: true, firstName: true } },
        students: {
          include: {
            _count: { select: { assignments: true, submissions: true } },
          },
        },
        _count: { select: { assignments: true } },
      },
    });
    if (!cls) throw new NotFoundException('Class not found');
    return { success: true, class: cls };
  }

  // ========== BULK CREDIT GRANT ==========
  async bulkGrantCredits(
    data: {
      userIds?: string[];
      filter?: { source?: string; planKey?: string; hasGenerations?: boolean };
      amount: number;
      description: string;
    },
    adminId?: string,
  ) {
    if (!data.amount || data.amount <= 0) throw new BadRequestException('Amount must be positive');

    let userIds = data.userIds || [];

    // Если фильтр, а не список ID — формируем список
    if (!userIds.length && data.filter) {
      const where: any = {};
      if (data.filter.source) where.source = data.filter.source;
      if (data.filter.hasGenerations) where.generations = { some: {} };

      const users = await this.prisma.appUser.findMany({
        where,
        select: { id: true },
        ...(data.filter.planKey
          ? {
              where: {
                ...where,
                subscription: { plan: { planKey: data.filter.planKey } },
              },
            }
          : {}),
      });
      userIds = users.map((u) => u.id);
    }

    if (!userIds.length) throw new BadRequestException('No users matched');

    // Начисляем каждому
    let successCount = 0;
    for (const userId of userIds) {
      try {
        const sub = await this.prisma.userSubscription.findUnique({ where: { userId } });
        if (!sub) continue;

        await this.prisma.userSubscription.update({
          where: { userId },
          data: { extraCredits: { increment: data.amount } },
        });

        await this.prisma.creditTransaction.create({
          data: {
            userId,
            subscriptionId: sub.id,
            type: 'grant',
            amount: data.amount,
            balanceBefore: sub.creditsBalance + sub.extraCredits,
            balanceAfter: sub.creditsBalance + sub.extraCredits + data.amount,
            description: data.description || 'Admin bulk grant',
          },
        });
        successCount++;
      } catch (e) {
        console.error(`[BulkGrant] Failed for user ${userId}:`, e);
      }
    }

    await this.audit('admin.credits.bulkGrant', adminId, {
      userIds: userIds.length,
      amount: data.amount,
      successCount,
    });

    return { success: true, message: `Начислено ${data.amount} токенов ${successCount} пользователям` };
  }

  // ========== BROADCAST ==========
  async broadcast(
    data: {
      message: string;
      platforms: ('telegram' | 'max')[];
      userIds?: string[];
      filter?: { source?: string };
    },
    adminId?: string,
  ) {
    if (!data.message?.trim()) throw new BadRequestException('Message is required');

    let userIds = data.userIds || [];

    if (!userIds.length) {
      const where: any = {};
      if (data.filter?.source) where.source = data.filter.source;

      const users = await this.prisma.appUser.findMany({
        where,
        select: { id: true },
      });
      userIds = users.map((u) => u.id);
    }

    const users = await this.prisma.appUser.findMany({
      where: { id: { in: userIds } },
      select: { id: true, telegramId: true, maxId: true },
    });

    let sentTelegram = 0;
    let sentMax = 0;
    const errors: string[] = [];

    for (const user of users) {
      if (data.platforms.includes('telegram') && user.telegramId) {
        try {
          await this.telegramService.sendBroadcastMessage(user.telegramId, data.message);
          sentTelegram++;
        } catch (e) {
          errors.push(`TG ${user.id}: ${(e as any).message}`);
        }
      }
      if (data.platforms.includes('max') && user.maxId) {
        try {
          await this.maxService.sendBroadcastMessage(user.maxId, data.message);
          sentMax++;
        } catch (e) {
          errors.push(`MAX ${user.id}: ${(e as any).message}`);
        }
      }
    }

    await this.audit('admin.broadcast', adminId, { sentTelegram, sentMax, errors: errors.length });

    return {
      success: true,
      sentTelegram,
      sentMax,
      errors: errors.slice(0, 20),
      message: `Отправлено: Telegram ${sentTelegram}, MAX ${sentMax}`,
    };
  }

  // ========== REFERRALS OVERVIEW ==========
  async getReferrals(limit = 50, offset = 0) {
    const referrals = await this.prisma.referral.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        referralCode: {
          include: {
            user: { select: { id: true, username: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    const total = await this.prisma.referral.count();

    // Топ рефереров
    const topReferrers = await this.prisma.referral.groupBy({
      by: ['referrerUserId'],
      _count: { referrerUserId: true },
      orderBy: { _count: { referrerUserId: 'desc' } },
      take: 10,
    });

    const topReferrerIds = topReferrers.map((r) => r.referrerUserId);
    const topReferrerUsers = await this.prisma.appUser.findMany({
      where: { id: { in: topReferrerIds } },
      select: { id: true, username: true, firstName: true, lastName: true },
    });

    const topReferrersWithNames = topReferrers.map((r) => ({
      ...r,
      user: topReferrerUsers.find((u) => u.id === r.referrerUserId),
      count: r._count.referrerUserId,
    }));

    return { success: true, referrals, total, limit, offset, topReferrers: topReferrersWithNames };
  }

  // ========== LOGS WITH FILTERS ==========
  async getLogsFiltered(
    limit = 50,
    offset = 0,
    filters?: { level?: string; category?: string; search?: string },
  ) {
    const where: any = {};
    if (filters?.level) where.level = filters.level;
    if (filters?.category) where.category = filters.category;
    if (filters?.search) {
      where.OR = [
        { message: { contains: filters.search, mode: 'insensitive' } },
        { category: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const logs = await this.prisma.systemLog.findMany({
      take: limit,
      skip: offset,
      where,
      orderBy: { timestamp: 'desc' },
      include: {
        user: { select: { id: true, username: true } },
      },
    });

    const total = await this.prisma.systemLog.count({ where });

    // Сводка по категориям
    const categories = await this.prisma.systemLog.groupBy({
      by: ['category'],
      _count: { category: true },
      orderBy: { _count: { category: 'desc' } },
    });

    return { success: true, logs, total, limit, offset, categories };
  }

  // ========== CSV EXPORT ==========
  async exportUsersCsv() {
    const users = await this.prisma.appUser.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        source: true,
        telegramId: true,
        createdAt: true,
        lastAccessAt: true,
        subscription: {
          select: {
            creditsBalance: true,
            creditsUsed: true,
            status: true,
            plan: { select: { planName: true } },
          },
        },
        _count: { select: { generations: true, classes: true } },
      },
    });

    const rows = [
      [
        'ID',
        'Username',
        'Имя',
        'Фамилия',
        'Телефон',
        'Email',
        'Источник',
        'Telegram ID',
        'Дата регистрации',
        'Последний вход',
        'План',
        'Статус подписки',
        'Баланс токенов',
        'Потрачено токенов',
        'Генерации',
        'Классы',
      ],
      ...users.map((u) => [
        u.id,
        u.username || '',
        u.firstName || '',
        u.lastName || '',
        u.phone || '',
        u.email || '',
        u.source || '',
        u.telegramId || '',
        u.createdAt.toISOString(),
        u.lastAccessAt?.toISOString() || '',
        u.subscription?.plan?.planName || '',
        u.subscription?.status || '',
        u.subscription?.creditsBalance ?? 0,
        u.subscription?.creditsUsed ?? 0,
        u._count.generations,
        u._count.classes,
      ]),
    ];

    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    return csv;
  }

  // ========== UTM LINKS ==========
  // NOTE: Prisma types for utmLink / utmSource will be available after
  // `prisma generate` runs on the server with the new migration applied.
  // Until then we cast to `any` to avoid compile errors locally.
  private get db(): any { return this.prisma; }

  /** Список всех UTM-ссылок */
  async getUtmLinks() {
    const links = await this.db.utmLink.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { links };
  }

  /** Создать UTM-ссылку */
  async createUtmLink(data: {
    name: string;
    socialNetwork: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    utmContent?: string;
    utmTerm?: string;
    baseUrl?: string;
  }) {
    const base = (data.baseUrl || 'https://prepodavai.ru').replace(/\/$/, '');
    const params = new URLSearchParams({
      utm_source: data.utmSource,
      utm_medium: data.utmMedium,
      utm_campaign: data.utmCampaign,
      ...(data.utmContent ? { utm_content: data.utmContent } : {}),
      ...(data.utmTerm ? { utm_term: data.utmTerm } : {}),
    });
    const fullUrl = `${base}?${params.toString()}`;

    const link = await this.db.utmLink.create({
      data: {
        name: data.name,
        socialNetwork: data.socialNetwork,
        utmSource: data.utmSource,
        utmMedium: data.utmMedium,
        utmCampaign: data.utmCampaign,
        utmContent: data.utmContent ?? null,
        utmTerm: data.utmTerm ?? null,
        baseUrl: base,
        fullUrl,
        updatedAt: new Date(),
      },
    });
    return link;
  }

  /** Удалить UTM-ссылку */
  async deleteUtmLink(id: string) {
    await this.db.utmLink.delete({ where: { id } });
    return { success: true };
  }

  /** Аналитика по UTM: сводка по источникам/кампаниям */
  async getUtmAnalytics() {
    // Регистрации по источнику (raw SQL — новые поля)
    const bySource: { utmSource: string; cnt: bigint }[] = await this.prisma.$queryRaw`
      SELECT "utmSource", COUNT(*) as cnt
      FROM app_users
      WHERE "utmSource" IS NOT NULL
      GROUP BY "utmSource"
      ORDER BY cnt DESC
    `;

    const byCampaign: { utmCampaign: string; utmSource: string; cnt: bigint }[] = await this.prisma.$queryRaw`
      SELECT "utmCampaign", "utmSource", COUNT(*) as cnt
      FROM app_users
      WHERE "utmCampaign" IS NOT NULL
      GROUP BY "utmCampaign", "utmSource"
      ORDER BY cnt DESC
    `;

    const [{ total_utm }]: { total_utm: bigint }[] = await this.prisma.$queryRaw`
      SELECT COUNT(*) as total_utm FROM app_users WHERE "utmSource" IS NOT NULL
    `;
    const [{ with_gen }]: { with_gen: bigint }[] = await this.prisma.$queryRaw`
      SELECT COUNT(DISTINCT u.id) as with_gen
      FROM app_users u
      INNER JOIN user_generations g ON g."userId" = u.id
      WHERE u."utmSource" IS NOT NULL
    `;

    const links = await this.db.utmLink.findMany({
      orderBy: { registrations: 'desc' },
    });

    const totalFromUtm = Number(total_utm);
    const withGenerations = Number(with_gen);

    return {
      bySource: bySource.map(r => ({
        source: r.utmSource,
        registrations: Number(r.cnt),
      })),
      byCampaign: byCampaign.map(r => ({
        campaign: r.utmCampaign,
        source: r.utmSource,
        registrations: Number(r.cnt),
      })),
      funnel: {
        totalFromUtm,
        withGenerations,
        conversionRate: totalFromUtm > 0
          ? Math.round((withGenerations / totalFromUtm) * 100)
          : 0,
      },
      links,
    };
  }

  /** Глубокая конверсионная аналитика по UTM-источникам */
  async getUtmDeepAnalytics() {
    // ── 1. Воронка по источнику ───────────────────────────────────────────────
    type FunnelRow = {
      utmSource: string;
      registrations: bigint;
      gen_24h: bigint;       // генерация в первые 24 ч
      gen_7d: bigint;        // генерация в первые 7 дней
      with_subscription: bigint;
      active_30d: bigint;
    };
    const funnel: FunnelRow[] = await this.prisma.$queryRaw`
      SELECT
        u."utmSource",
        COUNT(DISTINCT u.id)                                              AS registrations,
        COUNT(DISTINCT CASE
          WHEN gf.first_gen IS NOT NULL
            AND EXTRACT(EPOCH FROM (gf.first_gen - u."createdAt")) <= 86400
          THEN u.id END)                                                  AS gen_24h,
        COUNT(DISTINCT CASE
          WHEN gf.first_gen IS NOT NULL
            AND EXTRACT(EPOCH FROM (gf.first_gen - u."createdAt")) <= 604800
          THEN u.id END)                                                  AS gen_7d,
        COUNT(DISTINCT s."userId")                                        AS with_subscription,
        COUNT(DISTINCT CASE
          WHEN u."lastAccessAt" > NOW() - INTERVAL '30 days'
          THEN u.id END)                                                  AS active_30d
      FROM app_users u
      LEFT JOIN (
        SELECT "userId", MIN("createdAt") AS first_gen
        FROM user_generations
        GROUP BY "userId"
      ) gf ON gf."userId" = u.id
      LEFT JOIN user_subscriptions s ON s."userId" = u.id AND s.status = 'active'
      WHERE u."utmSource" IS NOT NULL
      GROUP BY u."utmSource"
      ORDER BY registrations DESC
    `;

    // ── 2. Среднее время до первой генерации (в часах) ────────────────────────
    type TimeRow = { utmSource: string; avg_hours: number | null };
    const timeToFirstGen: TimeRow[] = await this.prisma.$queryRaw`
      SELECT
        u."utmSource",
        ROUND(
          AVG(EXTRACT(EPOCH FROM (gf.first_gen - u."createdAt")) / 3600)::numeric,
          1
        )::float AS avg_hours
      FROM app_users u
      INNER JOIN (
        SELECT "userId", MIN("createdAt") AS first_gen
        FROM user_generations
        GROUP BY "userId"
      ) gf ON gf."userId" = u.id
      WHERE u."utmSource" IS NOT NULL
      GROUP BY u."utmSource"
    `;

    // ── 3. Средний расход токенов (прокси LTV) ────────────────────────────────
    type LtvRow = { utmSource: string; avg_credits: number | null; total_credits: bigint };
    const ltv: LtvRow[] = await this.prisma.$queryRaw`
      SELECT
        u."utmSource",
        ROUND(AVG(s."creditsUsed")::numeric, 1)::float AS avg_credits,
        SUM(s."creditsUsed")                           AS total_credits
      FROM app_users u
      INNER JOIN user_subscriptions s ON s."userId" = u.id
      WHERE u."utmSource" IS NOT NULL
      GROUP BY u."utmSource"
    `;

    // ── 4. Среднее количество генераций за 30 дней ────────────────────────────
    type EngRow = { utmSource: string; avg_gens: number | null };
    const engagement: EngRow[] = await this.prisma.$queryRaw`
      SELECT
        u."utmSource",
        ROUND(AVG(gc.cnt)::numeric, 1)::float AS avg_gens
      FROM app_users u
      INNER JOIN (
        SELECT "userId", COUNT(*) AS cnt
        FROM user_generations
        WHERE "createdAt" > NOW() - INTERVAL '30 days'
        GROUP BY "userId"
      ) gc ON gc."userId" = u.id
      WHERE u."utmSource" IS NOT NULL
      GROUP BY u."utmSource"
    `;

    // ── 5. Топ кампании по подпискам ─────────────────────────────────────────
    type CampaignRow = {
      utmCampaign: string; utmSource: string;
      registrations: bigint; subscriptions: bigint;
    };
    const topCampaigns: CampaignRow[] = await this.prisma.$queryRaw`
      SELECT
        u."utmCampaign",
        u."utmSource",
        COUNT(DISTINCT u.id)   AS registrations,
        COUNT(DISTINCT s."userId") AS subscriptions
      FROM app_users u
      LEFT JOIN user_subscriptions s ON s."userId" = u.id AND s.status = 'active'
      WHERE u."utmCampaign" IS NOT NULL
      GROUP BY u."utmCampaign", u."utmSource"
      ORDER BY subscriptions DESC, registrations DESC
      LIMIT 20
    `;

    // ── Собираем в единый ответ ───────────────────────────────────────────────
    const timeMap = Object.fromEntries(timeToFirstGen.map(r => [r.utmSource, r.avg_hours]));
    const ltvMap  = Object.fromEntries(ltv.map(r => [r.utmSource, {
      avgCredits: r.avg_credits,
      totalCredits: Number(r.total_credits),
    }]));
    const engMap  = Object.fromEntries(engagement.map(r => [r.utmSource, r.avg_gens]));

    const sources = funnel.map(row => {
      const regs = Number(row.registrations);
      const subs = Number(row.with_subscription);
      return {
        source: row.utmSource,
        registrations:     regs,
        genWithin24h:      Number(row.gen_24h),
        genWithin7d:       Number(row.gen_7d),
        withSubscription:  subs,
        active30d:         Number(row.active_30d),
        // Конверсионные %
        activationRate:    regs > 0 ? Math.round((Number(row.gen_24h) / regs) * 100) : 0,
        subscriptionRate:  regs > 0 ? Math.round((subs / regs) * 100) : 0,
        retention30d:      regs > 0 ? Math.round((Number(row.active_30d) / regs) * 100) : 0,
        // Временны́е метрики
        avgHoursToFirstGen: timeMap[row.utmSource] ?? null,
        // LTV-прокси
        avgCreditsUsed:     ltvMap[row.utmSource]?.avgCredits ?? null,
        totalCreditsUsed:   ltvMap[row.utmSource]?.totalCredits ?? 0,
        // Вовлечённость
        avgGens30d: engMap[row.utmSource] ?? null,
      };
    });

    return {
      sources,
      topCampaigns: topCampaigns.map(r => ({
        campaign:      r.utmCampaign,
        source:        r.utmSource,
        registrations: Number(r.registrations),
        subscriptions: Number(r.subscriptions),
        subscriptionRate: Number(r.registrations) > 0
          ? Math.round((Number(r.subscriptions) / Number(r.registrations)) * 100)
          : 0,
      })),
    };
  }

  /** Трекинг клика по UTM-ссылке (вызывается публично без авторизации) */
  async trackUtmClick(linkId: string) {
    try {
      await this.db.utmLink.update({
        where: { id: linkId },
        data: { clicks: { increment: 1 } },
      });
    } catch {
      // Ссылка не найдена — игнорируем
    }
    return { success: true };
  }

  // ========== PRODUCT ANALYTICS ==========

  /** DAU / WAU / MAU на основе генераций (activity = сделал генерацию) */
  async getDauWauMau(days = 90) {
    type DayRow = { day: Date; dau: bigint };
    const daily: DayRow[] = await this.prisma.$queryRaw`
      SELECT DATE("createdAt") AS day, COUNT(DISTINCT "userId") AS dau
      FROM user_generations
      WHERE "createdAt" > NOW() - (${days} || ' days')::interval
      GROUP BY day
      ORDER BY day
    `;

    type WeekRow = { week: Date; wau: bigint };
    const weekly: WeekRow[] = await this.prisma.$queryRaw`
      SELECT DATE_TRUNC('week', "createdAt") AS week, COUNT(DISTINCT "userId") AS wau
      FROM user_generations
      WHERE "createdAt" > NOW() - INTERVAL '26 weeks'
      GROUP BY week
      ORDER BY week
    `;

    type MonthRow = { month: Date; mau: bigint };
    const monthly: MonthRow[] = await this.prisma.$queryRaw`
      SELECT DATE_TRUNC('month', "createdAt") AS month, COUNT(DISTINCT "userId") AS mau
      FROM user_generations
      WHERE "createdAt" > NOW() - INTERVAL '12 months'
      GROUP BY month
      ORDER BY month
    `;

    // Stickiness: последний полный месяц DAU/MAU
    const lastMonthDays: { avg_dau: number }[] = await this.prisma.$queryRaw`
      SELECT ROUND(AVG(dau)::numeric, 1)::float AS avg_dau FROM (
        SELECT DATE("createdAt"), COUNT(DISTINCT "userId") AS dau
        FROM user_generations
        WHERE "createdAt" >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
          AND "createdAt" <  DATE_TRUNC('month', NOW())
        GROUP BY DATE("createdAt")
      ) t
    `;
    const lastMonthMau: { mau: bigint }[] = await this.prisma.$queryRaw`
      SELECT COUNT(DISTINCT "userId") AS mau
      FROM user_generations
      WHERE "createdAt" >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
        AND "createdAt" <  DATE_TRUNC('month', NOW())
    `;

    const avgDau = lastMonthDays[0]?.avg_dau ?? 0;
    const mau = Number(lastMonthMau[0]?.mau ?? 1);
    const stickiness = mau > 0 ? Math.round((avgDau / mau) * 100) : 0;

    return {
      daily: daily.map(r => ({ day: r.day, dau: Number(r.dau) })),
      weekly: weekly.map(r => ({ week: r.week, wau: Number(r.wau) })),
      monthly: monthly.map(r => ({ month: r.month, mau: Number(r.mau) })),
      stickiness,
      avgDau,
      lastMau: mau,
    };
  }

  /** Когортная retention-сетка (по неделям регистрации) */
  async getRetentionCohorts(weeks = 12) {
    type CohortRow = {
      cohort_week: Date;
      cohort_size: bigint;
      w0: bigint; w1: bigint; w2: bigint;
      w4: bigint; w8: bigint;
    };
    const rows: CohortRow[] = await this.prisma.$queryRaw`
      WITH cohorts AS (
        SELECT DATE_TRUNC('week', "createdAt") AS cohort_week, id AS user_id
        FROM app_users
        WHERE "createdAt" > NOW() - (${weeks} || ' weeks')::interval
      ),
      activity AS (
        SELECT DISTINCT "userId", DATE_TRUNC('week', "createdAt") AS activity_week
        FROM user_generations
        WHERE "createdAt" > NOW() - (${weeks * 2} || ' weeks')::interval
      )
      SELECT
        c.cohort_week,
        COUNT(DISTINCT c.user_id)                                                          AS cohort_size,
        COUNT(DISTINCT CASE WHEN a.activity_week = c.cohort_week                              THEN c.user_id END) AS w0,
        COUNT(DISTINCT CASE WHEN a.activity_week = c.cohort_week + INTERVAL '1 week'          THEN c.user_id END) AS w1,
        COUNT(DISTINCT CASE WHEN a.activity_week = c.cohort_week + INTERVAL '2 weeks'         THEN c.user_id END) AS w2,
        COUNT(DISTINCT CASE WHEN a.activity_week = c.cohort_week + INTERVAL '4 weeks'         THEN c.user_id END) AS w4,
        COUNT(DISTINCT CASE WHEN a.activity_week = c.cohort_week + INTERVAL '8 weeks'         THEN c.user_id END) AS w8
      FROM cohorts c
      LEFT JOIN activity a ON a."userId" = c.user_id
      GROUP BY c.cohort_week
      ORDER BY c.cohort_week DESC
    `;

    return rows.map(r => {
      const size = Number(r.cohort_size);
      const pct = (n: bigint) => size > 0 ? Math.round((Number(n) / size) * 100) : 0;
      return {
        cohortWeek: r.cohort_week,
        cohortSize: size,
        w0: { count: Number(r.w0), pct: pct(r.w0) },
        w1: { count: Number(r.w1), pct: pct(r.w1) },
        w2: { count: Number(r.w2), pct: pct(r.w2) },
        w4: { count: Number(r.w4), pct: pct(r.w4) },
        w8: { count: Number(r.w8), pct: pct(r.w8) },
      };
    });
  }

  /** Churn-аналитика */
  async getChurnAnalytics() {
    const empty = { churnedUsers: [], monthlyChurn: [], medianDaysBeforeChurn: null, lastActionTypes: [], totalChurned: 0 };
    try {
      // Churned = подписка закончилась / истекла / неактивна
      type ChurnedRow = {
        id: string; username: string; email: string;
        created_at: Date; last_access: Date | null;
        sub_status: string; sub_end: Date;
        days_as_customer: number; credits_used: number;
      };
      const churned: ChurnedRow[] = await this.prisma.$queryRaw`
        SELECT
          u.id, u.username, u.email,
          u."createdAt"    AS created_at,
          u."lastAccessAt" AS last_access,
          s.status         AS sub_status,
          s."endDate"      AS sub_end,
          EXTRACT(DAY FROM (s."endDate" - u."createdAt"))::int AS days_as_customer,
          s."creditsUsed"  AS credits_used
        FROM app_users u
        INNER JOIN user_subscriptions s ON s."userId" = u.id
        WHERE s.status IN ('inactive', 'expired')
           OR (s.status = 'active' AND s."endDate" < NOW())
        ORDER BY s."endDate" DESC
        LIMIT 100
      `;

      // Churn rate по месяцам
      type MonthlyChurnRow = { month: Date; churned: bigint; active: bigint };
      const monthlyChurn: MonthlyChurnRow[] = await this.prisma.$queryRaw`
        SELECT
          DATE_TRUNC('month', s."endDate") AS month,
          COUNT(*) AS churned,
          (SELECT COUNT(*) FROM user_subscriptions s2
           WHERE s2."startDate" <= DATE_TRUNC('month', s."endDate")
             AND s2."endDate"   >= DATE_TRUNC('month', s."endDate")) AS active
        FROM user_subscriptions s
        WHERE (s.status IN ('inactive','expired') OR s."endDate" < NOW())
          AND s."endDate" > NOW() - INTERVAL '12 months'
        GROUP BY month
        ORDER BY month
      `;

      // Медиана дней жизни до чёрна (PERCENTILE_CONT без принудительного cast)
      const [medianRow]: { median_days: number | null }[] = await this.prisma.$queryRaw`
        SELECT
          PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(DAY FROM (s."endDate" - u."createdAt"))
          ) AS median_days
        FROM app_users u
        INNER JOIN user_subscriptions s ON s."userId" = u.id
        WHERE s.status IN ('inactive','expired') OR s."endDate" < NOW()
      `;

      // Топ типов генераций перед уходом (что делали за 7 дней до ухода)
      type LastGenTypeRow = { generation_type: string; cnt: bigint };
      const lastActionTypes: LastGenTypeRow[] = await this.prisma.$queryRaw`
        SELECT g."generationType" AS generation_type, COUNT(*) AS cnt
        FROM user_generations g
        INNER JOIN user_subscriptions s ON s."userId" = g."userId"
        WHERE (s.status IN ('inactive','expired') OR s."endDate" < NOW())
          AND g."createdAt" > s."endDate" - INTERVAL '7 days'
        GROUP BY g."generationType"
        ORDER BY cnt DESC
      `;

      const medianDays = medianRow?.median_days != null ? Math.round(Number(medianRow.median_days)) : null;

      return {
        churnedUsers: churned,
        monthlyChurn: monthlyChurn.map(r => ({
          month: r.month,
          churned: Number(r.churned),
          active: Number(r.active),
          rate: Number(r.active) > 0 ? Math.round((Number(r.churned) / Number(r.active)) * 100) : 0,
        })),
        medianDaysBeforeChurn: medianDays,
        lastActionTypes: lastActionTypes.map(r => ({
          type: r.generation_type,
          count: Number(r.cnt),
        })),
        totalChurned: churned.length,
      };
    } catch (e) {
      console.error('[ChurnAnalytics] query error:', e);
      return empty;
    }
  }

  /** Воронка онбординга */
  async getOnboardingAnalytics() {
    const STEPS = [
      'FIRST_GENERATION',
      'SECOND_TYPE_GENERATION',
      'SHARED_REFERRAL_LINK',
      'FIRST_REFERRAL_ACTIVATED',
      'SECOND_REFERRAL_ACTIVATED',
    ];

    const totalUsers = await this.prisma.appUser.count();

    type StepRow = { step: string; cnt: bigint };
    const stepCounts: StepRow[] = await this.prisma.$queryRaw`
      SELECT step, COUNT(DISTINCT "userId") AS cnt
      FROM onboarding_quest_steps
      GROUP BY step
    `;
    const stepMap = Object.fromEntries(stepCounts.map(r => [r.step, Number(r.cnt)]));

    // Время до первого шага (медиана минут)
    type TimeRow = { step: string; median_minutes: number };
    const stepTimes: TimeRow[] = await this.prisma.$queryRaw`
      SELECT
        o.step,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (o."completedAt" - u."createdAt")) / 60
        )::int AS median_minutes
      FROM onboarding_quest_steps o
      INNER JOIN app_users u ON u.id = o."userId"
      GROUP BY o.step
    `;
    const timeMap = Object.fromEntries(stepTimes.map(r => [r.step, r.median_minutes]));

    // Пользователи завершившие все 5 шагов
    const [fullyCompleted]: { cnt: bigint }[] = await this.prisma.$queryRaw`
      SELECT COUNT(*) AS cnt
      FROM (
        SELECT "userId"
        FROM onboarding_quest_steps
        GROUP BY "userId"
        HAVING COUNT(DISTINCT step) >= 5
      ) t
    `;

    // Retention: те, кто завершил онбординг vs нет
    type RetRow = { completed_onboarding: boolean; active_30d: bigint; total: bigint };
    const onboardingRetention: RetRow[] = await this.prisma.$queryRaw`
      SELECT
        (oq.cnt >= 5) AS completed_onboarding,
        COUNT(DISTINCT CASE WHEN u."lastAccessAt" > NOW() - INTERVAL '30 days' THEN u.id END) AS active_30d,
        COUNT(DISTINCT u.id) AS total
      FROM app_users u
      LEFT JOIN (
        SELECT "userId", COUNT(DISTINCT step) AS cnt
        FROM onboarding_quest_steps
        GROUP BY "userId"
      ) oq ON oq."userId" = u.id
      GROUP BY completed_onboarding
    `;

    return {
      totalUsers,
      fullyCompleted: Number(fullyCompleted?.cnt ?? 0),
      completionRate: totalUsers > 0
        ? Math.round((Number(fullyCompleted?.cnt ?? 0) / totalUsers) * 100)
        : 0,
      steps: STEPS.map(step => ({
        step,
        completed: stepMap[step] ?? 0,
        pct: totalUsers > 0 ? Math.round(((stepMap[step] ?? 0) / totalUsers) * 100) : 0,
        medianMinutes: timeMap[step] ?? null,
      })),
      retention: onboardingRetention.map(r => ({
        completedOnboarding: r.completed_onboarding ?? false,
        active30d: Number(r.active_30d),
        total: Number(r.total),
        retentionRate: Number(r.total) > 0
          ? Math.round((Number(r.active_30d) / Number(r.total)) * 100)
          : 0,
      })),
    };
  }

  /** Feature adoption */
  async getFeatureAdoption(days = 30) {
    // Использование по типу генерации за период
    type FeatureRow = { generation_type: string; cnt: bigint; unique_users: bigint };
    const byType: FeatureRow[] = await this.prisma.$queryRaw`
      SELECT
        "generationType" AS generation_type,
        COUNT(*) AS cnt,
        COUNT(DISTINCT "userId") AS unique_users
      FROM user_generations
      WHERE "createdAt" > NOW() - (${days} || ' days')::interval
      GROUP BY "generationType"
      ORDER BY cnt DESC
    `;

    // DAU per feature (топ 6 фич за 30 дней)
    type DailyFeatureRow = { day: Date; generation_type: string; dau: bigint };
    const dailyByFeature: DailyFeatureRow[] = await this.prisma.$queryRaw`
      SELECT
        DATE("createdAt") AS day,
        "generationType" AS generation_type,
        COUNT(DISTINCT "userId") AS dau
      FROM user_generations
      WHERE "createdAt" > NOW() - (${days} || ' days')::interval
        AND "generationType" IN (
          SELECT "generationType" FROM user_generations
          WHERE "createdAt" > NOW() - (${days} || ' days')::interval
          GROUP BY "generationType"
          ORDER BY COUNT(*) DESC
          LIMIT 6
        )
      GROUP BY day, "generationType"
      ORDER BY day, "generationType"
    `;

    // Что делают в первые 7 дней новые пользователи (new user behavior)
    type NewUserRow = { generation_type: string; cnt: bigint; unique_users: bigint };
    const newUserBehavior: NewUserRow[] = await this.prisma.$queryRaw`
      SELECT
        g."generationType" AS generation_type,
        COUNT(*) AS cnt,
        COUNT(DISTINCT g."userId") AS unique_users
      FROM user_generations g
      INNER JOIN app_users u ON u.id = g."userId"
      WHERE EXTRACT(EPOCH FROM (g."createdAt" - u."createdAt")) <= 604800
      GROUP BY g."generationType"
      ORDER BY cnt DESC
    `;

    // Платные vs бесплатные — что используют
    type PlanRow = { is_paid: boolean; generation_type: string; cnt: bigint };
    const byPlan: PlanRow[] = await this.prisma.$queryRaw`
      SELECT
        (s."planId" IS NOT NULL AND s.status = 'active' AND s."endDate" > NOW()) AS is_paid,
        g."generationType" AS generation_type,
        COUNT(*) AS cnt
      FROM user_generations g
      INNER JOIN app_users u ON u.id = g."userId"
      LEFT JOIN user_subscriptions s ON s."userId" = u.id
      WHERE g."createdAt" > NOW() - (${days} || ' days')::interval
      GROUP BY is_paid, g."generationType"
      ORDER BY is_paid DESC, cnt DESC
    `;

    return {
      byType: byType.map(r => ({
        type: r.generation_type,
        count: Number(r.cnt),
        uniqueUsers: Number(r.unique_users),
      })),
      dailyByFeature: dailyByFeature.map(r => ({
        day: r.day,
        type: r.generation_type,
        dau: Number(r.dau),
      })),
      newUserBehavior: newUserBehavior.map(r => ({
        type: r.generation_type,
        count: Number(r.cnt),
        uniqueUsers: Number(r.unique_users),
      })),
      byPlan: byPlan.map(r => ({
        isPaid: r.is_paid,
        type: r.generation_type,
        count: Number(r.cnt),
      })),
    };
  }

  /** Алерты: проверяем пороговые условия */
  async getAlerts() {
    const alerts: { level: 'warning' | 'critical'; title: string; description: string; value: number; threshold: number }[] = [];

    // 1. Регистрации сегодня vs вчера
    const [regToday]: { cnt: bigint }[] = await this.prisma.$queryRaw`
      SELECT COUNT(*) AS cnt FROM app_users
      WHERE "createdAt" >= CURRENT_DATE
    `;
    const [regYesterday]: { cnt: bigint }[] = await this.prisma.$queryRaw`
      SELECT COUNT(*) AS cnt FROM app_users
      WHERE "createdAt" >= CURRENT_DATE - INTERVAL '1 day'
        AND "createdAt" < CURRENT_DATE
    `;
    const todayReg = Number(regToday?.cnt ?? 0);
    const yestReg = Number(regYesterday?.cnt ?? 1);
    if (yestReg > 0 && todayReg < yestReg * 0.7) {
      const drop = Math.round(((yestReg - todayReg) / yestReg) * 100);
      alerts.push({
        level: drop > 50 ? 'critical' : 'warning',
        title: 'Спад регистраций',
        description: `Сегодня ${todayReg} регистраций, вчера ${yestReg}`,
        value: drop,
        threshold: 30,
      });
    }

    // 2. Пользователь с чрезмерным расходом токенов за сутки
    type HeavyUser = { user_id: string; username: string; total: bigint };
    const heavyUsers: HeavyUser[] = await this.prisma.$queryRaw`
      SELECT g."userId" AS user_id, u.username, SUM(g."creditCost") AS total
      FROM user_generations g
      INNER JOIN app_users u ON u.id = g."userId"
      WHERE g."createdAt" >= CURRENT_DATE
        AND g."creditCost" IS NOT NULL
      GROUP BY g."userId", u.username
      HAVING SUM(g."creditCost") > 500
      ORDER BY total DESC
      LIMIT 5
    `;
    for (const hu of heavyUsers) {
      alerts.push({
        level: Number(hu.total) > 1000 ? 'critical' : 'warning',
        title: `Высокий расход токенов: @${hu.username}`,
        description: `${Number(hu.total)} токенов сегодня`,
        value: Number(hu.total),
        threshold: 500,
      });
    }

    // 3. Ошибки генерации сегодня
    const [errToday]: { cnt: bigint; total: bigint }[] = await this.prisma.$queryRaw`
      SELECT
        COUNT(*) FILTER (WHERE status = 'failed') AS cnt,
        COUNT(*) AS total
      FROM user_generations
      WHERE "createdAt" >= CURRENT_DATE
    `;
    const errCount = Number(errToday?.cnt ?? 0);
    const totalToday = Number(errToday?.total ?? 0);
    const errorRate = totalToday > 0 ? Math.round((errCount / totalToday) * 100) : 0;
    if (errorRate >= 10) {
      alerts.push({
        level: errorRate >= 25 ? 'critical' : 'warning',
        title: 'Высокий процент ошибок генерации',
        description: `${errCount} ошибок из ${totalToday} генераций (${errorRate}%)`,
        value: errorRate,
        threshold: 10,
      });
    }

    // Сводка по текущим показателям (для дашборда алертов)
    const summary = {
      registrationsToday: todayReg,
      registrationsYesterday: yestReg,
      generationsToday: totalToday,
      errorsToday: errCount,
      errorRate,
    };

    return { alerts, summary };
  }

  /** Сравнение периодов: текущий vs предыдущий */
  async getPeriodComparison(period: 'week' | 'month' = 'week') {
    const zero = { current: 0, previous: 0, delta: 0, pct: null };
    const emptyResult = { period, registrations: zero, generations: zero, activeUsers: zero, newSubscriptions: zero };
    try {
      const days = period === 'week' ? 7 : 30;
      const interval = `${days} days`;
      const doubleInterval = `${days * 2} days`;

      type PeriodRow = {
        registrations: bigint; generations: bigint;
        active_users: bigint; new_subscriptions: bigint;
      };
      const [current]: PeriodRow[] = await this.prisma.$queryRaw`
        SELECT
          (SELECT COUNT(*) FROM app_users WHERE "createdAt" > NOW() - ${interval}::interval)            AS registrations,
          (SELECT COUNT(*) FROM user_generations WHERE "createdAt" > NOW() - ${interval}::interval)     AS generations,
          (SELECT COUNT(DISTINCT "userId") FROM user_generations WHERE "createdAt" > NOW() - ${interval}::interval) AS active_users,
          (SELECT COUNT(*) FROM user_subscriptions WHERE "createdAt" > NOW() - ${interval}::interval)   AS new_subscriptions
      `;
      const [previous]: PeriodRow[] = await this.prisma.$queryRaw`
        SELECT
          (SELECT COUNT(*) FROM app_users WHERE "createdAt" BETWEEN NOW() - ${doubleInterval}::interval AND NOW() - ${interval}::interval)            AS registrations,
          (SELECT COUNT(*) FROM user_generations WHERE "createdAt" BETWEEN NOW() - ${doubleInterval}::interval AND NOW() - ${interval}::interval)     AS generations,
          (SELECT COUNT(DISTINCT "userId") FROM user_generations WHERE "createdAt" BETWEEN NOW() - ${doubleInterval}::interval AND NOW() - ${interval}::interval) AS active_users,
          (SELECT COUNT(*) FROM user_subscriptions WHERE "createdAt" BETWEEN NOW() - ${doubleInterval}::interval AND NOW() - ${interval}::interval)   AS new_subscriptions
      `;

      const diff = (cur: bigint, prev: bigint) => {
        const c = Number(cur); const p = Number(prev);
        return { current: c, previous: p, delta: c - p, pct: p > 0 ? Math.round(((c - p) / p) * 100) : null };
      };

      return {
        period,
        registrations:    diff(current.registrations,    previous.registrations),
        generations:      diff(current.generations,      previous.generations),
        activeUsers:      diff(current.active_users,     previous.active_users),
        newSubscriptions: diff(current.new_subscriptions, previous.new_subscriptions),
      };
    } catch (e) {
      console.error('[PeriodComparison] query error:', e);
      return emptyResult;
    }
  }
}
