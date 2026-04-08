import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
      select: {
        id: true,
        userHash: true,
        source: true,
        telegramId: true,
        username: true,
        apiKey: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        phoneVerified: true,
        lastAccessAt: true,
        lastTelegramAppAccess: true,
        createdAt: true,
        updatedAt: true,
        subscription: true,
        passwordHash: true,
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

    // Генерация apiKey
    const crypto = require('crypto');
    const apiKey = crypto.randomBytes(16).toString('hex');
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

    // Хешируем новый пароль, если он передан
    if (password) {
      const bcrypt = await import('bcryptjs');
      (updateData as any).passwordHash = await bcrypt.hash(password, 10);
    }

    // Обновляем пользователя
    const user = await this.prisma.appUser.update({
      where: { id },
      data: updateData,
      include: {
        subscription: true,
      },
    });

    // Если передан creditsBalance, обновляем подписку пользователя
    if (creditsBalance !== undefined) {
      const numCredits = parseInt(creditsBalance);
      if (!isNaN(numCredits) && user.subscription) {
        await this.prisma.userSubscription.update({
          where: { id: user.subscription.id },
          data: { creditsBalance: numCredits },
        });
        user.subscription.creditsBalance = numCredits;
      }
    }

    await this.audit('admin.user.update', adminId, { targetUserId: id, fields: Object.keys(updateData) });

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
      select: { id: true, username: true, firstName: true, lastName: true, source: true, createdAt: true },
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
}
