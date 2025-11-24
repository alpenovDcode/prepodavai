import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ========== USERS ==========
  async getUsers(limit = 50, offset = 0) {
    const users = await this.prisma.appUser.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userHash: true,
        source: true,
        telegramId: true,
        username: true,
        firstName: true,
        lastName: true,
        phone: true,
        phoneVerified: true,
        lastAccessAt: true,
        lastTelegramAppAccess: true,
        createdAt: true,
        updatedAt: true,
        subscription: true,
        // Исключаем чувствительные поля: passwordHash, apiKey
      },
    });

    const total = await this.prisma.appUser.count();

    return {
      success: true,
      users,
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
        // Исключаем чувствительные поля: passwordHash, apiKey
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

  async updateUser(id: string, data: any) {
    // Удаляем поля, которые нельзя обновлять напрямую
    const {
      id: _,
      createdAt,
      updatedAt,
      subscription,
      generations,
      creditTransactions,
      systemLogs,
      passwordHash, // Запрещаем обновление passwordHash через admin API
      apiKey, // Запрещаем обновление apiKey через admin API
      ...updateData
    } = data;

    // Очищаем пустые строки и null значения для опциональных полей
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === '' || updateData[key] === null) {
        if (['phone', 'lastName', 'passwordHash'].includes(key)) {
          updateData[key] = null;
        } else {
          delete updateData[key];
        }
      }
    });

    const user = await this.prisma.appUser.update({
      where: { id },
      data: updateData,
      include: {
        subscription: true,
      },
    });

    return {
      success: true,
      user,
      message: 'User updated successfully',
    };
  }

  async deleteUser(id: string) {
    // Удаляем связанные записи
    await this.prisma.creditTransaction.deleteMany({ where: { userId: id } });
    await this.prisma.userGeneration.deleteMany({ where: { userId: id } });
    await this.prisma.userSubscription.deleteMany({ where: { userId: id } });
    await this.prisma.generationRequest.deleteMany({ where: { userId: id } });

    const user = await this.prisma.appUser.delete({
      where: { id },
    });

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

  async updateGeneration(id: string, data: any) {
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

    return {
      success: true,
      generation,
      message: 'Generation updated successfully',
    };
  }

  async deleteGeneration(id: string) {
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

  async updateSubscription(id: string, data: any) {
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
}
