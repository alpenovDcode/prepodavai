import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async createNotification(data: {
    userId: string;
    userType: 'teacher' | 'student';
    type: 'submission_received' | 'submission_graded' | 'referral_activated' | 'referral_converted' | 'referral_milestone';
    title: string;
    message: string;
    metadata?: Record<string, any>;
  }) {
    return this.prisma.notification.create({
      data: {
        userId: data.userId,
        userType: data.userType,
        type: data.type,
        title: data.title,
        message: data.message,
        metadata: data.metadata || null,
      },
    });
  }

  async getNotifications(userId: string, userType: 'teacher' | 'student') {
    return this.prisma.notification.findMany({
      where: { userId, userType },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getUnreadCount(userId: string, userType: 'teacher' | 'student') {
    const count = await this.prisma.notification.count({
      where: { userId, userType, isRead: false },
    });
    return { count };
  }

  async markAsRead(userId: string, userType: 'teacher' | 'student', notificationId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId, userType },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string, userType: 'teacher' | 'student') {
    return this.prisma.notification.updateMany({
      where: { userId, userType, isRead: false },
      data: { isRead: true },
    });
  }
}
