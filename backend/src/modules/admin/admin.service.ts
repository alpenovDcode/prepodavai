import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
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
        botUser: {
          select: {
            firstName: true,
            lastName: true,
            username: true,
            botCredits: true,
            registrationStatus: true,
            source: true,
          },
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
    const { username, password, firstName, lastName, phone, creditsBalance, planKey } = data;

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

    // Создаем подписку: по выбранному тарифу или Starter по умолчанию
    const starterPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { planKey: planKey || 'starter' },
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

    // Если передан botCredits, обновляем BotUser
    if (data.botCredits !== undefined) {
      const numBotCredits = parseInt(data.botCredits);
      if (!isNaN(numBotCredits)) {
        const existingBot = await (this.prisma as any).botUser.findUnique({
          where: { appUserId: id },
          select: { id: true, botCredits: true },
        });
        await (this.prisma as any).botUser.updateMany({
          where: { appUserId: id },
          data: { botCredits: numBotCredits },
        });
        if (existingBot?.id) {
          await (this.prisma as any).botCreditTransaction.create({
            data: {
              botUserId: existingBot.id,
              amount: numBotCredits - existingBot.botCredits,
              balanceBefore: existingBot.botCredits,
              balanceAfter: numBotCredits,
              reason: 'admin_set',
              description: `Установлено администратором (adminId=${adminId ?? 'unknown'})`,
            },
          }).catch(() => null);
        }
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
    // Удаляем связанные записи снизу вверх по цепочке FK-зависимостей

    // 1. Submission → Assignment → Lesson / Class / UserGeneration
    await this.prisma.submission.deleteMany({
      where: { assignment: { lesson: { userId: id } } },
    });
    await this.prisma.submission.deleteMany({
      where: { assignment: { class: { teacherId: id } } },
    });
    await this.prisma.assignment.deleteMany({
      where: { lesson: { userId: id } },
    });
    await this.prisma.assignment.deleteMany({
      where: { class: { teacherId: id } },
    });

    // 2. Прямые дочерние таблицы AppUser
    await this.prisma.creditTransaction.deleteMany({ where: { userId: id } });
    await this.prisma.userGeneration.deleteMany({ where: { userId: id } });
    await this.prisma.userSubscription.deleteMany({ where: { userId: id } });
    await this.prisma.generationRequest.deleteMany({ where: { userId: id } });
    await this.prisma.lesson.deleteMany({ where: { userId: id } });
    await this.prisma.class.deleteMany({ where: { teacherId: id } }); // Student/StudentInvite каскадом
    await this.prisma.linkToken.deleteMany({ where: { userId: id } });
    await this.prisma.onboardingQuestStep.deleteMany({ where: { userId: id } });
    await this.prisma.payment.deleteMany({ where: { userId: id } });
    await this.prisma.referralMilestone.deleteMany({ where: { userId: id } });
    await this.prisma.referralCode.deleteMany({ where: { userId: id } });
    await this.prisma.systemLog.deleteMany({ where: { userId: id } });

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
      botUser,
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
      prismaAny.botUser.findUnique({
        where: { appUserId: userId },
        select: { firstName: true, lastName: true, username: true, botCredits: true, source: true, registrationStatus: true },
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
              id: subscription.id,
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
        botUser: botUser || null,
      },
    };
  }

  // ========== CJM ==========

  async getUserCjm(userId: string, days: number = 30) {
    const db = this.prisma as any;
    const since = new Date(Date.now() - days * 86400000);

    const [user, botUser, subscription, firstGen, firstPayment, genStats, botCredHistory, generationsCount,
      onboardingSteps, allPayments, heatmapRows, weeklyRows, hourRows, dowRows, byTypeRows, gapRows,
      depthRow, platformTimeRows, creditBurnRows, allDatesRows, windowRow, inLessonRow, topTopicsRows, planHistoryRows,
    ] = await Promise.all([
      this.prisma.appUser.findUnique({
        where: { id: userId },
        select: {
          id: true, source: true, createdAt: true,
          utmSource: true, utmMedium: true, utmCampaign: true,
          utmContent: true, utmTerm: true, utmLandingPage: true, utmLinkId: true,
          referredByCode: true,
          lastAccessAt: true, lastTelegramAppAccess: true, lastMaxAppAccess: true,
        },
      }),
      db.botUser.findUnique({
        where: { appUserId: userId },
        select: {
          createdAt: true, source: true, registrationStatus: true, lastActiveAt: true, botCredits: true,
          startPayload: true, utmSource: true, utmMedium: true, utmCampaign: true,
          totalGenerations: true, generationsThisMonth: true, lastGenerationAt: true,
        },
      }),
      this.prisma.userSubscription.findUnique({
        where: { userId },
        select: { status: true, endDate: true, creditsBalance: true, creditsUsed: true, plan: { select: { planName: true, planKey: true } } },
      }),
      this.prisma.userGeneration.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, generationType: true, creditCost: true },
      }),
      this.prisma.payment.findFirst({
        where: { userId, status: 'completed' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, planKey: true, amount: true },
      }),
      this.prisma.userGeneration.groupBy({
        by: ['sentToTelegram', 'sentToMax'],
        where: { userId },
        _count: { id: true },
      }),
      // История бот-кредитов (последние 50 транзакций)
      db.botCreditTransaction.findMany({
        where: { botUser: { appUserId: userId } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { amount: true, balanceBefore: true, balanceAfter: true, reason: true, generationType: true, createdAt: true },
      }).catch(() => []),
      // Разбивка генераций по initiatedSource
      this.prisma.userGeneration.groupBy({
        by: ['initiatedSource' as any],
        where: { userId },
        _count: { id: true },
      }),

      // onboardingSteps — с датами
      this.prisma.onboardingQuestStep.findMany({
        where: { userId },
        select: { step: true, completedAt: true },
        orderBy: { completedAt: 'asc' },
      }).catch(() => []),

      // allPayments — все платежи
      this.prisma.payment.findMany({
        where: { userId, status: 'completed' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, planKey: true, amount: true },
      }).catch(() => []),

      // heatmapRows — последние 91 день
      (this.prisma.$queryRaw`
        SELECT DATE(created_at)::text AS d, COUNT(*)::int AS cnt
        FROM user_generations
        WHERE user_id = ${userId} AND created_at >= NOW() - INTERVAL '91 days'
        GROUP BY DATE(created_at) ORDER BY d
      ` as Promise<any[]>).catch(() => []),

      // weeklyRows — еженедельная активность
      (this.prisma.$queryRaw`
        SELECT TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD') AS w, COUNT(*)::int AS cnt
        FROM user_generations WHERE user_id = ${userId}
        GROUP BY DATE_TRUNC('week', created_at) ORDER BY w
      ` as Promise<any[]>).catch(() => []),

      // hourRows — паттерн по часам
      (this.prisma.$queryRaw`
        SELECT EXTRACT(HOUR FROM created_at)::int AS h, COUNT(*)::int AS cnt
        FROM user_generations WHERE user_id = ${userId}
        GROUP BY h ORDER BY h
      ` as Promise<any[]>).catch(() => []),

      // dowRows — паттерн по дням недели
      (this.prisma.$queryRaw`
        SELECT EXTRACT(DOW FROM created_at)::int AS dow, COUNT(*)::int AS cnt
        FROM user_generations WHERE user_id = ${userId}
        GROUP BY dow ORDER BY dow
      ` as Promise<any[]>).catch(() => []),

      // byTypeRows — типы контента с avg tokens/cost в окне days
      (this.prisma.$queryRaw`
        SELECT generation_type,
          COUNT(*)::int AS cnt,
          ROUND(AVG(tokens_used))::int AS avg_tokens,
          ROUND(AVG(credit_cost))::int AS avg_cost
        FROM user_generations
        WHERE user_id = ${userId} AND status = 'completed' AND created_at >= ${since}
        GROUP BY generation_type ORDER BY cnt DESC
      ` as Promise<any[]>).catch(() => []),

      // gapRows — периоды неактивности > 7 дней
      (this.prisma.$queryRaw`
        WITH dates AS (
          SELECT DISTINCT DATE(created_at) AS d
          FROM user_generations WHERE user_id = ${userId}
        ),
        gaps AS (
          SELECT
            LAG(d) OVER (ORDER BY d) AS prev_d,
            d AS curr_d,
            (d - LAG(d) OVER (ORDER BY d))::int AS gap_days
          FROM dates
        )
        SELECT prev_d::text, curr_d::text, gap_days
        FROM gaps WHERE gap_days > 7
        ORDER BY gap_days DESC LIMIT 10
      ` as Promise<any[]>).catch(() => []),

      // depthRow — количество уроков/классов/учеников/ДЗ
      (this.prisma.$queryRaw`
        SELECT
          (SELECT COUNT(*)::int FROM lessons WHERE user_id = ${userId}) AS lessons,
          (SELECT COUNT(*)::int FROM classes WHERE user_id = ${userId}) AS classes,
          (SELECT COUNT(DISTINCT s.id)::int FROM students s JOIN classes c ON s.class_id = c.id WHERE c.user_id = ${userId}) AS students,
          (SELECT COUNT(*)::int FROM assignments WHERE teacher_id = ${userId}) AS assignments,
          (SELECT MIN(created_at)::text FROM lessons WHERE user_id = ${userId}) AS first_lesson_at,
          (SELECT MIN(a.created_at)::text FROM assignments a WHERE a.teacher_id = ${userId}) AS first_assignment_at,
          (SELECT MIN(c.created_at)::text FROM classes c WHERE c.user_id = ${userId}) AS first_class_at,
          (SELECT MIN(s.created_at)::text FROM students s JOIN classes c ON s.class_id = c.id WHERE c.user_id = ${userId}) AS first_student_at
      ` as Promise<any[]>).catch(() => [{ lessons: 0, classes: 0, students: 0, assignments: 0, first_lesson_at: null, first_assignment_at: null, first_class_at: null, first_student_at: null }]),

      // platformTimeRows — предпочтение платформы по месяцам
      (this.prisma.$queryRaw`
        SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS m,
          COALESCE(initiated_source, 'web') AS src,
          COUNT(*)::int AS cnt
        FROM user_generations WHERE user_id = ${userId}
        GROUP BY DATE_TRUNC('month', created_at), COALESCE(initiated_source, 'web')
        ORDER BY m, src
      ` as Promise<any[]>).catch(() => []),

      // creditBurnRows — monthly burn
      (this.prisma.$queryRaw`
        SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS m,
          COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0)::int AS spent,
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)::int AS granted
        FROM credit_transactions WHERE user_id = ${userId}
        GROUP BY DATE_TRUNC('month', created_at) ORDER BY m
      ` as Promise<any[]>).catch(() => []),

      // allDatesRows — все даты генераций (для streak)
      (this.prisma.$queryRaw`
        SELECT DISTINCT DATE(created_at)::text AS d
        FROM user_generations WHERE user_id = ${userId}
        ORDER BY d DESC
      ` as Promise<any[]>).catch(() => []),

      // windowRow — статистика в выбранном окне дней
      (this.prisma.$queryRaw`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
          COUNT(DISTINCT DATE(created_at))::int AS active_days,
          COALESCE(ROUND(AVG(tokens_used)), 0)::int AS avg_tokens,
          COALESCE(SUM(credit_cost), 0)::int AS total_credits
        FROM user_generations
        WHERE user_id = ${userId} AND created_at >= ${since}
      ` as Promise<any[]>).catch(() => [{ total: 0, completed: 0, failed: 0, active_days: 0, avg_tokens: 0, total_credits: 0 }]),

      // inLessonRow — генерации привязанные к урокам vs standalone
      (this.prisma.$queryRaw`
        SELECT
          COUNT(*) FILTER (WHERE lesson_id IS NOT NULL)::int AS in_lesson,
          COUNT(*) FILTER (WHERE lesson_id IS NULL)::int AS standalone
        FROM user_generations WHERE user_id = ${userId}
      ` as Promise<any[]>).catch(() => [{ in_lesson: 0, standalone: 0 }]),

      // topTopicsRows — топ тем уроков
      (this.prisma.$queryRaw`
        SELECT topic, COUNT(*)::int AS cnt FROM lessons WHERE user_id = ${userId}
        GROUP BY topic ORDER BY cnt DESC LIMIT 10
      ` as Promise<any[]>).catch(() => []),

      // planHistoryRows — история тарифов из платежей
      (this.prisma.$queryRaw`
        SELECT plan_key, COUNT(*)::int AS count,
          MIN(created_at)::text AS first_at,
          MAX(created_at)::text AS last_at
        FROM payments WHERE user_id = ${userId} AND status = 'completed'
        GROUP BY plan_key ORDER BY MIN(created_at)
      ` as Promise<any[]>).catch(() => []),
    ]);

    if (!user) throw new NotFoundException('User not found');

    // UTM-ссылка
    let utmLinkName: string | null = null;
    let utmLinkUrl: string | null = null;
    if (user.utmLinkId) {
      try {
        const link = await db.utmLink.findUnique({ where: { id: user.utmLinkId }, select: { name: true, fullUrl: true } });
        utmLinkName = link?.name ?? null;
        utmLinkUrl = link?.fullUrl ?? null;
      } catch (_) {}
    }

    // Подсчёт генераций по платформе
    let genWeb = 0, genTelegram = 0, genMax = 0;
    for (const row of genStats) {
      const cnt = (row._count as any).id ?? 0;
      if ((row as any).sentToTelegram) { genTelegram += cnt; continue; }
      if ((row as any).sentToMax) { genMax += cnt; continue; }
      genWeb += cnt;
    }
    const totalGenerations = genWeb + genTelegram + genMax;

    // Даты ключевых событий
    const registeredAt = user.createdAt;
    const botStartedAt: Date | null = botUser?.createdAt ?? null;
    const firstGenAt: Date | null = firstGen?.createdAt ?? null;
    const firstPaymentAt: Date | null = firstPayment?.createdAt ?? null;

    // Последняя активность
    const activityDates = [user.lastAccessAt, user.lastTelegramAppAccess, user.lastMaxAppAccess, botUser?.lastActiveAt]
      .filter((d): d is Date => d instanceof Date);
    const lastActiveAt = activityDates.length > 0 ? new Date(Math.max(...activityDates.map(d => d.getTime()))) : null;
    const now = new Date();

    // Временные дельты (в днях)
    const daysBetween = (a: Date, b: Date) => Math.floor(Math.abs(b.getTime() - a.getTime()) / 86400000);
    const daysToFirstGen = firstGenAt ? daysBetween(registeredAt, firstGenAt) : null;
    const daysToFirstPayment = firstPaymentAt ? daysBetween(registeredAt, firstPaymentAt) : null;
    const daysSinceRegistration = daysBetween(registeredAt, now);
    const daysSinceLastActivity = lastActiveAt ? daysBetween(lastActiveAt, now) : null;

    // Текущий этап CJM
    let currentStage: string;
    const subActive = subscription?.status === 'active';
    const subExpired = subscription && !subActive;
    if (!subscription && totalGenerations === 0) currentStage = 'registered_only';
    else if (!subscription && totalGenerations > 0) currentStage = 'generating_free';
    else if (subActive) currentStage = 'subscribed_active';
    else if (subExpired && daysSinceLastActivity !== null && daysSinceLastActivity <= 30) currentStage = 'subscribed_expired';
    else currentStage = 'churned';

    // Churn risk
    const churnSignals: string[] = [];
    if (daysSinceLastActivity !== null && daysSinceLastActivity > 30) churnSignals.push('Нет активности 30+ дней');
    if (daysSinceLastActivity !== null && daysSinceLastActivity > 7 && daysSinceLastActivity <= 30) churnSignals.push('Нет активности 7–30 дней');
    if (subscription?.creditsBalance === 0) churnSignals.push('Баланс 0 кредитов');
    if (subExpired) churnSignals.push('Подписка истекла');
    if (totalGenerations === 0) churnSignals.push('Ни одной генерации');
    if (totalGenerations === 1) churnSignals.push('Только 1 генерация за всё время');
    if (daysSinceRegistration > 7 && totalGenerations === 0) churnSignals.push('7+ дней без единой генерации');
    if (subscription?.creditsBalance !== null && subscription?.creditsBalance !== undefined && subscription.creditsBalance < 10 && !subActive) churnSignals.push('Критически мало кредитов (<10)');

    let churnRisk: 'low' | 'medium' | 'high';
    if (churnSignals.some(s => s.includes('30+') || s === 'Подписка истекла')) churnRisk = 'high';
    else if (churnSignals.length >= 2 || churnSignals.some(s => s.includes('7–30'))) churnRisk = 'medium';
    else churnRisk = 'low';

    // Разбивка по initiatedSource
    const byInitiated: Record<string, number> = {};
    for (const row of (generationsCount as any[])) {
      const src = (row as any).initiatedSource ?? 'web';
      byInitiated[src] = Number((row._count as any).id ?? 0);
    }

    // Вычисляем streak из allDatesRows
    function computeStreaks(dates: string[]): { current: number; max: number } {
      if (dates.length === 0) return { current: 0, max: 0 };

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().slice(0, 10);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      // dates уже отсортированы DESC
      let current = 0;
      if (dates[0] === todayStr || dates[0] === yesterdayStr) {
        const startDate = new Date(dates[0]);
        for (let i = 0; i < dates.length; i++) {
          const expected = new Date(startDate);
          expected.setDate(expected.getDate() - i);
          if (dates[i] === expected.toISOString().slice(0, 10)) {
            current++;
          } else break;
        }
      }

      // Max streak (iterate ascending)
      const asc = [...dates].sort();
      let max = 1, run = 1;
      for (let i = 1; i < asc.length; i++) {
        const prev = new Date(asc[i - 1]);
        prev.setDate(prev.getDate() + 1);
        if (asc[i] === prev.toISOString().slice(0, 10)) {
          run++;
          max = Math.max(max, run);
        } else {
          run = 1;
        }
      }

      return { current, max };
    }

    const streaks = computeStreaks((allDatesRows as any[]).map(r => r.d));

    // LTV вычисление
    const ltv = (allPayments as any[]).reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    const paymentCount = (allPayments as any[]).length;
    const avgPayment = paymentCount > 0 ? Math.round(ltv / paymentCount) : 0;

    // Credit forecast
    const burnLast30 = (creditBurnRows as any[])
      .filter(r => r.m >= new Date(Date.now() - 86400000 * 60).toISOString().slice(0, 7))
      .reduce((s: number, r: any) => s + Number(r.spent ?? 0), 0);
    const burnRate30 = burnLast30 / 30;
    const forecastDaysLeft = (subscription?.creditsBalance && burnRate30 > 0)
      ? Math.round(subscription.creditsBalance / burnRate30)
      : null;

    // Platform over time
    const platformTimeMap: Record<string, { web: number; telegram_bot: number; max_bot: number }> = {};
    for (const r of platformTimeRows as any[]) {
      if (!platformTimeMap[r.m]) platformTimeMap[r.m] = { web: 0, telegram_bot: 0, max_bot: 0 };
      const src = r.src as string;
      if (src === 'telegram_bot') platformTimeMap[r.m].telegram_bot += Number(r.cnt);
      else if (src === 'max_bot') platformTimeMap[r.m].max_bot += Number(r.cnt);
      else platformTimeMap[r.m].web += Number(r.cnt);
    }
    const platformOverTime = Object.entries(platformTimeMap)
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Weekly retention grid
    const weeklyRetentionMap = new Map<string, boolean>();
    for (const r of weeklyRows as any[]) {
      weeklyRetentionMap.set(r.w, true);
    }
    const weeklyGrid: { week: string; hasActivity: boolean }[] = [];
    for (let i = 51; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      const monday = new Date(d);
      monday.setDate(monday.getDate() - monday.getDay() + 1);
      const weekStr = monday.toISOString().slice(0, 10);
      weeklyGrid.push({ week: weekStr, hasActivity: weeklyRetentionMap.has(weekStr) });
    }
    const activeWeeks = weeklyGrid.filter(w => w.hasActivity).length;
    const retentionScore = weeklyGrid.length > 0 ? Math.round((activeWeeks / weeklyGrid.length) * 100) : 0;

    // Window stats
    const ws = (windowRow as any[])[0] ?? {};
    const windowStats = {
      total: Number(ws.total ?? 0),
      completed: Number(ws.completed ?? 0),
      failed: Number(ws.failed ?? 0),
      activeDays: Number(ws.active_days ?? 0),
      avgTokens: Number(ws.avg_tokens ?? 0),
      totalCredits: Number(ws.total_credits ?? 0),
      successRate: ws.total > 0 ? Math.round((Number(ws.completed) / Number(ws.total)) * 100) : 0,
      avgPerActiveDay: ws.active_days > 0 ? Math.round((Number(ws.total) / Number(ws.active_days)) * 10) / 10 : 0,
    };

    return {
      days,
      acquisition: {
        // Веб-регистрация
        source: user.source,
        utmSource: user.utmSource,
        utmMedium: user.utmMedium,
        utmCampaign: user.utmCampaign,
        utmContent: user.utmContent,
        utmTerm: user.utmTerm,
        utmLandingPage: user.utmLandingPage,
        utmLinkName,
        utmLinkUrl,
        referredByCode: user.referredByCode,
        // Бот-атрибуция
        botStartPayload: botUser?.startPayload ?? null,
        botUtmSource: botUser?.utmSource ?? null,
        botUtmMedium: botUser?.utmMedium ?? null,
        botUtmCampaign: botUser?.utmCampaign ?? null,
      },
      journey: {
        botStartedAt,
        botPlatform: botUser?.source ?? null,
        botRegistrationStatus: botUser?.registrationStatus ?? null,
        botCredits: botUser?.botCredits ?? null,
        botTotalGenerations: botUser?.totalGenerations ?? null,
        botGenerationsThisMonth: botUser?.generationsThisMonth ?? null,
        botLastGenerationAt: botUser?.lastGenerationAt ?? null,
        platformRegisteredAt: registeredAt,
        firstGenerationAt: firstGenAt,
        firstGenerationType: firstGen?.generationType ?? null,
        firstGenerationCreditCost: firstGen?.creditCost ?? null,
        firstPaymentAt,
        firstPaymentPlan: firstPayment?.planKey ?? null,
        firstPaymentAmount: firstPayment?.amount?.toString() ?? null,
      },
      timings: {
        daysToFirstGen,
        daysToFirstPayment,
        daysSinceRegistration,
        daysSinceLastActivity,
      },
      currentStage,
      churnRisk,
      churnSignals,
      activity: {
        totalGenerations,
        generationsByPlatform: { web: genWeb, telegram: genTelegram, max: genMax },
        generationsBySource: {
          web: byInitiated['web'] ?? 0,
          telegram_bot: byInitiated['telegram_bot'] ?? 0,
          max_bot: byInitiated['max_bot'] ?? 0,
        },
        creditsBalance: subscription?.creditsBalance ?? null,
        creditsUsed: subscription?.creditsUsed ?? null,
        subscriptionPlan: subscription?.plan?.planName ?? null,
        subscriptionPlanKey: subscription?.plan?.planKey ?? null,
        subscriptionStatus: subscription?.status ?? null,
        subscriptionEndDate: subscription?.endDate ?? null,
        lastActiveAt,
        lastBotActiveAt: botUser?.lastActiveAt ?? null,
      },
      botCreditHistory: (botCredHistory as any[]).map(t => ({
        amount: t.amount,
        balanceBefore: t.balanceBefore,
        balanceAfter: t.balanceAfter,
        reason: t.reason,
        generationType: t.generationType,
        createdAt: t.createdAt,
      })),

      onboardingSteps: (onboardingSteps as any[]).map(s => ({ step: s.step, completedAt: s.completedAt })),

      engagement: {
        window: windowStats,
        currentStreak: streaks.current,
        maxStreak: streaks.max,
        heatmap: (heatmapRows as any[]).map(r => ({ date: r.d, count: Number(r.cnt) })),
        weeklyActivity: (weeklyRows as any[]).map(r => ({ week: r.w, count: Number(r.cnt) })),
        hourPattern: Array.from({ length: 24 }, (_, h) => ({
          hour: h,
          count: Number((hourRows as any[]).find((r: any) => r.h === h)?.cnt ?? 0),
        })),
        dowPattern: Array.from({ length: 7 }, (_, dow) => ({
          dow,
          count: Number((dowRows as any[]).find((r: any) => r.dow === dow)?.cnt ?? 0),
        })),
        byType: (() => {
          const rows = byTypeRows as any[];
          const total = rows.reduce((s: number, r: any) => s + Number(r.cnt), 0);
          return rows.map(r => ({
            type: r.generation_type,
            count: Number(r.cnt),
            pct: total > 0 ? Math.round((Number(r.cnt) / total) * 100) : 0,
            avgTokens: Number(r.avg_tokens ?? 0),
            avgCost: Number(r.avg_cost ?? 0),
          }));
        })(),
        platformOverTime,
      },

      revenue: {
        ltv,
        paymentCount,
        avgPayment,
        allPayments: (allPayments as any[]).map(p => ({
          date: p.createdAt,
          planKey: p.planKey,
          amount: Number(p.amount),
        })),
        creditBurnRate: (creditBurnRows as any[]).map(r => ({
          month: r.m,
          spent: Number(r.spent),
          granted: Number(r.granted),
        })),
        forecastDaysLeft,
        planHistory: (planHistoryRows as any[]).map(r => ({
          planKey: r.plan_key,
          count: Number(r.count),
          firstAt: r.first_at,
          lastAt: r.last_at,
        })),
      },

      retention: {
        weeklyGrid,
        retentionScore,
        gaps: (gapRows as any[]).map(r => ({
          from: r.prev_d,
          to: r.curr_d,
          days: Number(r.gap_days),
        })),
        longestGap: (gapRows as any[])[0]?.gap_days ? Number((gapRows as any[])[0].gap_days) : 0,
      },

      depth: {
        lessons: Number((depthRow as any[])[0]?.lessons ?? 0),
        classes: Number((depthRow as any[])[0]?.classes ?? 0),
        students: Number((depthRow as any[])[0]?.students ?? 0),
        assignments: Number((depthRow as any[])[0]?.assignments ?? 0),
        firstLessonAt: (depthRow as any[])[0]?.first_lesson_at ?? null,
        firstAssignmentAt: (depthRow as any[])[0]?.first_assignment_at ?? null,
        firstClassAt: (depthRow as any[])[0]?.first_class_at ?? null,
        firstStudentAt: (depthRow as any[])[0]?.first_student_at ?? null,
        inLesson: Number((inLessonRow as any[])[0]?.in_lesson ?? 0),
        standalone: Number((inLessonRow as any[])[0]?.standalone ?? 0),
        topTopics: (topTopicsRows as any[]).map(r => ({ topic: r.topic, count: Number(r.cnt) })),
      },
    };
  }

  async exportUserCjmCsv(userId: string): Promise<string> {
    const cjm = await this.getUserCjm(userId, 30);
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
      select: { id: true, username: true, firstName: true, lastName: true, email: true, phone: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const fmt = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const fmtDate = (d: Date | null) => d ? new Date(d).toISOString() : '';

    const header = [
      // Идентификация
      'ID', 'Username', 'Имя', 'Фамилия', 'Email', 'Телефон',
      // Аквизиция
      'Источник', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Content', 'UTM Term',
      'UTM Landing Page', 'UTM Link Name', 'UTM Link URL', 'Реферальный код',
      // Бот
      'Бот: платформа', 'Бот: старт', 'Бот: статус регистрации', 'Бот: кредиты',
      'Бот: всего генераций', 'Бот: генераций в мес.', 'Бот: посл. генерация',
      // Ключевые события
      'Регистрация на платформе',
      'Первая генерация: дата', 'Первая генерация: тип', 'Первая генерация: стоимость',
      'Первая оплата: дата', 'Первая оплата: тариф', 'Первая оплата: сумма',
      // Тайминги
      'Дней до первой генерации', 'Дней до первой оплаты', 'Дней с регистрации', 'Дней без активности',
      // CJM статус
      'Текущий этап', 'Churn Risk', 'Сигналы оттока',
      // Активность
      'Всего генераций', 'Генерации Web', 'Генерации Telegram', 'Генерации MAX',
      'Streak текущий (дн)', 'Streak максимальный (дн)',
      // Подписка и кредиты
      'Тариф', 'Статус подписки', 'Окончание подписки', 'Баланс кредитов', 'Потрачено кредитов',
      'Прогноз дней (кредиты)',
      // Retention
      'Retention score (%)', 'Макс. перерыв (дн)',
      // Глубина
      'Уроков', 'Классов', 'Учеников', 'ДЗ',
      'Генераций в уроке', 'Standalone генераций',
      // Монетизация
      'LTV (руб)', 'Платежей', 'Ср. чек (руб)',
      // Активность
      'Последняя активность', 'Последняя активность в боте',
    ].map(fmt).join(',');

    const row = [
      // Идентификация
      user.id, user.username, user.firstName, user.lastName, user.email, user.phone,
      // Аквизиция
      cjm.acquisition.source, cjm.acquisition.utmSource, cjm.acquisition.utmMedium,
      cjm.acquisition.utmCampaign, cjm.acquisition.utmContent, cjm.acquisition.utmTerm,
      cjm.acquisition.utmLandingPage, cjm.acquisition.utmLinkName, cjm.acquisition.utmLinkUrl,
      cjm.acquisition.referredByCode,
      // Бот
      cjm.journey.botPlatform, fmtDate(cjm.journey.botStartedAt), cjm.journey.botRegistrationStatus, cjm.journey.botCredits,
      cjm.journey.botTotalGenerations, cjm.journey.botGenerationsThisMonth, fmtDate(cjm.journey.botLastGenerationAt),
      // Ключевые события
      fmtDate(cjm.journey.platformRegisteredAt),
      fmtDate(cjm.journey.firstGenerationAt), cjm.journey.firstGenerationType, cjm.journey.firstGenerationCreditCost,
      fmtDate(cjm.journey.firstPaymentAt), cjm.journey.firstPaymentPlan, cjm.journey.firstPaymentAmount,
      // Тайминги
      cjm.timings.daysToFirstGen, cjm.timings.daysToFirstPayment,
      cjm.timings.daysSinceRegistration, cjm.timings.daysSinceLastActivity,
      // CJM статус
      cjm.currentStage, cjm.churnRisk, cjm.churnSignals.join('; '),
      // Активность
      cjm.activity.totalGenerations, cjm.activity.generationsByPlatform.web,
      cjm.activity.generationsByPlatform.telegram, cjm.activity.generationsByPlatform.max,
      cjm.engagement.currentStreak, cjm.engagement.maxStreak,
      // Подписка и кредиты
      cjm.activity.subscriptionPlan, cjm.activity.subscriptionStatus,
      fmtDate(cjm.activity.subscriptionEndDate), cjm.activity.creditsBalance, cjm.activity.creditsUsed,
      cjm.revenue.forecastDaysLeft,
      // Retention
      cjm.retention.retentionScore, cjm.retention.longestGap,
      // Глубина
      cjm.depth.lessons, cjm.depth.classes, cjm.depth.students, cjm.depth.assignments,
      cjm.depth.inLesson, cjm.depth.standalone,
      // Монетизация
      cjm.revenue.ltv, cjm.revenue.paymentCount, cjm.revenue.avgPayment,
      // Активность
      fmtDate(cjm.activity.lastActiveAt), fmtDate(cjm.activity.lastBotActiveAt),
    ].map(fmt).join(',');

    return `${header}\n${row}`;
  }

  /**
   * Список всех, кого пригласил пользователь (рефералы, где он — referrer).
   * Подгружает имя приглашённого: AppUser для teacher_teacher, Student для
   * teacher_student / student_student.
   */
  async getUserReferrals(userId: string) {
    const referrals = await this.prisma.referral.findMany({
      where: { referrerUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        referralCode: { select: { code: true } },
      },
    });

    if (referrals.length === 0) {
      return {
        success: true,
        summary: { total: 0, registered: 0, activated: 0, converted: 0 },
        items: [],
      };
    }

    // Разделяем referredUserId по типу, чтобы одним batch-запросом
    // подтянуть имена учителей и учеников.
    const teacherIds = referrals
      .filter((r) => r.referredType === 'teacher')
      .map((r) => r.referredUserId);
    const studentIds = referrals
      .filter((r) => r.referredType === 'student')
      .map((r) => r.referredUserId);

    const [teachers, students] = await Promise.all([
      teacherIds.length > 0
        ? this.prisma.appUser.findMany({
            where: { id: { in: teacherIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              email: true,
            },
          })
        : Promise.resolve([] as any[]),
      studentIds.length > 0
        ? this.prisma.student.findMany({
            where: { id: { in: studentIds } },
            select: {
              id: true,
              name: true,
              email: true,
              class: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve([] as any[]),
    ]);

    const teacherById = new Map(teachers.map((t: any) => [t.id, t]));
    const studentById = new Map(students.map((s: any) => [s.id, s]));

    const items = referrals.map((r) => {
      const invited = r.referredType === 'teacher'
        ? teacherById.get(r.referredUserId)
        : studentById.get(r.referredUserId);
      const displayName = invited
        ? r.referredType === 'teacher'
          ? [invited.firstName, invited.lastName].filter(Boolean).join(' ')
            || (invited.username ? `@${invited.username}` : '') || invited.email || r.referredUserId
          : invited.name || invited.email || r.referredUserId
        : '(удалённый пользователь)';

      return {
        id: r.id,
        referredUserId: r.referredUserId,
        referredType: r.referredType,
        referralType: r.referralType,
        status: r.status,
        rewardGranted: r.rewardGranted,
        conversionRewardGranted: r.conversionRewardGranted,
        createdAt: r.createdAt,
        activatedAt: r.activatedAt,
        convertedAt: r.convertedAt,
        code: r.referralCode?.code || null,
        invited: invited
          ? {
              name: displayName,
              email: (invited as any).email || null,
              username: (invited as any).username || null,
              className:
                r.referredType === 'student'
                  ? (invited as any).class?.name || null
                  : null,
              exists: true,
            }
          : { name: displayName, exists: false },
      };
    });

    const summary = {
      total: referrals.length,
      registered: referrals.filter((r) => r.status === 'registered').length,
      activated: referrals.filter((r) => r.status === 'activated').length,
      converted: referrals.filter((r) => r.status === 'converted').length,
    };

    return { success: true, summary, items };
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
    const db = this.prisma as any;
    const now = new Date();
    const daysBetween = (a: Date, b: Date) => Math.floor(Math.abs(b.getTime() - a.getTime()) / 86400000);

    const users = await this.prisma.appUser.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, username: true, firstName: true, lastName: true,
        phone: true, email: true, source: true, telegramId: true, maxId: true,
        createdAt: true, lastAccessAt: true, lastTelegramAppAccess: true, lastMaxAppAccess: true,
        utmSource: true, utmMedium: true, utmCampaign: true,
        utmContent: true, utmTerm: true, utmLandingPage: true, utmLinkId: true,
        referredByCode: true,
        subscription: {
          select: {
            creditsBalance: true, creditsUsed: true, status: true, endDate: true,
            plan: { select: { planName: true, planKey: true } },
          },
        },
        _count: { select: { generations: true, classes: true } },
      },
    });

    // Для каждого пользователя подгружаем BotUser, первую генерацию, первый платёж
    const userIds = users.map(u => u.id);
    const [botUsers, firstGens, firstPayments, genPlatforms] = await Promise.all([
      db.botUser.findMany({
        where: { appUserId: { in: userIds } },
        select: { appUserId: true, source: true, registrationStatus: true, createdAt: true, lastActiveAt: true, botCredits: true },
      }),
      // Первая генерация на пользователя (ROW_NUMBER)
      this.prisma.$queryRaw<{ userId: string; createdAt: Date; generationType: string }[]>`
        SELECT DISTINCT ON ("userId") "userId", "createdAt", "generationType"
        FROM user_generations ORDER BY "userId", "createdAt" ASC
      `,
      this.prisma.payment.findMany({
        where: { userId: { in: userIds }, status: 'completed' },
        orderBy: { createdAt: 'asc' },
        select: { userId: true, createdAt: true, planKey: true, amount: true },
        distinct: ['userId'],
      }),
      // Генерации по платформам для всех пользователей
      this.prisma.$queryRaw<{ userId: string; sentToTelegram: boolean; sentToMax: boolean; cnt: bigint }[]>`
        SELECT "userId",
          "sentToTelegram",
          "sentToMax",
          COUNT(*) AS cnt
        FROM user_generations
        GROUP BY "userId", "sentToTelegram", "sentToMax"
      `,
    ]);

    const botByUser = new Map((botUsers as any[]).map((b: any) => [b.appUserId, b]));
    const firstGenByUser = new Map((firstGens as any[]).map((g: any) => [g.userId, g]));
    const firstPayByUser = new Map((firstPayments as any[]).map((p: any) => [p.userId, p]));

    // Генерации по платформам
    const genPlatByUser = new Map<string, { web: number; telegram: number; max: number }>();
    for (const row of genPlatforms as any[]) {
      const uid = row.userId;
      if (!genPlatByUser.has(uid)) genPlatByUser.set(uid, { web: 0, telegram: 0, max: 0 });
      const g = genPlatByUser.get(uid)!;
      const cnt = Number(row.cnt);
      if (row.sentToTelegram) g.telegram += cnt;
      else if (row.sentToMax) g.max += cnt;
      else g.web += cnt;
    }

    const fmt = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const fmtDate = (d: Date | null | undefined) => d ? new Date(d).toISOString() : '';

    const computeLastActive = (u: any, bot: any): Date | null => {
      const dates = [u.lastAccessAt, u.lastTelegramAppAccess, u.lastMaxAppAccess, bot?.lastActiveAt]
        .filter((d: any): d is Date => d instanceof Date);
      return dates.length > 0 ? new Date(Math.max(...dates.map((d: Date) => d.getTime()))) : null;
    };

    const computeStage = (u: any, totalGens: number): string => {
      const sub = u.subscription;
      const subActive = sub?.status === 'active';
      const subExpired = sub && !subActive;
      const lastActive = computeLastActive(u, botByUser.get(u.id));
      const daysSinceLast = lastActive ? daysBetween(lastActive, now) : null;
      if (!sub && totalGens === 0) return 'registered_only';
      if (!sub && totalGens > 0) return 'generating_free';
      if (subActive) return 'subscribed_active';
      if (subExpired && daysSinceLast !== null && daysSinceLast <= 30) return 'subscribed_expired';
      return 'churned';
    };

    const computeChurnRisk = (u: any, totalGens: number): string => {
      const sub = u.subscription;
      const lastActive = computeLastActive(u, botByUser.get(u.id));
      const daysSinceLast = lastActive ? daysBetween(lastActive, now) : null;
      if ((daysSinceLast !== null && daysSinceLast > 30) || (sub && sub.status !== 'active')) return 'high';
      if (daysSinceLast !== null && daysSinceLast > 7) return 'medium';
      if (sub?.creditsBalance === 0 || totalGens === 0) return 'medium';
      return 'low';
    };

    const header = [
      'ID', 'Username', 'Имя', 'Фамилия', 'Телефон', 'Email',
      'Источник', 'Telegram ID', 'MAX ID',
      // UTM
      'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Content', 'UTM Term', 'UTM Landing Page', 'UTM Link ID', 'Реферальный код',
      // Бот
      'Бот: платформа', 'Бот: старт', 'Бот: статус', 'Бот: кредиты',
      // Этапы
      'Дата регистрации',
      'Первая генерация: дата', 'Первая генерация: тип',
      'Первая оплата: дата', 'Первая оплата: тариф',
      // Тайминги
      'Дней до первой генерации', 'Дней до первой оплаты', 'Дней с регистрации', 'Дней без активности',
      // Активность
      'Генерации всего', 'Генерации Web', 'Генерации Telegram', 'Генерации MAX', 'Классы',
      // Подписка
      'Тариф', 'Статус подписки', 'Окончание подписки', 'Баланс кредитов', 'Потрачено кредитов',
      // CJM
      'Текущий этап', 'Churn Risk',
      'Последняя активность',
    ].map(fmt).join(',');

    const dataRows = users.map((u) => {
      const bot = botByUser.get(u.id);
      const fg = firstGenByUser.get(u.id);
      const fp = firstPayByUser.get(u.id);
      const gp = genPlatByUser.get(u.id) ?? { web: 0, telegram: 0, max: 0 };
      const totalGens = gp.web + gp.telegram + gp.max;
      const lastActive = computeLastActive(u, bot);
      const daysToFg = fg ? daysBetween(u.createdAt, fg.createdAt) : null;
      const daysToFp = fp ? daysBetween(u.createdAt, fp.createdAt) : null;
      const daysSinceReg = daysBetween(u.createdAt, now);
      const daysSinceLast = lastActive ? daysBetween(lastActive, now) : null;

      return [
        u.id, u.username, u.firstName, u.lastName, u.phone, u.email,
        u.source, u.telegramId, u.maxId,
        u.utmSource, u.utmMedium, u.utmCampaign, u.utmContent, u.utmTerm, u.utmLandingPage, u.utmLinkId, u.referredByCode,
        bot?.source, fmtDate(bot?.createdAt), bot?.registrationStatus, bot?.botCredits,
        fmtDate(u.createdAt),
        fmtDate(fg?.createdAt), fg?.generationType,
        fmtDate(fp?.createdAt), fp?.planKey,
        daysToFg, daysToFp, daysSinceReg, daysSinceLast,
        totalGens, gp.web, gp.telegram, gp.max, u._count.classes,
        u.subscription?.plan?.planName, u.subscription?.status,
        fmtDate(u.subscription?.endDate), u.subscription?.creditsBalance, u.subscription?.creditsUsed,
        computeStage(u, totalGens), computeChurnRisk(u, totalGens),
        fmtDate(lastActive),
      ].map(fmt).join(',');
    });

    return [header, ...dataRows].join('\n');
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
    bonusTokens?: number;
    linkTtl?: string;
  }) {
    const base = (data.baseUrl || 'https://prepodavai.ru').replace(/\/$/, '');
    const params = new URLSearchParams({
      utm_source: data.utmSource || 'direct',
      utm_medium: data.utmMedium || 'link',
      utm_campaign: data.utmCampaign || 'organic',
      ...(data.utmContent ? { utm_content: data.utmContent } : {}),
      ...(data.utmTerm ? { utm_term: data.utmTerm } : {}),
    });
    const fullUrl = `${base}?${params.toString()}`;

    let link = await this.db.utmLink.create({
      data: {
        name: data.name,
        socialNetwork: data.socialNetwork,
        utmSource: data.utmSource,
        utmMedium: data.utmMedium,
        utmCampaign: data.utmCampaign,
        utmContent: data.utmContent ?? null,
        utmTerm: data.utmTerm ?? null,
        baseUrl: base,
        fullUrl, // Temporary, will be updated with lid
        bonusTokens: data.bonusTokens ?? 0,
        linkTtl: data.linkTtl ?? 'always',
        updatedAt: new Date(),
      },
    });

    // Добавляем lid в итоговую ссылку для однозначной идентификации
    const finalUrl = `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}lid=${link.id}`;
    link = await this.db.utmLink.update({
      where: { id: link.id },
      data: { fullUrl: finalUrl },
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

  /**
   * Аналитика адопшна фич M1-M4 (проверка ДЗ ИИ, аналитика, календарь, теги).
   * Считается только по реальным данным в БД, без отдельного трекинга событий.
   */
  async getM14Metrics(days = 30) {
    // === M1: проверка работ (ИИ-фидбек + обычное оценивание) ===
    // Считаем проверки за период + число уникальных учителей
    type GradedRow = { cnt: bigint; with_feedback: bigint; unique_teachers: bigint };
    const [m1Overall]: GradedRow[] = await this.prisma.$queryRaw`
      SELECT
        COUNT(*) AS cnt,
        COUNT(*) FILTER (WHERE s.feedback IS NOT NULL AND LENGTH(TRIM(s.feedback)) > 0) AS with_feedback,
        COUNT(DISTINCT COALESCE(cl."teacherId", stcl."teacherId")) AS unique_teachers
      FROM submissions s
      INNER JOIN assignments a ON a.id = s."assignmentId"
      LEFT JOIN classes cl ON cl.id = a."classId"
      LEFT JOIN students st ON st.id = a."studentId"
      LEFT JOIN classes stcl ON stcl.id = st."classId"
      WHERE s.grade IS NOT NULL
        AND s."updatedAt" > NOW() - (${days} || ' days')::interval
    `;

    type DailyGrading = { day: Date; graded: bigint };
    const m1Daily: DailyGrading[] = await this.prisma.$queryRaw`
      SELECT DATE(s."updatedAt") AS day, COUNT(*) AS graded
      FROM submissions s
      WHERE s.grade IS NOT NULL
        AND s."updatedAt" > NOW() - (${days} || ' days')::interval
      GROUP BY day
      ORDER BY day
    `;

    // === M3: расписание уроков ===
    type SchedRow = { scheduled: bigint; total: bigint; with_class: bigint; teachers: bigint };
    const [m3]: SchedRow[] = await this.prisma.$queryRaw`
      SELECT
        COUNT(*) FILTER (WHERE "scheduledAt" IS NOT NULL) AS scheduled,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE "scheduledAt" IS NOT NULL AND "classId" IS NOT NULL) AS with_class,
        COUNT(DISTINCT "userId") FILTER (WHERE "scheduledAt" IS NOT NULL) AS teachers
      FROM lessons
    `;

    type UpcomingRow = { cnt: bigint; teachers: bigint };
    const [m3Upcoming]: UpcomingRow[] = await this.prisma.$queryRaw`
      SELECT COUNT(*) AS cnt, COUNT(DISTINCT "userId") AS teachers
      FROM lessons
      WHERE "scheduledAt" IS NOT NULL
        AND "scheduledAt" >= NOW()
        AND "scheduledAt" < NOW() + INTERVAL '7 days'
    `;

    // === M4: теги в библиотеке ===
    type TagsRow = { tagged: bigint; total: bigint; teachers: bigint; avg_tags: number };
    const [m4]: TagsRow[] = await this.prisma.$queryRaw`
      SELECT
        COUNT(*) FILTER (WHERE array_length(tags, 1) > 0) AS tagged,
        COUNT(*) AS total,
        COUNT(DISTINCT "userId") FILTER (WHERE array_length(tags, 1) > 0) AS teachers,
        COALESCE(AVG(array_length(tags, 1)) FILTER (WHERE array_length(tags, 1) > 0), 0) AS avg_tags
      FROM lessons
    `;

    type TopTagRow = { tag: string; cnt: bigint };
    const m4TopTags: TopTagRow[] = await this.prisma.$queryRaw`
      SELECT t AS tag, COUNT(*) AS cnt
      FROM lessons, unnest(tags) AS t
      GROUP BY t
      ORDER BY cnt DESC
      LIMIT 20
    `;

    // === M2: опосредованно — наличие оценок, по которым работает risk-скоринг ===
    // (Прямого трекинга посещений страниц аналитики нет)
    type M2Row = { eligible_students: bigint };
    const [m2]: M2Row[] = await this.prisma.$queryRaw`
      SELECT COUNT(*) AS eligible_students FROM (
        SELECT "studentId"
        FROM submissions
        WHERE grade IS NOT NULL
        GROUP BY "studentId"
        HAVING COUNT(*) >= 3
      ) eligible
    `;

    // Totals для процентов
    const [{ cnt: totalTeachersBig }]: { cnt: bigint }[] = await this.prisma.$queryRaw`
      SELECT COUNT(*) AS cnt FROM app_users
    `;
    const totalTeachers = Number(totalTeachersBig ?? 0);

    const m1GradedCount = Number(m1Overall?.cnt ?? 0);
    const m1WithFeedback = Number(m1Overall?.with_feedback ?? 0);
    const m1UniqueTeachers = Number(m1Overall?.unique_teachers ?? 0);

    const m3Scheduled = Number(m3?.scheduled ?? 0);
    const m3Total = Number(m3?.total ?? 0);
    const m3Teachers = Number(m3?.teachers ?? 0);

    const m4Tagged = Number(m4?.tagged ?? 0);
    const m4Total = Number(m4?.total ?? 0);
    const m4Teachers = Number(m4?.teachers ?? 0);

    return {
      days,
      generatedAt: new Date(),
      totalTeachers,
      m1: {
        gradedCount: m1GradedCount,
        withFeedbackCount: m1WithFeedback,
        withFeedbackPct: m1GradedCount > 0
          ? Math.round((m1WithFeedback / m1GradedCount) * 100)
          : 0,
        uniqueTeachers: m1UniqueTeachers,
        adoptionPct: totalTeachers > 0
          ? Math.round((m1UniqueTeachers / totalTeachers) * 100)
          : 0,
        daily: m1Daily.map(r => ({
          day: r.day,
          graded: Number(r.graded),
        })),
      },
      m2: {
        eligibleStudents: Number(m2?.eligible_students ?? 0),
        note: 'Минимум 3 оценки — ученик готов для risk-скоринга',
      },
      m3: {
        scheduledLessons: m3Scheduled,
        totalLessons: m3Total,
        schedulePct: m3Total > 0 ? Math.round((m3Scheduled / m3Total) * 100) : 0,
        withClass: Number(m3?.with_class ?? 0),
        uniqueTeachers: m3Teachers,
        adoptionPct: totalTeachers > 0
          ? Math.round((m3Teachers / totalTeachers) * 100)
          : 0,
        upcoming7d: Number(m3Upcoming?.cnt ?? 0),
        upcomingTeachers7d: Number(m3Upcoming?.teachers ?? 0),
      },
      m4: {
        taggedLessons: m4Tagged,
        totalLessons: m4Total,
        tagPct: m4Total > 0 ? Math.round((m4Tagged / m4Total) * 100) : 0,
        avgTagsPerLesson: m4Total > 0
          ? Math.round(Number(m4?.avg_tags ?? 0) * 10) / 10
          : 0,
        uniqueTeachers: m4Teachers,
        adoptionPct: totalTeachers > 0
          ? Math.round((m4Teachers / totalTeachers) * 100)
          : 0,
        topTags: m4TopTags.map(r => ({ tag: r.tag, count: Number(r.cnt) })),
      },
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

  // ========== ADMIN MANAGEMENT ==========

  private getAdminIds(): string[] {
    return (process.env.ADMIN_USER_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
  }

  private persistAdminIds(ids: string[]) {
    const value = ids.join(',');
    process.env.ADMIN_USER_IDS = value;

    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;

    let content = fs.readFileSync(envPath, 'utf8');
    const regex = /^ADMIN_USER_IDS=.*$/m;
    if (regex.test(content)) {
      content = content.replace(regex, `ADMIN_USER_IDS=${value}`);
    } else {
      content += `\nADMIN_USER_IDS=${value}`;
    }
    fs.writeFileSync(envPath, content, 'utf8');
  }

  async getAdmins() {
    const adminIds = this.getAdminIds();
    if (adminIds.length === 0) return { admins: [], total: 0 };

    const users = await this.prisma.appUser.findMany({
      where: { id: { in: adminIds } },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        lastAccessAt: true,
      },
    });

    return { admins: users, total: users.length };
  }

  async addAdmin(userId: string, requestingAdminId: string) {
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
      select: { id: true, username: true, firstName: true, lastName: true },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    const adminIds = this.getAdminIds();
    if (adminIds.includes(userId)) {
      throw new BadRequestException('Пользователь уже является администратором');
    }

    adminIds.push(userId);
    this.persistAdminIds(adminIds);

    await this.logsService.saveLog({ category: 'admin', level: 'info', message: `Admin added: ${user.username} (${userId}) by admin ${requestingAdminId}` });

    return { success: true, user };
  }

  async removeAdmin(userId: string, requestingAdminId: string) {
    if (userId === requestingAdminId) {
      throw new ForbiddenException('Нельзя удалить самого себя из администраторов');
    }

    const adminIds = this.getAdminIds();
    if (!adminIds.includes(userId)) {
      throw new NotFoundException('Пользователь не является администратором');
    }

    if (adminIds.length === 1) {
      throw new BadRequestException('Невозможно удалить последнего администратора');
    }

    const newIds = adminIds.filter((id) => id !== userId);
    this.persistAdminIds(newIds);

    await this.logsService.saveLog({ category: 'admin', level: 'info', message: `Admin removed: ${userId} by admin ${requestingAdminId}` });

    return { success: true };
  }

  // ========== BOT ANALYTICS ==========
  async getBotAnalytics(days = 30) {
    const [
      totalBotUsers,
      telegramUsers,
      maxUsers,
      bothPlatforms,
      pending,
      registered,
      linked,
      usersWithGenerations,
      usersWithoutGenerations,
      totalGensTelegram,
      totalGensMax,
      telegramActive7d,
      telegramActive30d,
      maxActive7d,
      maxActive30d,
      telegramZeroCredits,
      maxZeroCredits,
      totalGensAnyBot,
    ] = await Promise.all([
      this.prisma.botUser.count(),
      this.prisma.botUser.count({ where: { telegramId: { not: null } } }),
      this.prisma.botUser.count({ where: { maxId: { not: null } } }),
      this.prisma.botUser.count({ where: { telegramId: { not: null }, maxId: { not: null } } }),
      this.prisma.botUser.count({ where: { registrationStatus: 'pending' } }),
      this.prisma.botUser.count({ where: { registrationStatus: 'registered' } }),
      this.prisma.botUser.count({ where: { registrationStatus: 'linked' } }),
      this.prisma.botUser.count({ where: { totalGenerations: { gt: 0 } } }),
      this.prisma.botUser.count({ where: { totalGenerations: 0 } }),
      this.prisma.userGeneration.count({ where: { sentToTelegram: true } }),
      this.prisma.userGeneration.count({ where: { sentToMax: true } }),
      this.prisma.botUser.count({ where: { telegramId: { not: null }, lastActiveAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
      this.prisma.botUser.count({ where: { telegramId: { not: null }, lastActiveAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
      this.prisma.botUser.count({ where: { maxId: { not: null }, lastActiveAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
      this.prisma.botUser.count({ where: { maxId: { not: null }, lastActiveAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
      this.prisma.botUser.count({ where: { telegramId: { not: null }, botCredits: 0 } }),
      this.prisma.botUser.count({ where: { maxId: { not: null }, botCredits: 0 } }),
      this.prisma.userGeneration.count({ where: { OR: [{ sentToTelegram: true }, { sentToMax: true }] } }),
    ]);

    // Avg credits per platform
    type AvgRow = { avg: number | null };
    const [telegramAvgCreditsRow, maxAvgCreditsRow] = await Promise.all([
      this.prisma.$queryRaw<AvgRow[]>`
        SELECT ROUND(AVG("botCredits")::numeric, 1)::float AS avg FROM bot_users WHERE "telegramId" IS NOT NULL
      `,
      this.prisma.$queryRaw<AvgRow[]>`
        SELECT ROUND(AVG("botCredits")::numeric, 1)::float AS avg FROM bot_users WHERE "maxId" IS NOT NULL
      `,
    ]);

    // Daily new bot users (last N days)
    type DailyNewRow = { day: Date; telegram: bigint; max: bigint };
    const dailyNew: DailyNewRow[] = await this.prisma.$queryRaw`
      SELECT
        DATE("createdAt") AS day,
        COUNT(*) FILTER (WHERE "telegramId" IS NOT NULL) AS telegram,
        COUNT(*) FILTER (WHERE "maxId" IS NOT NULL) AS max
      FROM bot_users
      WHERE "createdAt" > NOW() - (${days} || ' days')::interval
      GROUP BY day
      ORDER BY day
    `;

    // Daily generations per platform (last N days)
    type DailyGenRow = { day: Date; telegram: bigint; max: bigint };
    const dailyGenerations: DailyGenRow[] = await this.prisma.$queryRaw`
      SELECT
        DATE("createdAt") AS day,
        COUNT(*) FILTER (WHERE "sentToTelegram" = true) AS telegram,
        COUNT(*) FILTER (WHERE "sentToMax" = true) AS max
      FROM user_generations
      WHERE "createdAt" > NOW() - (${days} || ' days')::interval
      GROUP BY day
      ORDER BY day
    `;

    // Top generation types per platform
    type TopTypeRow = { type: string; cnt: bigint };
    const [topTypesTelegram, topTypesMax] = await Promise.all([
      this.prisma.$queryRaw<TopTypeRow[]>`
        SELECT "generationType" AS type, COUNT(*) AS cnt
        FROM user_generations
        WHERE "sentToTelegram" = true
        GROUP BY "generationType"
        ORDER BY cnt DESC
        LIMIT 10
      `,
      this.prisma.$queryRaw<TopTypeRow[]>`
        SELECT "generationType" AS type, COUNT(*) AS cnt
        FROM user_generations
        WHERE "sentToMax" = true
        GROUP BY "generationType"
        ORDER BY cnt DESC
        LIMIT 10
      `,
    ]);

    // Funnel: точные данные по платформе из UserGeneration (не из totalGenerations, который суммарный)
    type FunnelRow = { cnt: bigint };
    const [
      tgUsersWithGen,
      tgUsers5plus,
      tgUsers20plus,
      maxUsersWithGen,
      maxUsers5plus,
      maxUsers20plus,
    ] = await Promise.all([
      this.prisma.$queryRaw<FunnelRow[]>`
        SELECT COUNT(DISTINCT "userId") AS cnt
        FROM user_generations
        WHERE "sentToTelegram" = true
      `,
      this.prisma.$queryRaw<FunnelRow[]>`
        SELECT COUNT(*) AS cnt FROM (
          SELECT u."userId", COUNT(*) AS gens
          FROM user_generations u
          WHERE u."sentToTelegram" = true
          GROUP BY u."userId" HAVING COUNT(*) >= 5
        ) t
      `,
      this.prisma.$queryRaw<FunnelRow[]>`
        SELECT COUNT(*) AS cnt FROM (
          SELECT u."userId", COUNT(*) AS gens
          FROM user_generations u
          WHERE u."sentToTelegram" = true
          GROUP BY u."userId" HAVING COUNT(*) >= 20
        ) t
      `,
      this.prisma.$queryRaw<FunnelRow[]>`
        SELECT COUNT(DISTINCT u."userId") AS cnt
        FROM user_generations u
        WHERE u."sentToMax" = true
      `,
      this.prisma.$queryRaw<FunnelRow[]>`
        SELECT COUNT(*) AS cnt FROM (
          SELECT u."userId", COUNT(*) AS gens
          FROM user_generations u
          WHERE u."sentToMax" = true
          GROUP BY u."userId" HAVING COUNT(*) >= 5
        ) t
      `,
      this.prisma.$queryRaw<FunnelRow[]>`
        SELECT COUNT(*) AS cnt FROM (
          SELECT u."userId", COUNT(*) AS gens
          FROM user_generations u
          WHERE u."sentToMax" = true
          GROUP BY u."userId" HAVING COUNT(*) >= 20
        ) t
      `,
    ]);

    // Registration status per platform
    type RegRow = { status: string; cnt: bigint };
    const [telegramByStatus, maxByStatus] = await Promise.all([
      this.prisma.$queryRaw<RegRow[]>`
        SELECT "registrationStatus" AS status, COUNT(*) AS cnt
        FROM bot_users WHERE "telegramId" IS NOT NULL
        GROUP BY "registrationStatus"
      `,
      this.prisma.$queryRaw<RegRow[]>`
        SELECT "registrationStatus" AS status, COUNT(*) AS cnt
        FROM bot_users WHERE "maxId" IS NOT NULL
        GROUP BY "registrationStatus"
      `,
    ]);

    const toStatusMap = (rows: RegRow[]) =>
      Object.fromEntries(rows.map(r => [r.status, Number(r.cnt)]));

    return {
      overview: {
        totalBotUsers,
        telegramUsers,
        maxUsers,
        bothPlatforms,
        pending,
        registered,
        linked,
        usersWithGenerations,
        usersWithoutGenerations,
        totalGensTelegram,
        totalGensMax,
        totalGensAnyBot,
      },
      funnel: {
        telegram: {
          pressedStart: telegramUsers,
          registered: (toStatusMap(telegramByStatus)['registered'] ?? 0) + (toStatusMap(telegramByStatus)['linked'] ?? 0),
          firstGeneration: Number(tgUsersWithGen[0]?.cnt ?? 0),
          fivePlusGenerations: Number(tgUsers5plus[0]?.cnt ?? 0),
          twentyPlusGenerations: Number(tgUsers20plus[0]?.cnt ?? 0),
        },
        max: {
          pressedStart: maxUsers,
          registered: (toStatusMap(maxByStatus)['registered'] ?? 0) + (toStatusMap(maxByStatus)['linked'] ?? 0),
          firstGeneration: Number(maxUsersWithGen[0]?.cnt ?? 0),
          fivePlusGenerations: Number(maxUsers5plus[0]?.cnt ?? 0),
          twentyPlusGenerations: Number(maxUsers20plus[0]?.cnt ?? 0),
        },
      },
      activity: {
        telegram: {
          active7d: telegramActive7d,
          active30d: telegramActive30d,
          avgCredits: telegramAvgCreditsRow[0]?.avg ?? 0,
          zeroCredits: telegramZeroCredits,
        },
        max: {
          active7d: maxActive7d,
          active30d: maxActive30d,
          avgCredits: maxAvgCreditsRow[0]?.avg ?? 0,
          zeroCredits: maxZeroCredits,
        },
      },
      charts: {
        dailyNew: dailyNew.map(r => ({ day: r.day, telegram: Number(r.telegram), max: Number(r.max) })),
        dailyGenerations: dailyGenerations.map(r => ({ day: r.day, telegram: Number(r.telegram), max: Number(r.max) })),
        topTypesTelegram: topTypesTelegram.map(r => ({ type: r.type, count: Number(r.cnt) })),
        topTypesMax: topTypesMax.map(r => ({ type: r.type, count: Number(r.cnt) })),
      },
    };
  }

  // ========== AGGREGATE CJM ANALYTICS ==========

  private buildCjmUserFilter(opts: {
    periodDays?: number;
    platform?: 'web' | 'telegram' | 'max';
    utmSource?: string;
  }): Prisma.Sql {
    const clauses: Prisma.Sql[] = [];
    if (opts.periodDays && opts.periodDays > 0) {
      clauses.push(Prisma.sql`u."createdAt" >= NOW() - (${opts.periodDays}::int * INTERVAL '1 day')`);
    }
    if (opts.utmSource) {
      clauses.push(
        Prisma.sql`COALESCE(NULLIF(u."utmSource", ''), NULLIF(u.source, ''), 'direct') = ${opts.utmSource}`,
      );
    }
    if (opts.platform === 'web') {
      clauses.push(Prisma.sql`u."telegramId" IS NULL AND u."maxId" IS NULL`);
    } else if (opts.platform === 'telegram') {
      clauses.push(Prisma.sql`u."telegramId" IS NOT NULL`);
    } else if (opts.platform === 'max') {
      clauses.push(Prisma.sql`u."maxId" IS NOT NULL`);
    }
    if (clauses.length === 0) return Prisma.empty;
    return Prisma.sql`AND ${Prisma.join(clauses, ' AND ')}`;
  }

  async getCjmAnalytics(opts: {
    periodDays?: number;
    platform?: 'web' | 'telegram' | 'max';
    utmSource?: string;
  } = {}) {
    type Row = { [key: string]: any };
    const userFilter = this.buildCjmUserFilter(opts);

    const [
      stageRows,
      churnRows,
      genTimingRows,
      payTimingRows,
      acqRows,
      platformRows,
      initiatedRows,
      botUtmRows,
      regTrendRows,
      activationRows,
      onbStepRows,
      featureAdoptRows,
      userSegRows,
      revenueMrrRows,
      planDistRows,
      cohortRows,
      botFunnelRows,
      botCompareRows,
      referralRows,
      contentTypeRows,
      newUsersDailyRows,
      dayRetentionRows,
      availableUtmRows,
      sourceSegRows,
    ] = await Promise.all([
      // Stage distribution
      this.prisma.$queryRaw<Row[]>`
        WITH gen_counts AS (
          SELECT "userId", COUNT(*) AS cnt FROM user_generations GROUP BY "userId"
        )
        SELECT
          CASE
            WHEN s.id IS NULL AND COALESCE(g.cnt, 0) = 0 THEN 'registered_only'
            WHEN s.id IS NULL AND COALESCE(g.cnt, 0) > 0 THEN 'generating_free'
            WHEN s.status = 'active' THEN 'subscribed_active'
            WHEN s.id IS NOT NULL AND s.status != 'active'
                 AND GREATEST(u."lastAccessAt", u."lastTelegramAppAccess", u."lastMaxAppAccess") >= NOW() - INTERVAL '30 days'
                 THEN 'subscribed_expired'
            ELSE 'churned'
          END AS stage,
          COUNT(*) AS cnt
        FROM app_users u
        LEFT JOIN user_subscriptions s ON s."userId" = u.id
        LEFT JOIN gen_counts g ON g."userId" = u.id
        WHERE 1=1 ${userFilter}
        GROUP BY 1
      `,
      // Churn risk distribution
      this.prisma.$queryRaw<Row[]>`
        WITH user_data AS (
          SELECT
            GREATEST(u."lastAccessAt", u."lastTelegramAppAccess", u."lastMaxAppAccess") AS last_active,
            s.id AS sub_id,
            s.status AS sub_status
          FROM app_users u
          LEFT JOIN user_subscriptions s ON s."userId" = u.id
          WHERE 1=1 ${userFilter}
        )
        SELECT
          CASE
            WHEN last_active IS NULL OR last_active < NOW() - INTERVAL '30 days'
                 OR (sub_id IS NOT NULL AND sub_status != 'active') THEN 'high'
            WHEN last_active < NOW() - INTERVAL '7 days' THEN 'medium'
            ELSE 'low'
          END AS risk,
          COUNT(*) AS cnt
        FROM user_data
        GROUP BY 1
      `,
      // Avg + median days to first generation
      this.prisma.$queryRaw<Row[]>`
        SELECT
          ROUND(AVG(EXTRACT(EPOCH FROM (fg.first_gen - u."createdAt")) / 86400)::numeric, 1) AS avg_days,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (fg.first_gen - u."createdAt")) / 86400
          )::numeric, 1) AS p50_days
        FROM app_users u
        JOIN (
          SELECT "userId", MIN("createdAt") AS first_gen
          FROM user_generations
          GROUP BY "userId"
        ) fg ON fg."userId" = u.id
        WHERE 1=1 ${userFilter}
      `,
      // Avg + median days to first payment
      this.prisma.$queryRaw<Row[]>`
        SELECT
          ROUND(AVG(EXTRACT(EPOCH FROM (fp.first_pay - u."createdAt")) / 86400)::numeric, 1) AS avg_days,
          ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (fp.first_pay - u."createdAt")) / 86400
          )::numeric, 1) AS p50_days
        FROM app_users u
        JOIN (
          SELECT "userId", MIN("createdAt") AS first_pay
          FROM payments
          WHERE status = 'completed'
          GROUP BY "userId"
        ) fp ON fp."userId" = u.id
        WHERE 1=1 ${userFilter}
      `,
      // Acquisition source breakdown
      this.prisma.$queryRaw<Row[]>`
        SELECT
          COALESCE(NULLIF(u."utmSource", ''), NULLIF(u.source, ''), 'direct') AS source,
          COUNT(*) AS total,
          COUNT(fp."userId") AS paid,
          COUNT(ga."userId") AS generated
        FROM app_users u
        LEFT JOIN (SELECT DISTINCT "userId" FROM payments WHERE status = 'completed') fp ON fp."userId" = u.id
        LEFT JOIN (SELECT DISTINCT "userId" FROM user_generations) ga ON ga."userId" = u.id
        WHERE 1=1 ${userFilter}
        GROUP BY 1
        ORDER BY total DESC
        LIMIT 20
      `,
      // Platform mix
      this.prisma.$queryRaw<Row[]>`
        WITH bot_platforms AS (
          SELECT
            CASE
              WHEN "telegramId" IS NOT NULL AND "maxId" IS NOT NULL THEN 'both'
              WHEN "telegramId" IS NOT NULL THEN 'telegram'
              WHEN "maxId" IS NOT NULL THEN 'max'
            END AS platform,
            COUNT(*) AS cnt
          FROM bot_users
          GROUP BY 1
        ),
        web_count AS (
          SELECT COUNT(*) AS cnt
          FROM app_users u
          WHERE NOT EXISTS (SELECT 1 FROM bot_users b WHERE b."appUserId" = u.id)
        )
        SELECT 'web' AS platform, cnt FROM web_count
        UNION ALL
        SELECT platform, cnt FROM bot_platforms WHERE platform IS NOT NULL
      `,
      // Разбивка генераций по initiatedSource
      this.prisma.$queryRaw<Row[]>`
        SELECT
          COALESCE("initiatedSource", 'web') AS source,
          COUNT(*) AS cnt
        FROM user_generations
        GROUP BY 1
      `.catch(() => [] as Row[]),
      // Топ UTM-источников для бот-пользователей (startPayload / botUtmSource)
      this.prisma.$queryRaw<Row[]>`
        SELECT
          COALESCE(NULLIF("utmSource", ''), NULLIF("startPayload", ''), 'unknown') AS bot_source,
          COUNT(*) AS cnt
        FROM bot_users
        GROUP BY 1
        ORDER BY cnt DESC
        LIMIT 15
      `.catch(() => [] as Row[]),
      // Monthly registration trend (last 18 months)
      this.prisma.$queryRaw<Row[]>`
        SELECT TO_CHAR(DATE_TRUNC('month', u."createdAt"), 'YYYY-MM') AS m, COUNT(*)::int AS cnt
        FROM app_users u
        WHERE 1=1 ${userFilter}
        GROUP BY DATE_TRUNC('month', u."createdAt")
        ORDER BY m DESC LIMIT 18
      `,
      // Activation time brackets
      this.prisma.$queryRaw<Row[]>`
        WITH first_gen AS (
          SELECT "userId", MIN("createdAt") AS first_at
          FROM user_generations GROUP BY "userId"
        ),
        activation AS (
          SELECT u.id,
            EXTRACT(EPOCH FROM (fg.first_at - u."createdAt")) / 86400 AS days_to_gen
          FROM app_users u
          LEFT JOIN first_gen fg ON fg."userId" = u.id
          WHERE 1=1 ${userFilter}
        )
        SELECT
          COUNT(*) FILTER (WHERE days_to_gen IS NOT NULL AND days_to_gen <= 1)::int AS day1,
          COUNT(*) FILTER (WHERE days_to_gen > 1 AND days_to_gen <= 3)::int AS day1_3,
          COUNT(*) FILTER (WHERE days_to_gen > 3 AND days_to_gen <= 7)::int AS day3_7,
          COUNT(*) FILTER (WHERE days_to_gen > 7)::int AS day7plus,
          COUNT(*) FILTER (WHERE days_to_gen IS NULL)::int AS never,
          COUNT(*)::int AS total
        FROM activation
      `,
      // Onboarding step completion rates
      this.prisma.$queryRaw<Row[]>`
        SELECT step, COUNT(DISTINCT "userId")::int AS cnt
        FROM onboarding_quest_steps
        GROUP BY step
      `.catch(() => [] as Row[]),
      // Feature adoption per tool type
      this.prisma.$queryRaw<Row[]>`
        SELECT ug."generationType" AS generation_type, COUNT(DISTINCT ug."userId")::int AS unique_users
        FROM user_generations ug
        JOIN app_users u ON u.id = ug."userId"
        WHERE 1=1 ${userFilter}
        GROUP BY ug."generationType"
        ORDER BY unique_users DESC
      `,
      // User segmentation by activity level
      this.prisma.$queryRaw<Row[]>`
        WITH user_activity AS (
          SELECT u.id,
            COUNT(ug.id) FILTER (WHERE ug."createdAt" >= NOW() - INTERVAL '7 days') AS last_7d,
            COUNT(ug.id) FILTER (WHERE ug."createdAt" >= NOW() - INTERVAL '30 days') AS last_30d,
            COUNT(ug.id) FILTER (WHERE ug."createdAt" >= NOW() - INTERVAL '90 days') AS last_90d
          FROM app_users u
          LEFT JOIN user_generations ug ON ug."userId" = u.id
          WHERE 1=1 ${userFilter}
          GROUP BY u.id
        )
        SELECT
          COUNT(*) FILTER (WHERE last_7d >= 10)::int AS power,
          COUNT(*) FILTER (WHERE last_7d BETWEEN 1 AND 9)::int AS regular,
          COUNT(*) FILTER (WHERE last_90d >= 1 AND last_7d = 0)::int AS casual,
          COUNT(*) FILTER (WHERE last_90d = 0)::int AS inactive
        FROM user_activity
      `,
      // Monthly revenue MRR
      this.prisma.$queryRaw<Row[]>`
        SELECT TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') AS m,
          COALESCE(SUM(amount), 0)::numeric AS revenue,
          COUNT(*)::int AS payments,
          COUNT(DISTINCT "userId")::int AS unique_payers
        FROM payments WHERE status = 'completed'
        GROUP BY DATE_TRUNC('month', "createdAt")
        ORDER BY m DESC LIMIT 18
      `.catch(() => [] as Row[]),
      // Current plan distribution
      this.prisma.$queryRaw<Row[]>`
        SELECT p.plan_key, p.plan_name, COUNT(us.id)::int AS cnt
        FROM user_subscriptions us
        JOIN plans p ON p.id = us."planId"
        WHERE us.status = 'active'
        GROUP BY p.plan_key, p.plan_name
      `.catch(() => [] as Row[]),
      // Cohort retention table (last 12 months, M0-M6)
      this.prisma.$queryRaw<Row[]>`
        WITH cohorts AS (
          SELECT id, DATE_TRUNC('month', "createdAt") AS cohort_month
          FROM app_users
          WHERE "createdAt" >= NOW() - INTERVAL '12 months'
        ),
        activity AS (
          SELECT DISTINCT "userId", DATE_TRUNC('month', "createdAt") AS active_month
          FROM user_generations
        )
        SELECT
          TO_CHAR(c.cohort_month, 'YYYY-MM') AS cohort,
          COUNT(DISTINCT c.id)::int AS cohort_size,
          COUNT(DISTINCT a."userId") FILTER (WHERE a.active_month = c.cohort_month)::int AS m0,
          COUNT(DISTINCT a."userId") FILTER (WHERE a.active_month = c.cohort_month + INTERVAL '1 month')::int AS m1,
          COUNT(DISTINCT a."userId") FILTER (WHERE a.active_month = c.cohort_month + INTERVAL '2 months')::int AS m2,
          COUNT(DISTINCT a."userId") FILTER (WHERE a.active_month = c.cohort_month + INTERVAL '3 months')::int AS m3,
          COUNT(DISTINCT a."userId") FILTER (WHERE a.active_month = c.cohort_month + INTERVAL '6 months')::int AS m6
        FROM cohorts c
        LEFT JOIN activity a ON a."userId" = c.id
        GROUP BY c.cohort_month
        ORDER BY c.cohort_month DESC
        LIMIT 12
      `.catch(() => [] as Row[]),
      // Bot registration funnel
      this.prisma.$queryRaw<Row[]>`
        SELECT
          COUNT(*)::int AS started_bot,
          COUNT(*) FILTER (WHERE "appUserId" IS NOT NULL)::int AS linked_platform,
          (SELECT COUNT(DISTINCT ug."userId")::int FROM user_generations ug
           JOIN bot_users bu2 ON bu2."appUserId" = ug."userId") AS bot_first_generated,
          (SELECT COUNT(DISTINCT p."userId")::int FROM payments p
           WHERE p.status = 'completed'
           AND EXISTS (SELECT 1 FROM bot_users bu3 WHERE bu3."appUserId" = p."userId")) AS bot_paying
        FROM bot_users
      `.catch(() => [{ started_bot: 0, linked_platform: 0, bot_first_generated: 0, bot_paying: 0 }] as Row[]),
      // Telegram vs MAX comparison
      this.prisma.$queryRaw<Row[]>`
        SELECT
          COUNT(*) FILTER (WHERE "telegramId" IS NOT NULL)::int AS tg_users,
          COUNT(*) FILTER (WHERE "maxId" IS NOT NULL)::int AS max_users,
          COALESCE(SUM(CASE WHEN "telegramId" IS NOT NULL THEN "totalGenerations" ELSE 0 END), 0)::int AS tg_total_gens,
          COALESCE(SUM(CASE WHEN "maxId" IS NOT NULL THEN "totalGenerations" ELSE 0 END), 0)::int AS max_total_gens,
          COALESCE(SUM(CASE WHEN "telegramId" IS NOT NULL THEN "generationsThisMonth" ELSE 0 END), 0)::int AS tg_month_gens,
          COALESCE(SUM(CASE WHEN "maxId" IS NOT NULL THEN "generationsThisMonth" ELSE 0 END), 0)::int AS max_month_gens,
          ROUND(COALESCE(AVG(CASE WHEN "telegramId" IS NOT NULL THEN "botCredits"::numeric ELSE NULL END), 0))::int AS tg_avg_credits,
          ROUND(COALESCE(AVG(CASE WHEN "maxId" IS NOT NULL THEN "botCredits"::numeric ELSE NULL END), 0))::int AS max_avg_credits
        FROM bot_users
      `.catch(() => [{ tg_users: 0, max_users: 0, tg_total_gens: 0, max_total_gens: 0, tg_month_gens: 0, max_month_gens: 0, tg_avg_credits: 0, max_avg_credits: 0 }] as Row[]),
      // Referral funnel
      this.prisma.$queryRaw<Row[]>`
        SELECT
          COUNT(DISTINCT r."referrerUserId")::int AS total_referrers,
          COUNT(r.id)::int AS total_invited,
          COUNT(r.id) FILTER (WHERE r.status = 'activated')::int AS activated,
          (SELECT COUNT(DISTINCT p."userId")::int FROM payments p
           WHERE p.status = 'completed'
           AND EXISTS (SELECT 1 FROM referrals ref2 WHERE ref2."referredUserId" = p."userId")) AS converted_paid
        FROM referrals r
      `.catch(() => [{ total_referrers: 0, total_invited: 0, activated: 0, converted_paid: 0 }] as Row[]),
      // Content type distribution
      this.prisma.$queryRaw<Row[]>`
        SELECT ug."generationType" AS generation_type, COUNT(*)::int AS total_gens, COUNT(DISTINCT ug."userId")::int AS unique_users
        FROM user_generations ug
        JOIN app_users u ON u.id = ug."userId"
        WHERE ug.status = 'completed' ${userFilter}
        GROUP BY ug."generationType"
        ORDER BY total_gens DESC
      `,
      // Daily new registrations (last 90 days)
      this.prisma.$queryRaw<Row[]>`
        SELECT DATE(u."createdAt")::text AS d, COUNT(*)::int AS cnt
        FROM app_users u
        WHERE u."createdAt" >= NOW() - INTERVAL '90 days' ${userFilter}
        GROUP BY DATE(u."createdAt")
        ORDER BY d
      `,
      // Day-level cohort retention (D1/D7/D30) — last 60 day cohorts
      this.prisma.$queryRaw<Row[]>`
        WITH cohorts AS (
          SELECT id, DATE("createdAt") AS reg_day
          FROM app_users
          WHERE "createdAt" >= NOW() - INTERVAL '60 days'
        ),
        activity AS (
          SELECT DISTINCT "userId", DATE("createdAt") AS active_day
          FROM user_generations
        )
        SELECT
          TO_CHAR(c.reg_day, 'YYYY-MM-DD') AS cohort,
          COUNT(DISTINCT c.id)::int AS cohort_size,
          COUNT(DISTINCT a."userId") FILTER (WHERE a.active_day = c.reg_day)::int AS d0,
          COUNT(DISTINCT a."userId") FILTER (WHERE a.active_day = c.reg_day + INTERVAL '1 day')::int AS d1,
          COUNT(DISTINCT a."userId") FILTER (WHERE a.active_day = c.reg_day + INTERVAL '7 days')::int AS d7,
          COUNT(DISTINCT a."userId") FILTER (WHERE a.active_day = c.reg_day + INTERVAL '30 days')::int AS d30
        FROM cohorts c
        LEFT JOIN activity a ON a."userId" = c.id
        GROUP BY c.reg_day
        ORDER BY c.reg_day DESC
        LIMIT 60
      `.catch(() => [] as Row[]),
      // Список доступных UTM-источников (не зависит от userFilter — нужен для UI селектора)
      this.prisma.$queryRaw<Row[]>`
        SELECT DISTINCT COALESCE(NULLIF("utmSource", ''), NULLIF(source, ''), 'direct') AS src
        FROM app_users
        WHERE COALESCE(NULLIF("utmSource", ''), NULLIF(source, '')) IS NOT NULL
        ORDER BY src
        LIMIT 50
      `.catch(() => [] as Row[]),
      // Per-platform segmentation: регистрации / активации / оплаты в разрезе платформ
      this.prisma.$queryRaw<Row[]>`
        WITH base AS (
          SELECT
            u.id,
            CASE
              WHEN u."telegramId" IS NOT NULL AND u."maxId" IS NOT NULL THEN 'both'
              WHEN u."telegramId" IS NOT NULL THEN 'telegram'
              WHEN u."maxId" IS NOT NULL THEN 'max'
              ELSE 'web'
            END AS platform
          FROM app_users u
          WHERE 1=1 ${userFilter}
        )
        SELECT
          b.platform,
          COUNT(*)::int AS total,
          COUNT(DISTINCT ug."userId")::int AS activated,
          COUNT(DISTINCT p."userId")::int AS paid
        FROM base b
        LEFT JOIN user_generations ug ON ug."userId" = b.id
        LEFT JOIN payments p ON p."userId" = b.id AND p.status = 'completed'
        GROUP BY b.platform
      `.catch(() => [] as Row[]),
    ]);

    const toMap = (rows: Row[], key: string): Record<string, number> =>
      Object.fromEntries(rows.map(r => [r[key], Number(r.cnt)]));

    const stageMap = toMap(stageRows, 'stage');
    const churnMap = toMap(churnRows, 'risk');
    const platformMap = toMap(platformRows, 'platform');

    const totalUsers = Object.values(stageMap).reduce((a, b) => a + b, 0);

    const genTiming = genTimingRows[0] ?? {};
    const payTiming = payTimingRows[0] ?? {};

    return {
      totalUsers,
      stages: {
        registered_only: stageMap['registered_only'] ?? 0,
        generating_free: stageMap['generating_free'] ?? 0,
        subscribed_active: stageMap['subscribed_active'] ?? 0,
        subscribed_expired: stageMap['subscribed_expired'] ?? 0,
        churned: stageMap['churned'] ?? 0,
      },
      churnRisk: {
        low: churnMap['low'] ?? 0,
        medium: churnMap['medium'] ?? 0,
        high: churnMap['high'] ?? 0,
      },
      timings: {
        avgDaysToFirstGen: genTiming.avg_days != null ? Number(genTiming.avg_days) : null,
        medianDaysToFirstGen: genTiming.p50_days != null ? Number(genTiming.p50_days) : null,
        avgDaysToFirstPayment: payTiming.avg_days != null ? Number(payTiming.avg_days) : null,
        medianDaysToFirstPayment: payTiming.p50_days != null ? Number(payTiming.p50_days) : null,
      },
      acquisition: acqRows.map(r => ({
        source: String(r.source),
        total: Number(r.total),
        paid: Number(r.paid),
        generated: Number(r.generated),
        conversionRate: Number(r.total) > 0 ? Math.round((Number(r.paid) / Number(r.total)) * 100) : 0,
        activationRate: Number(r.total) > 0 ? Math.round((Number(r.generated) / Number(r.total)) * 100) : 0,
      })),
      platforms: {
        web: platformMap['web'] ?? 0,
        telegram: platformMap['telegram'] ?? 0,
        max: platformMap['max'] ?? 0,
        both: platformMap['both'] ?? 0,
      },
      generationsBySource: {
        web: Number((initiatedRows as Row[]).find(r => r.source === 'web')?.cnt ?? 0),
        telegram_bot: Number((initiatedRows as Row[]).find(r => r.source === 'telegram_bot')?.cnt ?? 0),
        max_bot: Number((initiatedRows as Row[]).find(r => r.source === 'max_bot')?.cnt ?? 0),
      },
      botAcquisition: (botUtmRows as Row[]).map(r => ({
        source: String(r.bot_source),
        count: Number(r.cnt),
      })),
      registrationTrend: (regTrendRows as Row[]).reverse().map(r => ({ month: String(r.m), count: Number(r.cnt) })),
      activation: (() => {
        const a = (activationRows as Row[])[0] ?? {};
        const total = Number(a.total ?? 0);
        return {
          day1: Number(a.day1 ?? 0),
          day1_3: Number(a.day1_3 ?? 0),
          day3_7: Number(a.day3_7 ?? 0),
          day7plus: Number(a.day7plus ?? 0),
          never: Number(a.never ?? 0),
          total,
          activationRate: total > 0 ? Math.round(((total - Number(a.never ?? 0)) / total) * 100) : 0,
        };
      })(),
      onboardingCompletion: (onbStepRows as Row[]).map(r => ({
        step: String(r.step),
        count: Number(r.cnt),
      })),
      featureAdoption: (() => {
        const rows = featureAdoptRows as Row[];
        return rows.map(r => ({
          type: String(r.generation_type),
          uniqueUsers: Number(r.unique_users),
          adoptionRate: totalUsers > 0 ? Math.round((Number(r.unique_users) / totalUsers) * 100) : 0,
        }));
      })(),
      userSegmentation: (() => {
        const s = (userSegRows as Row[])[0] ?? {};
        return {
          power: Number(s.power ?? 0),
          regular: Number(s.regular ?? 0),
          casual: Number(s.casual ?? 0),
          inactive: Number(s.inactive ?? 0),
        };
      })(),
      revenueMrr: (revenueMrrRows as Row[]).reverse().map(r => ({
        month: String(r.m),
        revenue: Number(r.revenue ?? 0),
        payments: Number(r.payments ?? 0),
        uniquePayers: Number(r.unique_payers ?? 0),
      })),
      planDistribution: (planDistRows as Row[]).map(r => ({
        planKey: String(r.plan_key),
        planName: String(r.plan_name),
        count: Number(r.cnt),
      })),
      cohortRetention: (cohortRows as Row[]).reverse().map(r => ({
        cohort: String(r.cohort),
        cohortSize: Number(r.cohort_size ?? 0),
        m0: Number(r.m0 ?? 0),
        m1: Number(r.m1 ?? 0),
        m2: Number(r.m2 ?? 0),
        m3: Number(r.m3 ?? 0),
        m6: Number(r.m6 ?? 0),
      })),
      botFunnel: (() => {
        const f = (botFunnelRows as Row[])[0] ?? {};
        return {
          startedBot: Number(f.started_bot ?? 0),
          linkedPlatform: Number(f.linked_platform ?? 0),
          firstGenerated: Number(f.bot_first_generated ?? 0),
          paying: Number(f.bot_paying ?? 0),
        };
      })(),
      botComparison: (() => {
        const c = (botCompareRows as Row[])[0] ?? {};
        return {
          tgUsers: Number(c.tg_users ?? 0),
          maxUsers: Number(c.max_users ?? 0),
          tgTotalGens: Number(c.tg_total_gens ?? 0),
          maxTotalGens: Number(c.max_total_gens ?? 0),
          tgMonthGens: Number(c.tg_month_gens ?? 0),
          maxMonthGens: Number(c.max_month_gens ?? 0),
          tgAvgCredits: Number(c.tg_avg_credits ?? 0),
          maxAvgCredits: Number(c.max_avg_credits ?? 0),
        };
      })(),
      referralFunnel: (() => {
        const r = (referralRows as Row[])[0] ?? {};
        return {
          totalReferrers: Number(r.total_referrers ?? 0),
          totalInvited: Number(r.total_invited ?? 0),
          activated: Number(r.activated ?? 0),
          convertedPaid: Number(r.converted_paid ?? 0),
        };
      })(),
      contentTypes: (contentTypeRows as Row[]).map(r => ({
        type: String(r.generation_type),
        totalGens: Number(r.total_gens ?? 0),
        uniqueUsers: Number(r.unique_users ?? 0),
      })),
      newUsersDaily: (newUsersDailyRows as Row[]).map(r => ({
        day: String(r.d),
        count: Number(r.cnt),
      })),
      dayRetentionCohorts: (dayRetentionRows as Row[]).reverse().map(r => ({
        cohortDay: String(r.cohort),
        cohortSize: Number(r.cohort_size ?? 0),
        d0: Number(r.d0 ?? 0),
        d1: Number(r.d1 ?? 0),
        d7: Number(r.d7 ?? 0),
        d30: Number(r.d30 ?? 0),
      })),
      availableUtmSources: (availableUtmRows as Row[])
        .map(r => String(r.src))
        .filter(s => s && s !== 'direct'),
      sourceSegmentation: (sourceSegRows as Row[]).map(r => {
        const total = Number(r.total ?? 0);
        const activated = Number(r.activated ?? 0);
        const paid = Number(r.paid ?? 0);
        return {
          platform: String(r.platform),
          total,
          activated,
          paid,
          activationRate: total > 0 ? Math.round((activated / total) * 100) : 0,
          conversionRate: total > 0 ? Math.round((paid / total) * 100) : 0,
        };
      }),
      filters: {
        periodDays: opts.periodDays ?? null,
        platform: opts.platform ?? null,
        utmSource: opts.utmSource ?? null,
      },
    };
  }

  async getWinbackList() {
    type Row = { [key: string]: any };
    const rows = await this.prisma.$queryRaw<Row[]>`
      WITH user_stats AS (
        SELECT
          u.id,
          u.username,
          u."firstName" AS first_name,
          u."lastName"  AS last_name,
          u.email,
          u."createdAt"::text AS reg_date,
          GREATEST(u."lastAccessAt", u."lastTelegramAppAccess", u."lastMaxAppAccess")::text AS last_active_at,
          COUNT(ug.id)::int AS total_gens,
          MAX(ug."createdAt")::text AS last_gen_at,
          ROUND(
            EXTRACT(EPOCH FROM (NOW() - GREATEST(u."lastAccessAt", u."lastTelegramAppAccess", u."lastMaxAppAccess"))) / 86400
          )::int AS days_inactive
        FROM app_users u
        LEFT JOIN user_generations ug ON ug."userId" = u.id
        GROUP BY u.id, u.username, u."firstName", u."lastName", u.email, u."createdAt"
      )
      SELECT
        us.*,
        s.status AS sub_status,
        pl.plan_key,
        s."creditsBalance" AS credits_balance
      FROM user_stats us
      LEFT JOIN user_subscriptions s ON s."userId" = us.id
      LEFT JOIN plans pl ON pl.id = s."planId"
      WHERE
        us.total_gens >= 10
        AND (us.last_active_at IS NULL OR us.last_active_at::timestamptz < NOW() - INTERVAL '30 days')
      ORDER BY us.total_gens DESC
      LIMIT 200
    `.catch(() => [] as Row[]);

    return {
      total: rows.length,
      users: rows.map(r => ({
        id: String(r.id),
        username: r.username ?? null,
        firstName: r.first_name ?? null,
        lastName: r.last_name ?? null,
        email: r.email ?? null,
        regDate: r.reg_date,
        lastActiveAt: r.last_active_at,
        totalGens: Number(r.total_gens),
        lastGenAt: r.last_gen_at,
        daysInactive: Number(r.days_inactive ?? 0),
        subStatus: r.sub_status ?? null,
        planKey: r.plan_key ?? null,
        creditsBalance: r.credits_balance != null ? Number(r.credits_balance) : null,
      })),
    };
  }

  // ========== BLOG ANALYTICS (Yandex Metrika) ==========
  async getBlogAnalytics(date1?: string, date2?: string) {
    const token = process.env.YANDEX_METRIKA_TOKEN;
    const counterId = '109983527';
    const d1 = date1 ?? '30daysAgo';
    const d2 = date2 ?? 'today';

    if (!token) {
      return { configured: false };
    }

    const headers = { Authorization: `OAuth ${token}` };
    const base = 'https://api-metrika.yandex.net/stat/v1/data';

    const goalIds: Record<string, number> = {
      article_scroll_25:   571248203,
      article_scroll_50:   571248247,
      article_scroll_75:   571248282,
      article_scroll_90:   571248387,
      article_scroll_100:  571248410,
      article_finished:    571248453,
      cta_register_click:  571248479,
      cta_telegram_click:  571248528,
      cta_bot_click:       571248556,
      article_time_30s:    571248618,
      article_time_1min:   571248671,
      article_time_2min:   571248715,
      article_time_5min:   571248741,
    };

    try {
      const axios = (await import('axios')).default;

      // Трафик блога
      const [trafficRes, goalsRes, chartRes] = await Promise.all([
        axios.get(base, {
          headers,
          params: {
            ids: counterId,
            metrics: 'ym:s:visits,ym:s:users,ym:s:bounceRate,ym:s:avgVisitDurationSeconds',
            filters: `ym:s:startURL=@'prepodavai.ru/blog'`,
            date1: d1, date2: d2,
          },
        }),
        axios.get(base, {
          headers,
          params: {
            ids: counterId,
            metrics: Object.values(goalIds).map(id => `ym:s:goal${id}reaches`).join(','),
            date1: d1, date2: d2,
          },
        }),
        axios.get(base, {
          headers,
          params: {
            ids: counterId,
            dimensions: 'ym:s:date',
            metrics: 'ym:s:visits,ym:s:users',
            filters: `ym:s:startURL=@'prepodavai.ru/blog'`,
            date1: d1, date2: d2,
            sort: 'ym:s:date',
            limit: 60,
          },
        }),
      ]);

      const trafficData = trafficRes.data?.data?.[0]?.metrics ?? [];
      const goalsData   = goalsRes.data?.data?.[0]?.metrics ?? [];
      const goalKeys    = Object.keys(goalIds);

      const goals: Record<string, number> = {};
      goalKeys.forEach((key, i) => { goals[key] = Math.round(goalsData[i] ?? 0); });

      const chart = (chartRes.data?.data ?? []).map((row: any) => ({
        date:   row.dimensions?.[0]?.name ?? '',
        visits: Math.round(row.metrics?.[0] ?? 0),
        users:  Math.round(row.metrics?.[1] ?? 0),
      }));

      return {
        configured: true,
        period: { date1: d1, date2: d2 },
        traffic: {
          visits:       Math.round(trafficData[0] ?? 0),
          users:        Math.round(trafficData[1] ?? 0),
          bounceRate:   Math.round(trafficData[2] ?? 0),
          avgDurationSec: Math.round(trafficData[3] ?? 0),
        },
        goals,
        chart,
      };
    } catch (e: any) {
      return { configured: true, error: e?.response?.data?.message ?? 'Metrika API error' };
    }
  }
}
