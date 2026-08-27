import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../mail/mail.service';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Registrar un nuevo usuario.
   */
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existing) {
      throw new ConflictException(
        'El email ya está registrado',
      );
    }

    const passwordHash = await bcrypt.hash(
      dto.password,
      12,
    );

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: dto.name?.trim() || undefined,

        subscription: {
          create: {
            status: 'FREE',
            plan: 'FREE',
          },
        },
      },

      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        xp: true,
        level: true,
        createdAt: true,
      },
    });

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
    );

    return {
      user,
      ...tokens,
    };
  }

  /**
   * Iniciar sesión.
   */
  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Credenciales inválidas',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException(
        'Credenciales inválidas',
      );
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        xp: user.xp,
        level: user.level,
      },
      ...tokens,
    };
  }

  /**
   * Solicitar recuperación de contraseña.
   */
  async forgotPassword(
    dto: ForgotPasswordDto,
  ) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        email: true,
        isActive: true,
      },
    });

    /**
     * No revelamos si el email existe.
     */
    if (!user || !user.isActive) {
      return {
        message:
          'Si el email está registrado, recibirás las instrucciones para recuperar tu contraseña.',
      };
    }

    /**
     * Invalidar tokens anteriores.
     */
    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        used: false,
      },
      data: {
        used: true,
      },
    });

    /**
     * Crear token aleatorio seguro.
     */
    const rawToken = crypto
      .randomBytes(32)
      .toString('hex');

    /**
     * Guardamos únicamente el hash.
     */
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    /**
     * El token será válido durante 30 minutos.
     */
    const expiresAt = new Date(
      Date.now() + 30 * 60 * 1000,
    );

    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    /**
     * Enviar email de recuperación mediante Resend.
     */
    await this.mailService.sendPasswordResetEmail(
      user.email,
      rawToken,
    );

    const response: {
      message: string;
      resetToken?: string;
    } = {
      message:
        'Si el email está registrado, recibirás las instrucciones para recuperar tu contraseña.',
    };

    /**
     * En desarrollo devolvemos temporalmente el token
     * para poder probar el flujo desde la aplicación
     * aunque el enlace del email todavía no esté configurado.
     */
    if (
      this.configService.get<string>('NODE_ENV') !==
      'production'
    ) {
      response.resetToken = rawToken;
    }

    return response;
  }

  /**
   * Restablecer contraseña utilizando un token.
   */
  async resetPassword(
    dto: ResetPasswordDto,
  ) {
    const token = dto.token?.trim();

    if (!token) {
      throw new UnauthorizedException(
        'Token de recuperación inválido o expirado',
      );
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const resetToken =
      await this.prisma.passwordResetToken.findUnique({
        where: {
          tokenHash,
        },
      });

    if (!resetToken) {
      throw new UnauthorizedException(
        'Token de recuperación inválido o expirado',
      );
    }

    if (resetToken.used) {
      throw new UnauthorizedException(
        'El token de recuperación ya ha sido utilizado',
      );
    }

    if (resetToken.expiresAt <= new Date()) {
      throw new UnauthorizedException(
        'El token de recuperación ha expirado',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: resetToken.userId,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Usuario no válido',
      );
    }

    /**
     * Generar nuevo hash de contraseña.
     */
    const passwordHash = await bcrypt.hash(
      dto.password,
      12,
    );

    /**
     * Actualizar contraseña, invalidar token
     * y cerrar todas las sesiones existentes.
     */
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          passwordHash,
        },
      }),

      this.prisma.passwordResetToken.update({
        where: {
          id: resetToken.id,
        },
        data: {
          used: true,
        },
      }),

      this.prisma.refreshToken.updateMany({
        where: {
          userId: user.id,
          revoked: false,
        },
        data: {
          revoked: true,
        },
      }),
    ]);

    return {
      message:
        'Contraseña restablecida correctamente.',
    };
  }

  /**
   * Renovar access token utilizando refresh token.
   */
  async refreshToken(
    refreshToken: string,
  ) {
    if (
      !refreshToken ||
      !refreshToken.trim()
    ) {
      throw new UnauthorizedException(
        'Refresh token inválido',
      );
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<{
          sub?: string;
          email?: string;
          role?: string;
        }>(refreshToken, {
          secret:
            this.configService.getOrThrow<string>(
              'JWT_REFRESH_SECRET',
            ),
        });

      if (!payload.sub) {
        throw new UnauthorizedException(
          'Refresh token inválido',
        );
      }

      const storedToken =
        await this.prisma.refreshToken.findUnique({
          where: {
            token: refreshToken,
          },
        });

      if (
        !storedToken ||
        storedToken.revoked ||
        storedToken.expiresAt <= new Date()
      ) {
        throw new UnauthorizedException(
          'Refresh token inválido',
        );
      }

      const user =
        await this.prisma.user.findUnique({
          where: {
            id: payload.sub,
          },
        });

      if (!user || !user.isActive) {
        throw new UnauthorizedException(
          'Usuario no válido',
        );
      }

      /**
       * Rotación del refresh token.
       */
      await this.prisma.refreshToken.update({
        where: {
          id: storedToken.id,
        },
        data: {
          revoked: true,
        },
      });

      return this.generateTokens(
        user.id,
        user.email,
        user.role,
      );
    } catch (error) {
      if (
        error instanceof UnauthorizedException
      ) {
        throw error;
      }

      throw new UnauthorizedException(
        'Refresh token inválido',
      );
    }
  }

  /**
   * Cerrar sesión.
   */
  async logout(
    refreshToken: string,
  ) {
    if (
      refreshToken &&
      refreshToken.trim()
    ) {
      await this.prisma.refreshToken.updateMany({
        where: {
          token: refreshToken,
          revoked: false,
        },
        data: {
          revoked: true,
        },
      });
    }

    return {
      message:
        'Sesión cerrada correctamente',
    };
  }

  /**
   * Generar access token + refresh token.
   */
  private async generateTokens(
    userId: string,
    email: string,
    role: string,
  ) {
    const payload = {
      sub: userId,
      email,
      role,
    };

    const accessTokenExpiresIn =
      this.configService.get<string>(
        'JWT_EXPIRES_IN',
      ) || '15m';

    const refreshTokenExpiresIn =
      this.configService.get<string>(
        'JWT_REFRESH_EXPIRES_IN',
      ) || '7d';

    const [
      accessToken,
      refreshToken,
    ] = await Promise.all([
      this.jwtService.signAsync(
        payload,
        {
          secret:
            this.configService.getOrThrow<string>(
              'JWT_SECRET',
            ),
          expiresIn:
            accessTokenExpiresIn as any,
        },
      ),

      this.jwtService.signAsync(
        payload,
        {
          secret:
            this.configService.getOrThrow<string>(
              'JWT_REFRESH_SECRET',
            ),
          expiresIn:
            refreshTokenExpiresIn as any,
        },
      ),
    ]);

    const expiresAt =
      this.calculateExpirationDate(
        refreshTokenExpiresIn,
      );

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * Convertir una duración JWT a una fecha.
   */
  private calculateExpirationDate(
    expiresIn: string,
  ): Date {
    const match = expiresIn
      .trim()
      .match(
        /^(\d+(?:\.\d+)?)\s*(s|m|h|d|w)$/i,
      );

    if (!match) {
      const fallback = new Date();

      fallback.setDate(
        fallback.getDate() + 7,
      );

      return fallback;
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();

    const millisecondsByUnit: Record<
      string,
      number
    > = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000,
    };

    const milliseconds =
      value * millisecondsByUnit[unit];

    return new Date(
      Date.now() + milliseconds,
    );
  }
}