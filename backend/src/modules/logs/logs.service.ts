import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class LogsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Сохранить лог
   */
  async saveLog(data: {
    level: string;
    category: string;
    message: string;
    data?: any;
    userId?: string;
    generationRequestId?: string;
  }) {
    return this.prisma.systemLog.create({
      data: {
        level: data.level,
        category: data.category,
        message: data.message,
        data: data.data || {},
        userId: data.userId,
        generationRequestId: data.generationRequestId,
      },
    });
  }

  /**
   * Получить логи с фильтрацией
   */
  async getLogs(filters: {
    level?: string;
    category?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};

    if (filters.level) where.level = filters.level;
    if (filters.category) where.category = filters.category;
    if (filters.userId) where.userId = filters.userId;

    const logs = await this.prisma.systemLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    });

    const total = await this.prisma.systemLog.count({ where });

    return {
      success: true,
      logs,
      total,
      limit: filters.limit || 50,
      offset: filters.offset || 0,
    };
  }
}
