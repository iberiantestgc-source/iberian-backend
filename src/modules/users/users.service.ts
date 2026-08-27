import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../database/prisma.service';

import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
  ) {}

  async findById(id: string) {
    const user =
      await this.prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          role: true,
          xp: true,
          level: true,
          dailyStreak: true,
          totalQuestions: true,
          correctAnswers: true,
          createdAt: true,
          subscription: {
            select: {
              status: true,
              plan: true,
              endDate: true,
            },
          },
        },
      });

    if (!user) {
      throw new NotFoundException(
        'Usuario no encontrado',
      );
    }

    return user;
  }

  async getProfile(userId: string) {
    return this.findById(userId);
  }

  async updateProfile(
    userId: string,
    data: UpdateProfileDto,
  ) {
    const user =
      await this.prisma.user.findUnique({
        where: { id: userId },
      });

    if (!user) {
      throw new NotFoundException(
        'Usuario no encontrado',
      );
    }

    if (data.email) {
      const email =
        data.email.trim().toLowerCase();

      const existing =
        await this.prisma.user.findFirst({
          where: {
            email,
            NOT: {
              id: userId,
            },
          },
        });

      if (existing) {
        throw new ConflictException(
          'El email ya está registrado',
        );
      }

      data.email = email;
    }

    return this.prisma.user.update({
      where: {
        id: userId,
      },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        xp: true,
        level: true,
      },
    });
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ) {
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

    const valid =
      await bcrypt.compare(
        dto.currentPassword,
        user.passwordHash,
      );

    if (!valid) {
      throw new UnauthorizedException(
        'La contraseña actual no es correcta',
      );
    }

    const passwordHash =
      await bcrypt.hash(
        dto.newPassword,
        12,
      );

    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        passwordHash,
      },
    });

    /*
     * Cerramos las demás sesiones.
     */
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revoked: false,
      },
      data: {
        revoked: true,
      },
    });

    return {
      message:
        'Contraseña cambiada correctamente',
    };
  }
}