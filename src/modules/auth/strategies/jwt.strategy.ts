import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../database/prisma.service';

interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest:
        ExtractJwt.fromAuthHeaderAsBearerToken(),

      ignoreExpiration: false,

      secretOrKey:
        configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Se ejecuta después de validar criptográficamente el JWT.
   *
   * El usuario se obtiene siempre desde la base de datos
   * para garantizar que el estado actual de la cuenta y
   * su rol sean los utilizados en la petición.
   */
  async validate(payload: JwtPayload) {
    if (!payload?.sub) {
      throw new UnauthorizedException(
        'Token inválido',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
      },

      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        xp: true,
        level: true,
        isActive: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        'Usuario no autorizado',
      );
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'La cuenta está desactivada',
      );
    }

    return user;
  }
}