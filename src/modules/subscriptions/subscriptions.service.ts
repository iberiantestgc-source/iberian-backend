import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import Stripe from 'stripe';

/**
 * ============================================================
 * PLAN FREE
 * ============================================================
 *
 * IMPORTANTE:
 * Este límite se aplica en BACKEND.
 * La aplicación móvil no puede saltárselo.
 */
export const FREE_LIMITS = {
  dailyQuestions: 10,
  canUseAI: false,
  unlimitedSimulacros: false,
  maxSimulacrosPerDay: 1,
  advancedStats: false,
  fullRanking: false,
};

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ============================================================
  // FECHA ACTUAL SIN HORA
  // ============================================================

  private getToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  // ============================================================
  // ¿ES ADMINISTRADOR?
  // ============================================================

  private async isAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        role: true,
      },
    });

    if (!user) {
      return false;
    }

    return (
      user.role === 'ADMIN' ||
      user.role === 'SUPER_ADMIN'
    );
  }

  // ============================================================
  // SUSCRIPCIÓN
  // ============================================================

  async getSubscription(userId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: {
        userId,
      },
    });

    if (!sub) {
      return this.prisma.subscription.create({
        data: {
          userId,
          status: 'FREE',
          plan: 'FREE',
        },
      });
    }

    if (
      sub.status === 'ACTIVE' &&
      sub.endDate &&
      sub.endDate < new Date()
    ) {
      return this.prisma.subscription.update({
        where: {
          userId,
        },
        data: {
          status: 'EXPIRED',
          plan: 'FREE',
        },
      });
    }

    return sub;
  }

  // ============================================================
  // ¿ES PREMIUM?
  // ============================================================

  async isPremium(userId: string): Promise<boolean> {
    /**
     * ADMIN y SUPER_ADMIN tienen acceso Premium
     * independientemente de su suscripción.
     *
     * Esto permite administrar y probar la aplicación
     * sin necesidad de tener una suscripción de pago.
     */
    if (await this.isAdmin(userId)) {
      return true;
    }

    const sub = await this.getSubscription(userId);

    return (
      (sub.status === 'ACTIVE' || sub.status === 'TRIAL') &&
      sub.plan !== 'FREE'
    );
  }

  // ============================================================
  // OBTENER LÍMITES
  // ============================================================

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

  // ============================================================
  // USO DE PREGUNTAS HOY
  // ============================================================

  async getQuestionsUsedToday(userId: string): Promise<number> {
    const today = this.getToday();

    const usage =
      await this.prisma.dailyQuestionUsage.findUnique({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
      });

    return usage?.questionsUsed ?? 0;
  }

  // ============================================================
  // PREGUNTAS RESTANTES HOY
  // ============================================================

  async getQuestionsRemainingToday(
    userId: string,
  ): Promise<number> {
    const limits = await this.getLimits(userId);

    if (limits.dailyQuestions === Infinity) {
      return Infinity;
    }

    const used = await this.getQuestionsUsedToday(userId);

    return Math.max(
      limits.dailyQuestions - used,
      0,
    );
  }

  // ============================================================
  // COMPROBAR SI PUEDE CONSUMIR PREGUNTAS
  // ============================================================

  async canAnswerQuestions(
    userId: string,
    count = 1,
  ): Promise<void> {
    if (!Number.isInteger(count) || count < 1) {
      throw new ForbiddenException(
        'La cantidad de preguntas no es válida.',
      );
    }

    const limits = await this.getLimits(userId);

    if (limits.dailyQuestions === Infinity) {
      return;
    }

    const used =
      await this.getQuestionsUsedToday(userId);

    const remaining = Math.max(
      limits.dailyQuestions - used,
      0,
    );

    if (count > remaining) {
      throw new ForbiddenException(
        `Has alcanzado el límite diario de ${limits.dailyQuestions} preguntas del plan FREE. Te quedan ${remaining} preguntas hoy. Pasa a Premium para continuar sin límites.`,
      );
    }
  }

  // ============================================================
  // CONSUMIR UNA PREGUNTA
  // ============================================================

  async consumeQuestion(userId: string): Promise<void> {
    const limits = await this.getLimits(userId);

    if (limits.dailyQuestions === Infinity) {
      return;
    }

    const today = this.getToday();

    const usage =
      await this.prisma.dailyQuestionUsage.upsert({
        where: {
          userId_date: {
            userId,
            date: today,
          },
        },
        create: {
          userId,
          date: today,
          questionsUsed: 1,
        },
        update: {
          questionsUsed: {
            increment: 1,
          },
        },
      });

    if (
      usage.questionsUsed >
      limits.dailyQuestions
    ) {
      await this.prisma.dailyQuestionUsage.update({
        where: {
          id: usage.id,
        },
        data: {
          questionsUsed: {
            decrement: 1,
          },
        },
      });

      throw new ForbiddenException(
        `Has alcanzado el límite diario de ${limits.dailyQuestions} preguntas del plan FREE.`,
      );
    }
  }

  // ============================================================
  // INFORMACIÓN COMPLETA DE USO
  // ============================================================

  async getDailyUsage(userId: string) {
    const limits = await this.getLimits(userId);
    const used =
      await this.getQuestionsUsedToday(userId);

    const remaining =
      limits.dailyQuestions === Infinity
        ? Infinity
        : Math.max(
            limits.dailyQuestions - used,
            0,
          );

    return {
      used,
      limit: limits.dailyQuestions,
      remaining,
      unlimited:
        limits.dailyQuestions === Infinity,
    };
  }

  // ============================================================
  // TUTOR IA
  // ============================================================

  async canUseAI(userId: string): Promise<void> {
    const limits = await this.getLimits(userId);

    if (!limits.canUseAI) {
      throw new ForbiddenException(
        'El tutor IA está disponible solo para usuarios Premium.',
      );
    }
  }

  // ============================================================
  // SIMULACROS
  // ============================================================

  async canGenerateSimulacro(
    userId: string,
  ): Promise<void> {
    const limits = await this.getLimits(userId);

    if (limits.unlimitedSimulacros) {
      return;
    }

    const today = this.getToday();

    const simulacrosToday =
      await this.prisma.testAttempt.count({
        where: {
          userId,
          startedAt: {
            gte: today,
          },
          test: {
            type: 'SIMULACRO',
          },
        },
      });

    if (
      simulacrosToday >=
      limits.maxSimulacrosPerDay
    ) {
      throw new ForbiddenException(
        `Límite de simulacros diarios alcanzado (${limits.maxSimulacrosPerDay}). Pasa a Premium para tener simulacros ilimitados.`,
      );
    }
  }

  // ============================================================
  // EXAMEN REAL
  // ============================================================

  async canGenerateRealExam(
    userId: string,
  ): Promise<void> {
    const premium =
      await this.isPremium(userId);

    if (!premium) {
      throw new ForbiddenException(
        'El examen real de 100 preguntas está disponible únicamente para usuarios Premium.',
      );
    }
  }

  // ============================================================
  // ACTIVAR PREMIUM
  // ============================================================

  async activatePremium(
    userId: string,
    plan:
      | 'PREMIUM_MONTHLY'
      | 'PREMIUM_YEARLY',
    days: number,
  ) {
    if (!userId) {
      throw new NotFoundException(
        'Usuario no indicado',
      );
    }

    if (
      !Number.isInteger(days) ||
      days <= 0
    ) {
      throw new ForbiddenException(
        'La duración de Premium no es válida.',
      );
    }

    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'Usuario no encontrado',
      );
    }

    const now = new Date();

    const endDate = new Date(now);

    endDate.setDate(
      endDate.getDate() + days,
    );

    return this.prisma.subscription.upsert({
      where: {
        userId,
      },
      update: {
        status: 'ACTIVE',
        plan,
        startDate: now,
        endDate,
      },
      create: {
        userId,
        status: 'ACTIVE',
        plan,
        startDate: now,
        endDate,
      },
    });
  }

  async activatePremiumFromStripe(
    userId: string,
    days = 30,
  ) {
    return this.activatePremium(
      userId,
      'PREMIUM_MONTHLY',
      days,
    );
  }

  // ============================================================
  // CANCELAR SUSCRIPCIÓN
  // ============================================================

  async cancelSubscription(
    userId: string,
  ) {
    const sub =
      await this.prisma.subscription.findUnique({
        where: {
          userId,
        },
      });

    if (!sub) {
      throw new NotFoundException(
        'Suscripción no encontrada',
      );
    }

    return this.prisma.subscription.update({
      where: {
        userId,
      },
      data: {
        status: 'CANCELLED',
      },
    });
  }

  // ============================================================
  // STRIPE CHECKOUT
  // ============================================================

  async createCheckoutSession(
    userId: string,
  ) {
    const secret =
      this.config.get<string>(
        'STRIPE_SECRET_KEY',
      );

    const priceId =
      this.config.get<string>(
        'STRIPE_PRICE_ID',
      );

    const successUrl =
      this.config.get<string>(
        'STRIPE_SUCCESS_URL',
      );

    const cancelUrl =
      this.config.get<string>(
        'STRIPE_CANCEL_URL',
      );

    if (
      !secret ||
      !priceId ||
      !successUrl ||
      !cancelUrl
    ) {
      throw new ForbiddenException(
        'Stripe no está configurado en el servidor (faltan variables de entorno).',
      );
    }

    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
          email: true,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'Usuario no encontrado',
      );
    }

    const alreadyPremium =
      await this.isPremium(userId);

    if (alreadyPremium) {
      throw new ForbiddenException(
        'Ya tienes Premium activo.',
      );
    }

    const stripe = new Stripe(secret);

    const session =
      await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer_email: user.email,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        metadata: {
          userId: user.id,
        },
        subscription_data: {
          metadata: {
            userId: user.id,
          },
        },
      });

    if (!session.url) {
      throw new ForbiddenException(
        'Stripe no devolvió URL de checkout.',
      );
    }

    return {
      url: session.url,
      sessionId: session.id,
    };
  }
}