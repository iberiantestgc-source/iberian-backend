import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/** Límites del plan FREE */
export const FREE_LIMITS = {
  dailyQuestions: 100,
  canUseAI: false,
  unlimitedSimulacros: false,
  maxSimulacrosPerDay: 1,
  advancedStats: false,
  fullRanking: false,
};

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  async getSubscription(userId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!sub) {
      // Crear FREE por defecto si no existe
      return this.prisma.subscription.create({
        data: {
          userId,
          status: 'FREE',
          plan: 'FREE',
        },
      });
    }

    // Comprobar expiración
    if (
      sub.status === 'ACTIVE' &&
      sub.endDate &&
      sub.endDate < new Date()
    ) {
      return this.prisma.subscription.update({
        where: { userId },
        data: { status: 'EXPIRED', plan: 'FREE' },
      });
    }

    return sub;
  }

  /**
   * ¿El usuario tiene plan premium activo?
   */
  async isPremium(userId: string): Promise<boolean> {
    const sub = await this.getSubscription(userId);
    return (
      (sub.status === 'ACTIVE' || sub.status === 'TRIAL') &&
      sub.plan !== 'FREE'
    );
  }

  /**
   * Obtener límites efectivos del usuario
   */
  async getLimits(userId: string) {
    const premium = await this.isPremium(userId);

    if (premium) {
      return {
        plan: 'PREMIUM',
        dailyQuestions: Infinity,
        canUseAI: true,
        unlimitedSimulacros: true,
        maxSimulacrosPerDay: Infinity,
        advancedStats: true,
        fullRanking: true,
      };
    }

    return {
      plan: 'FREE',
      ...FREE_LIMITS,
    };
  }

  /**
   * Comprueba si el usuario puede responder más preguntas hoy
   */
  async canAnswerQuestions(userId: string, count = 1): Promise<void> {
    const limits = await this.getLimits(userId);
    if (limits.dailyQuestions === Infinity) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const answeredToday = await this.prisma.userAnswer.count({
      where: {
        userId,
        answeredAt: { gte: today },
      },
    });

    if (answeredToday + count > limits.dailyQuestions) {
      throw new ForbiddenException(
        `Límite diario de preguntas alcanzado (${limits.dailyQuestions}). Pasa a Premium para sin límites.`,
      );
    }
  }

  /**
   * Comprueba si puede usar el tutor IA
   */
  async canUseAI(userId: string): Promise<void> {
    const limits = await this.getLimits(userId);
    if (!limits.canUseAI) {
      throw new ForbiddenException(
        'El tutor IA está disponible solo en Premium.',
      );
    }
  }

  /**
   * Comprueba si puede generar un simulacro
   */
  async canGenerateSimulacro(userId: string): Promise<void> {
    const limits = await this.getLimits(userId);
    if (limits.unlimitedSimulacros) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const simulacrosToday = await this.prisma.testAttempt.count({
      where: {
        userId,
        startedAt: { gte: today },
        test: { type: 'SIMULACRO' },
      },
    });

    if (simulacrosToday >= limits.maxSimulacrosPerDay) {
      throw new ForbiddenException(
        `Límite de simulacros diarios alcanzado (${limits.maxSimulacrosPerDay}). Pasa a Premium para ilimitados.`,
      );
    }
  }

  /**
   * Activar premium (manual / admin / webhook Stripe futuro)
   */
  async activatePremium(
    userId: string,
    plan: 'PREMIUM_MONTHLY' | 'PREMIUM_YEARLY',
    days: number,
  ) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    return this.prisma.subscription.upsert({
      where: { userId },
      update: {
        status: 'ACTIVE',
        plan,
        startDate: new Date(),
        endDate,
      },
      create: {
        userId,
        status: 'ACTIVE',
        plan,
        startDate: new Date(),
        endDate,
      },
    });
  }

  async cancelSubscription(userId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });
    if (!sub) throw new NotFoundException('Suscripción no encontrada');

    return this.prisma.subscription.update({
      where: { userId },
      data: { status: 'CANCELLED' },
    });
  }
}
