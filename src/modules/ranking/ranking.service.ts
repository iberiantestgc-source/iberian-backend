import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class RankingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtiene o crea el ranking global.
   */
  async getOrCreateGlobalRanking(oppositionId?: string) {
    const name = oppositionId
      ? 'Ranking Global - Oposición'
      : 'Ranking Global';

    let ranking = await this.prisma.ranking.findFirst({
      where: {
        type: 'GLOBAL',
        oppositionId: oppositionId ?? null,
        isActive: true,
      },
    });

    if (!ranking) {
      ranking = await this.prisma.ranking.create({
        data: {
          name,
          type: 'GLOBAL',
          oppositionId: oppositionId ?? null,
          isActive: true,
        },
      });
    }

    return ranking;
  }

  /**
   * Sincroniza todos los usuarios activos con el ranking.
   *
   * Esto garantiza que un usuario aparezca en el ranking aunque
   * todavía no haya realizado ningún test y tenga 0 XP.
   */
  async syncAllUsers(rankingId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        xp: true,
      },
    });

    if (users.length === 0) {
      return;
    }

    await Promise.all(
      users.map((user) =>
        this.prisma.rankingEntry.upsert({
          where: {
            rankingId_userId: {
              rankingId,
              userId: user.id,
            },
          },
          update: {
            score: user.xp,
          },
          create: {
            rankingId,
            userId: user.id,
            score: user.xp,
          },
        }),
      ),
    );

    await this.recalculatePositions(rankingId);
  }

  /**
   * Actualiza la puntuación de un usuario concreto.
   *
   * Se utiliza cuando el usuario gana XP después de realizar
   * un test, conseguir un logro, etc.
   */
  async updateUserScore(userId: string, oppositionId?: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        xp: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return;
    }

    const ranking = await this.getOrCreateGlobalRanking(oppositionId);

    await this.prisma.rankingEntry.upsert({
      where: {
        rankingId_userId: {
          rankingId: ranking.id,
          userId,
        },
      },
      update: {
        score: user.xp,
      },
      create: {
        rankingId: ranking.id,
        userId,
        score: user.xp,
      },
    });

    await this.recalculatePositions(ranking.id);
  }

  /**
   * Recalcula las posiciones del ranking.
   *
   * Orden:
   * 1. Mayor XP
   * 2. En caso de empate, se mantiene un orden estable por ID.
   */
  async recalculatePositions(rankingId: string) {
    const entries = await this.prisma.rankingEntry.findMany({
      where: {
        rankingId,
      },
      orderBy: [
        {
          score: 'desc',
        },
        {
          id: 'asc',
        },
      ],
      select: {
        id: true,
      },
    });

    await Promise.all(
      entries.map((entry, index) =>
        this.prisma.rankingEntry.update({
          where: {
            id: entry.id,
          },
          data: {
            position: index + 1,
          },
        }),
      ),
    );
  }

  /**
   * Obtiene el Top N del ranking global.
   *
   * Antes de devolver los resultados sincronizamos todos los usuarios
   * activos para garantizar que aparezcan también los que tienen 0 XP.
   */
  async getLeaderboard(params: {
    oppositionId?: string;
    limit?: number;
    offset?: number;
  }) {
    const {
      oppositionId,
      limit = 50,
      offset = 0,
    } = params;

    const ranking = await this.getOrCreateGlobalRanking(oppositionId);

    // Garantizar que todos los usuarios activos estén en el ranking.
    await this.syncAllUsers(ranking.id);

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);

    const [entries, total] = await Promise.all([
      this.prisma.rankingEntry.findMany({
        where: {
          rankingId: ranking.id,
          user: {
            isActive: true,
          },
        },
        orderBy: [
          {
            score: 'desc',
          },
          {
            position: 'asc',
          },
        ],
        take: safeLimit,
        skip: safeOffset,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              level: true,
              xp: true,
            },
          },
        },
      }),

      this.prisma.rankingEntry.count({
        where: {
          rankingId: ranking.id,
          user: {
            isActive: true,
          },
        },
      }),
    ]);

    return {
      rankingId: ranking.id,
      rankingName: ranking.name,
      total,
      limit: safeLimit,
      offset: safeOffset,

      entries: entries.map((entry) => ({
        id: entry.id,
        position: entry.position,
        score: entry.score,

        user: {
          id: entry.user.id,
          name: entry.user.name,
          avatarUrl: entry.user.avatarUrl,
          level: entry.user.level,
          xp: entry.user.xp,
        },
      })),
    };
  }

  /**
   * Obtiene la posición de un usuario concreto.
   */
  async getUserPosition(
    userId: string,
    oppositionId?: string,
  ) {
    const ranking = await this.getOrCreateGlobalRanking(oppositionId);

    // Garantizamos que todos los usuarios estén sincronizados.
    await this.syncAllUsers(ranking.id);

    const entry = await this.prisma.rankingEntry.findUnique({
      where: {
        rankingId_userId: {
          rankingId: ranking.id,
          userId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            level: true,
            xp: true,
          },
        },
      },
    });

    if (!entry) {
      return {
        position: null,
        score: 0,
        user: null,
        message: 'Usuario no encontrado en el ranking.',
      };
    }

    return {
      position: entry.position,
      score: entry.score,
      user: entry.user,
    };
  }
}