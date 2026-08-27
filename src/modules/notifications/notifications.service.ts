import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async create(
    userId: string,
    data: {
      title: string;
      body: string;
      type: string;
      data?: Record<string, any>;
    },
  ) {
    return this.prisma.notification.create({
      data: {
        userId,
        title: data.title,
        body: data.body,
        type: data.type,
        data: data.data ?? undefined,
      },
    });
  }

  async findAllForUser(
    userId: string,
    params?: { onlyUnread?: boolean; limit?: number; offset?: number },
  ) {
    const { onlyUnread = false, limit = 30, offset = 0 } = params ?? {};

    const where: any = { userId };
    if (onlyUnread) where.isRead = false;

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 100),
        skip: offset,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    return { items, total, unreadCount, limit, offset };
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notificación no encontrada');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return { updated: result.count };
  }

  /**
   * Helpers para crear notificaciones de sistema
   */
  async notifyAchievement(
    userId: string,
    achievementName: string,
    xpReward: number,
  ) {
    return this.create(userId, {
      title: '¡Logro desbloqueado!',
      body: `Has desbloqueado: ${achievementName}${xpReward > 0 ? ` (+${xpReward} XP)` : ''}`,
      type: 'ACHIEVEMENT',
      data: { achievementName, xpReward },
    });
  }

  async notifyStreak(userId: string, days: number) {
    return this.create(userId, {
      title: `Racha de ${days} días`,
      body: `Llevas ${days} días estudiando seguidos. ¡Sigue así!`,
      type: 'STREAK',
      data: { days },
    });
  }

  async notifyLevelUp(userId: string, level: number) {
    return this.create(userId, {
      title: '¡Subiste de nivel!',
      body: `Has alcanzado el nivel ${level}`,
      type: 'LEVEL_UP',
      data: { level },
    });
  }
}
