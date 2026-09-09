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
  // FECHA ACTUAL SIN HORA
  // ============================================================

  private getToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  /** True si el plan no tiene límite diario real. */
  private isUnlimitedDaily(dailyQuestions: number): boolean {
    return dailyQuestions >= PREMIUM_DAILY_QUESTIONS;
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

    /**
     * Si el usuario todavía no tiene suscripción,
     * se crea automáticamente como FREE.
     */
    if (!sub) {
      return this.prisma.subscription.create({
        data: {
          userId,
          status: 'FREE',
          plan: 'FREE',
        },
      });
    }

    /**
     * Si una suscripción ACTIVE ha llegado a su fecha
     * de finalización, pasa automáticamente a EXPIRED.
     */
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
     * sin necesidad de realizar pagos.
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
    const today = this.getToday();

    const usage = await this.prisma.dailyQuestionUsage.findUnique({
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

  async getQuestionsRemainingToday(userId: string): Promise<number> {
    const limits = await this.getLimits(userId);

    if (this.isUnlimitedDaily(limits.dailyQuestions)) {
      return PREMIUM_DAILY_QUESTIONS;
    }

    const used = await this.getQuestionsUsedToday(userId);

    return Math.max(limits.dailyQuestions - used, 0);
  }

  // ============================================================
  // COMPROBAR SI PUEDE CONSUMIR PREGUNTAS
  // ============================================================

  async canAnswerQuestions(userId: string, count = 1): Promise<void> {
    if (!Number.isInteger(count) || count < 1) {
      throw new ForbiddenException(
        'La cantidad de preguntas no es válida.',
      );
    }

    const limits = await this.getLimits(userId);

    if (this.isUnlimitedDaily(limits.dailyQuestions)) {
      return;
    }

    const used = await this.getQuestionsUsedToday(userId);
    const remaining = Math.max(limits.dailyQuestions - used, 0);

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

    /**
     * Premium no consume contador diario.
     */
    if (this.isUnlimitedDaily(limits.dailyQuestions)) {
      return;
    }

    const today = this.getToday();

    const usage = await this.prisma.dailyQuestionUsage.upsert({
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

    /**
     * Protección adicional contra superar el límite.
     */
    if (usage.questionsUsed > limits.dailyQuestions) {
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
  // INFORMACIÓN COMPLETA DE USO DIARIO
  // ============================================================

  async getDailyUsage(userId: string) {
    const limits = await this.getLimits(userId);
    const used = await this.getQuestionsUsedToday(userId);
    const unlimited = this.isUnlimitedDaily(limits.dailyQuestions);

    const remaining = unlimited
      ? PREMIUM_DAILY_QUESTIONS
      : Math.max(limits.dailyQuestions - used, 0);

    return {
      used,
      limit: limits.dailyQuestions,
      remaining,
      unlimited,
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

    /**
     * Premium puede generar simulacros ilimitados.
     */
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

    /**
     * Los admin ya cuentan como Premium en isPremium().
     * Si un admin necesita probar el checkout, comenta este bloque
     * temporalmente o usa un usuario FREE.
     */
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
      /**
       * Si el precio en Stripe es de pago único (no recurrente),
       * mode: 'subscription' falla. Reintentamos con payment.
       */
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
        error?.message || 'Error al crear la sesión de pago en Stripe.',
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
      const session = event.data.object as Stripe.Checkout.Session;
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

        const subscription = await stripe.subscriptions.retrieve(
          stripeSubscriptionId,
        );

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
      const subscription = event.data.object as Stripe.Subscription;
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
      const subscription = event.data.object as Stripe.Subscription;
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
          OR: [{ userId }, { stripeSubId: subscription.id }],
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