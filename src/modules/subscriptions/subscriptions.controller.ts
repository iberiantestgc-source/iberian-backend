import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';

import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
} from '@nestjs/swagger';

import { SubscriptionsService } from './subscriptions.service';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { Roles } from '../../common/decorators/roles.decorator';

import { RolesGuard } from '../../common/guards/roles.guard';

import { Role } from '@prisma/client';

@ApiTags('subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Get('me')
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
  @ApiOperation({ summary: 'Crear sesión de pago Stripe (Premium)' })
  checkout(@CurrentUser('id') userId: string) {
    return this.subscriptionsService.createCheckoutSession(userId);
  }

  @Post('activate')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Activar Premium manualmente (Admin)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'ID del usuario al que se le activará Premium',
          example: 'ID_DEL_USUARIO',
        },
        plan: {
          type: 'string',
          description: 'Plan Premium',
          enum: ['PREMIUM_MONTHLY', 'PREMIUM_YEARLY'],
          example: 'PREMIUM_YEARLY',
        },
        days: {
          type: 'number',
          description: 'Duración de Premium en días',
          example: 365,
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
  @ApiOperation({ summary: 'Cancelar mi suscripción' })
  cancel(@CurrentUser('id') userId: string) {
    return this.subscriptionsService.cancelSubscription(userId);
  }
}
