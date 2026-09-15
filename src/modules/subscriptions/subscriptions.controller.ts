import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';

import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '@prisma/client';

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mi suscripción y límites' })
  async getMine(@CurrentUser('id') userId: string) {
    const [sub, limits] = await Promise.all([
      this.subscriptionsService.getSubscription(userId),
      this.subscriptionsService.getLimits(userId),
    ]);

    return {
      subscription: sub,
      limits,
    };
  }

  @Post('checkout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Crear sesión de pago Stripe (Premium 9,99€/mes)' })
  checkout(@CurrentUser('id') userId: string) {
    return this.subscriptionsService.createCheckoutSession(userId);
  }

  /**
   * Webhook de Stripe — SIN JWT.
   * Stripe firma la petición; no lleva Authorization.
   */
  @Post('webhook')
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody;

    if (!rawBody) {
      return {
        received: false,
        error: 'Raw body no disponible. Revisa main.ts (rawBody: true).',
      };
    }

    return this.subscriptionsService.handleStripeWebhook(
      signature,
      Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody),
    );
  }

  @Post('activate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Activar Premium manualmente (Admin)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          example: 'uuid-usuario',
        },
        plan: {
          type: 'string',
          enum: ['PREMIUM_MONTHLY', 'PREMIUM_YEARLY'],
          example: 'PREMIUM_MONTHLY',
        },
        days: {
          type: 'number',
          example: 30,
        },
      },
      required: ['userId', 'plan'],
    },
  })
  activate(
    @Body()
    body: {
      userId: string;
      plan: 'PREMIUM_MONTHLY' | 'PREMIUM_YEARLY';
      days?: number;
    },
  ) {
    const days =
      body.days ?? (body.plan === 'PREMIUM_YEARLY' ? 365 : 30);

    return this.subscriptionsService.activatePremium(
      body.userId,
      body.plan,
      days,
    );
  }

  @Post('cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cancelar mi suscripción' })
  cancel(@CurrentUser('id') userId: string) {
    return this.subscriptionsService.cancelSubscription(userId);
  }
}