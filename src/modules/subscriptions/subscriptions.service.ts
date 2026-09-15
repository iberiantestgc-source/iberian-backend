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
 * Estos límites se aplican en BACKEND.
 * La aplicación móvil no puede saltárselos.
 *
 * FREE: 10 preguntas cada ventana de 24 h al llegar al tope.
 * PREMIUM / ADMIN / SUPER_ADMIN: sin este límite.
 */
export const FREE_LIMITS = {
  dailyQuestions: 10,
  canUseAI: false,
  unlimitedSimulacros: false,
  maxSimulacrosPerDay: 1,
  advancedStats: false,
  fullRanking: false,
};

/**
 * JSON no soporta Infinity (se convierte en null y el front
 * enseña 10 preguntas). Usamos un número alto + flag unlimited.
 */
export const PREMIUM_DAILY_QUESTIONS = 10000;

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ============================================================
  // FECHA DEL DÍA (UTC — estable local y Render)
  // ============================================================

  private getToday(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
  }

  private getTomorrow(): Date {
    return new Date(this.getToday().getTime() + 24 * 60 * 60 * 1000);
  }

  /** True si el plan no tiene límite diario real. */
  private isUnlimitedDaily(dailyQuestions: number): boolean {
    return dailyQuestions >= PREMIUM_DAILY_QUESTIONS;
  }

  /**
   * Busca el uso del día UTC con rango [today, tomorrow).
   * Evita fallos de findUnique por DateTime exacto vs Postgres.
   */
  private async findTodayUsage(userId: string) {
    return this.prisma.dailyQuestionUsage.findFirst({
      where: {
        userId,
        date: {
          gte: this.getToday(),
          lt: this.getTomorrow(),
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
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

    return user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  }

  // ============================================================
  // OBTENER SUSCRIPCIÓN
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
        dailyQuestions: PREMIUM_DAILY_QUESTIONS,
        canUseAI: true,
        unlimitedSimulacros: true,
        maxSimulacrosPerDay: PREMIUM_DAILY_QUESTIONS,
        advancedStats: true,
        fullRanking: true,
        unlimited: true,
      };
    }

    return {
      plan: 'FREE',
      ...FREE_LIMITS,
      unlimited: false,
    };
  }

  // ============================================================
  // PREGUNTAS USADAS HOY
  // ============================================================

  async getQuestionsUsedToday(userId: string): Promise<number> {
    const usage = await this.findTodayUsage(userId);
    return usage?.questionsUsed ?? 0;
  }

  // ============================================================
  // PREGUNTAS RESTANTES
  // ============================================================

  async getQuestionsRemainingToday(userId: string): Promise<number> {
    const limits = await this.getLimits(userId);

    if (this.isUnlimitedDaily(limits.dailyQuestions)) {
      return PREMIUM_DAILY_QUESTIONS;
    }

    const usage = await this.findTodayUsage(userId);
    const used = usage?.questionsUsed ?? 0;

    if (used >= limits.dailyQuestions && usage) {
      const blockedUntil = new Date(
        usage.updatedAt.getTime() + 24 * 60 * 60 * 1000,
      );
      if (blockedUntil > new Date()) {
        return 0;
      }
    }

    return Math.max(limits.dailyQuestions - used, 0);
  }

  // ============================================================
  // COMPROBAR SI PUEDE CONSUMIR PREGUNTAS
  // ============================================================

  async canAnswerQuestions(
    userId: string,
    count = 1,
  ): Promise<void> {
    const n = Math.floor(Number(count));

    if (!Number.isFinite(n) || n < 1) {
      throw new ForbiddenException(
        'La cantidad de preguntas no es válida.',
      );
    }

    const limits = await this.getLimits(userId);

    if (this.isUnlimitedDaily(limits.dailyQuestions)) {
      return;
    }

    const usage = await this.findTodayUsage(userId);
    const used = usage?.questionsUsed ?? 0;

    if (used >= limits.dailyQuestions && usage) {
      const blockedUntil = new Date(
        usage.updatedAt.getTime() + 24 * 60 * 60 * 1000,
      );

      if (blockedUntil > new Date()) {
        const remainingMs = blockedUntil.getTime() - Date.now();
        const remainingHours = Math.max(
          1,
          Math.ceil(remainingMs / (1000 * 60 * 60)),
        );

        throw new ForbiddenException(
          `Has alcanzado el límite de ${limits.dailyQuestions} preguntas del plan FREE. Esta función está bloqueada durante 24 horas. Inténtalo de nuevo en aproximadamente ${remainingHours} hora${remainingHours === 1 ? '' : 's'} o pasa a Premium para continuar sin límites.`,
        );
      }
    }

    const remaining = Math.max(limits.dailyQuestions - used, 0);

    if (n > remaining) {
      throw new ForbiddenException(
        `Has alcanzado el límite diario de ${limits.dailyQuestions} preguntas del plan FREE. Te quedan ${remaining} preguntas hoy. Pasa a Premium para continuar sin límites.`,
      );
    }
  }

  // ============================================================
  // CONSUMIR VARIAS PREGUNTAS
  // ============================================================

  async consumeQuestions(
    userId: string,
    count: number,
  ): Promise<void> {
    const n = Math.floor(Number(count));

    if (!Number.isFinite(n) || n < 1) {
      throw new ForbiddenException(
        'La cantidad de preguntas no es válida.',
      );
    }

    const limits = await this.getLimits(userId);

    if (this.isUnlimitedDaily(limits.dailyQuestions)) {
      return;
    }

    await this.canAnswerQuestions(userId, n);

    const today = this.getToday();

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.dailyQuestionUsage.findFirst({
        where: {
          userId,
          date: {
            gte: today,
            lt: this.getTomorrow(),
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      if (existing) {
        const updated = await tx.dailyQuestionUsage.update({
          where: {
            id: existing.id,
          },
          data: {
            questionsUsed: {
              increment: n,
            },
          },
        });

        if (updated.questionsUsed > limits.dailyQuestions) {
          throw new ForbiddenException(
            `Has alcanzado el límite diario de ${limits.dailyQuestions} preguntas del plan FREE.`,
          );
        }
      } else {
        if (n > limits.dailyQuestions) {
          throw new ForbiddenException(
            `Has alcanzado el límite diario de ${limits.dailyQuestions} preguntas del plan FREE.`,
          );
        }

        await tx.dailyQuestionUsage.create({
          data: {
            userId,
            date: today,
            questionsUsed: n,
          },
        });
      }
    });
  }

  // ============================================================
  // CONSUMIR UNA PREGUNTA
  // ============================================================

  async consumeQuestion(userId: string): Promise<void> {
    await this.consumeQuestions(userId, 1);
  }

  // ============================================================
  // INFORMACIÓN COMPLETA DE USO DIARIO
  // ============================================================

  async getDailyUsage(userId: string) {
    const limits = await this.getLimits(userId);
    const unlimited = this.isUnlimitedDaily(limits.dailyQuestions);
    const usage = unlimited ? null : await this.findTodayUsage(userId);
    const used = usage?.questionsUsed ?? 0;

    let blocked = false;
    let blockedUntil: Date | null = null;

    if (!unlimited && usage && used >= limits.dailyQuestions) {
      blockedUntil = new Date(
        usage.updatedAt.getTime() + 24 * 60 * 60 * 1000,
      );
      blocked = blockedUntil > new Date();
      if (!blocked) {
        blockedUntil = null;
      }
    }

    const remaining = unlimited
      ? PREMIUM_DAILY_QUESTIONS
      : blocked
        ? 0
        : Math.max(limits.dailyQuestions - used, 0);

    return {
      used,
      limit: limits.dailyQuestions,
      remaining,
      unlimited,
      blocked,
      blockedUntil,
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

  async canGenerateSimulacro(userId: string): Promise<void> {
    const limits = await this.getLimits(userId);

    if (limits.unlimitedSimulacros) {
      return;
    }

    const today = this.getToday();

    const simulacrosToday = await this.prisma.testAttempt.count({
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

    if (simulacrosToday >= limits.maxSimulacrosPerDay) {
      throw new ForbiddenException(
        `Límite de simulacros diarios alcanzado (${limits.maxSimulacrosPerDay}). Pasa a Premium para tener simulacros ilimitados.`,
      );
    }
  }

  // ============================================================
  // EXAMEN REAL
  // ============================================================

  async canGenerateRealExam(userId: string): Promise<void> {
    const premium = await this.isPremium(userId);

    if (!premium) {
      throw new ForbiddenException(
        'El examen real de 100 preguntas está disponible únicamente para usuarios Premium.',
      );
    }
  }

  // ============================================================
  // ACTIVAR PREMIUM MANUALMENTE
  // ============================================================

  async activatePremium(
    userId: string,
    plan: 'PREMIUM_MONTHLY' | 'PREMIUM_YEARLY',
    days: number,
  ) {
    if (!userId) {
      throw new NotFoundException('Usuario no indicado');
    }

    if (!Number.isInteger(days) || days <= 0) {
      throw new ForbiddenException(
        'La duración de Premium no es válida.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + days);

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

  // ============================================================
  // ACTIVAR PREMIUM DESDE STRIPE
  // ============================================================

  async activatePremiumFromStripe(userId: string, days = 30) {
    return this.activatePremium(userId, 'PREMIUM_MONTHLY', days);
  }

  // ============================================================
  // CANCELAR SUSCRIPCIÓN
  // ============================================================

  async cancelSubscription(userId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: {
        userId,
      },
    });

    if (!sub) {
      throw new NotFoundException('Suscripción no encontrada');
    }

    return this.prisma.subscription.update({
      where: {
        userId,
      },
      data: {
        status: 'CANCELLED',
        autoRenew: false,
      },
    });
  }

  // ============================================================
  // STRIPE CHECKOUT
  // ============================================================

  async createCheckoutSession(userId: string) {
    const secret = this.config.get<string>('STRIPE_SECRET_KEY');
    const priceId = this.config.get<string>('STRIPE_PRICE_ID');
    const successUrl = this.config.get<string>('STRIPE_SUCCESS_URL');
    const cancelUrl = this.config.get<string>('STRIPE_CANCEL_URL');

    if (!secret || !priceId || !successUrl || !cancelUrl) {
      throw new ForbiddenException(
        'Stripe no está configurado en el servidor (faltan variables de entorno).',
      );
    }

    if (!secret.startsWith('sk_')) {
      throw new ForbiddenException(
        'STRIPE_SECRET_KEY no parece una clave secreta válida.',
      );
    }

    if (!priceId.startsWith('price_')) {
      throw new ForbiddenException(
        'STRIPE_PRICE_ID debe ser un Price ID (price_...), no un Product ID (prod_...).',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const alreadyPremium = await this.isPremium(userId);

    if (alreadyPremium) {
      throw new ForbiddenException('Ya tienes Premium activo.');
    }

    const stripe = new Stripe(secret);

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer_email: user.email ?? undefined,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
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
    } catch (error: any) {
      const message = String(error?.message || error || '');

      if (
        message.toLowerCase().includes('recurring') ||
        message.toLowerCase().includes('subscription')
      ) {
        try {
          const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: user.email ?? undefined,
            line_items: [
              {
                price: priceId,
                quantity: 1,
              },
            ],
            success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl,
            allow_promotion_codes: true,
            metadata: {
              userId: user.id,
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
        } catch (error2: any) {
          throw new ForbiddenException(
            error2?.message ||
              'Error al crear la sesión de pago en Stripe.',
          );
        }
      }

      throw new ForbiddenException(
        error?.message ||
          'Error al crear la sesión de pago en Stripe.',
      );
    }
  }

  // ============================================================
  // WEBHOOK DE STRIPE
  // ============================================================

  async handleStripeWebhook(signature: string, rawBody: Buffer) {
    const secret = this.config.get<string>('STRIPE_SECRET_KEY');
    const webhookSecret = this.config.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    if (!secret) {
      throw new ForbiddenException(
        'STRIPE_SECRET_KEY no está configurada.',
      );
    }

    if (!webhookSecret) {
      throw new ForbiddenException(
        'STRIPE_WEBHOOK_SECRET no está configurada.',
      );
    }

    if (!signature) {
      throw new ForbiddenException(
        'Firma de Stripe no proporcionada.',
      );
    }

    if (!rawBody) {
      throw new ForbiddenException(
        'Body original de Stripe no proporcionado.',
      );
    }

    const stripe = new Stripe(secret);

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch {
      throw new ForbiddenException(
        'Firma del webhook de Stripe no válida.',
      );
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data
        .object as Stripe.Checkout.Session;

      const userId = session.metadata?.userId;

      if (!userId) {
        throw new ForbiddenException(
          'La sesión de Stripe no contiene userId.',
        );
      }

      if (session.mode === 'subscription') {
        const stripeSubscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;

        if (!stripeSubscriptionId) {
          throw new ForbiddenException(
            'La sesión de Stripe no contiene una suscripción válida.',
          );
        }

        const subscription =
          await stripe.subscriptions.retrieve(stripeSubscriptionId);

        const customerId =
          typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id;

        await this.syncStripeSubscription(
          userId,
          subscription,
          customerId ?? null,
        );
      } else {
        await this.activatePremiumFromStripe(userId, 30);
      }

      return {
        received: true,
        type: event.type,
      };
    }

    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data
        .object as Stripe.Subscription;

      const userId = subscription.metadata?.userId;

      if (!userId) {
        return {
          received: true,
          type: event.type,
          ignored: true,
          reason: 'La suscripción no contiene userId.',
        };
      }

      const customerId =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer?.id;

      await this.syncStripeSubscription(
        userId,
        subscription,
        customerId ?? null,
      );

      return {
        received: true,
        type: event.type,
      };
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data
        .object as Stripe.Subscription;

      const userId = subscription.metadata?.userId;

      if (!userId) {
        return {
          received: true,
          type: event.type,
          ignored: true,
          reason: 'La suscripción no contiene userId.',
        };
      }

      await this.prisma.subscription.updateMany({
        where: {
          OR: [
            { userId },
            {
              stripeSubId: subscription.id,
            },
          ],
        },
        data: {
          status: 'CANCELLED',
          plan: 'FREE',
          autoRenew: false,
        },
      });

      return {
        received: true,
        type: event.type,
      };
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
      };

      const stripeSubscription = invoice.subscription;

      const stripeSubId =
        typeof stripeSubscription === 'string'
          ? stripeSubscription
          : stripeSubscription?.id;

      if (stripeSubId) {
        await this.prisma.subscription.updateMany({
          where: {
            stripeSubId,
          },
          data: {
            autoRenew: false,
          },
        });
      }

      return {
        received: true,
        type: event.type,
      };
    }

    return {
      received: true,
      type: event.type,
    };
  }

  // ============================================================
  // SINCRONIZAR SUSCRIPCIÓN STRIPE → BASE DE DATOS
  // ============================================================

  private async syncStripeSubscription(
    userId: string,
    subscription: Stripe.Subscription,
    customerId: string | null,
  ) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        'Usuario de Stripe no encontrado.',
      );
    }

    let localStatus:
      | 'FREE'
      | 'ACTIVE'
      | 'CANCELLED'
      | 'EXPIRED'
      | 'TRIAL';

    switch (subscription.status) {
      case 'active':
        localStatus = 'ACTIVE';
        break;
      case 'trialing':
        localStatus = 'TRIAL';
        break;
      case 'canceled':
        localStatus = 'CANCELLED';
        break;
      case 'unpaid':
      case 'incomplete_expired':
        localStatus = 'EXPIRED';
        break;
      case 'past_due':
        localStatus = 'ACTIVE';
        break;
      case 'incomplete':
        localStatus = 'FREE';
        break;
      case 'paused':
        localStatus = 'ACTIVE';
        break;
      default:
        localStatus = 'FREE';
        break;
    }

    const price = subscription.items.data[0]?.price;
    const interval = price?.recurring?.interval;

    let plan: 'FREE' | 'PREMIUM_MONTHLY' | 'PREMIUM_YEARLY';

    if (interval === 'year') {
      plan = 'PREMIUM_YEARLY';
    } else if (interval === 'month') {
      plan = 'PREMIUM_MONTHLY';
    } else {
      plan = 'PREMIUM_MONTHLY';
    }

    if (
      localStatus === 'CANCELLED' ||
      localStatus === 'EXPIRED' ||
      localStatus === 'FREE'
    ) {
      plan = 'FREE';
    }

    const startDate = subscription.start_date
      ? new Date(subscription.start_date * 1000)
      : new Date();

    const periodEnd = (subscription as any).current_period_end as
      | number
      | undefined;

    const endDate = periodEnd ? new Date(periodEnd * 1000) : null;

    const autoRenew = subscription.cancel_at_period_end !== true;

    return this.prisma.subscription.upsert({
      where: {
        userId,
      },
      update: {
        status: localStatus,
        plan,
        startDate,
        endDate,
        stripeCustomerId: customerId,
        stripeSubId: subscription.id,
        autoRenew,
      },
      create: {
        userId,
        status: localStatus,
        plan,
        startDate,
        endDate,
        stripeCustomerId: customerId,
        stripeSubId: subscription.id,
        autoRenew,
      },
    });
  }
}