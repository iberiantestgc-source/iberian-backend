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

import { SupabaseService } from './supabase.service';

type UploadedAvatarFile = {
  buffer: Buffer;
  mimetype: string;
};

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private supabaseService: SupabaseService,
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

    let avatarUrl = user.avatarUrl;

    if (
      avatarUrl &&
      !avatarUrl.startsWith('http')
    ) {
      avatarUrl =
        await this.supabaseService.getSignedUrl(
          avatarUrl,
        );
    }

    return {
      ...user,
      avatarUrl,
    };
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

    const updatedUser =
      await this.prisma.user.update({
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

    let avatarUrl =
      updatedUser.avatarUrl;

    if (
      avatarUrl &&
      !avatarUrl.startsWith('http')
    ) {
      avatarUrl =
        await this.supabaseService.getSignedUrl(
          avatarUrl,
        );
    }

    return {
      ...updatedUser,
      avatarUrl,
    };
  }

  async updateAvatar(
    userId: string,
    file: UploadedAvatarFile,
  ) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
          avatarUrl: true,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'Usuario no encontrado',
      );
    }

    const oldAvatarPath =
      user.avatarUrl &&
      !user.avatarUrl.startsWith('http')
        ? user.avatarUrl
        : null;

    const avatarPath =
      await this.supabaseService.uploadAvatar(
        userId,
        file,
      );

    const updatedUser =
      await this.prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          avatarUrl: avatarPath,
        },
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

    if (oldAvatarPath) {
      await this.supabaseService.deleteFile(
        oldAvatarPath,
      );
    }

    const signedAvatarUrl =
      await this.supabaseService.getSignedUrl(
        avatarPath,
      );

    return {
      ...updatedUser,
      avatarUrl: signedAvatarUrl,
    };
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