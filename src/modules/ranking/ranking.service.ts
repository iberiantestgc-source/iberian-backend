import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SupabaseService } from '../users/supabase.service';

@Injectable()
export class RankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService,
  ) {}

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
   * plan público para el front: FREE | PREMIUM
   */
  private resolvePublicPlan(
    role: string,
    sub?: { plan: string; status: string } | null,
  ): 'FREE' | 'PREMIUM' {
    if (
      role === 'ADMIN' ||
      role === 'SUPER_ADMIN' ||
      role === 'PREMIUM'
    ) {
      return 'PREMIUM';
    }

    if (
      sub &&
      (sub.status === 'ACTIVE' || sub.status === 'TRIAL') &&
      sub.plan !== 'FREE'
    ) {
      return 'PREMIUM';
    }

    return 'FREE';
  }

  private async resolveAvatarUrl(
    avatarUrl: string | null,
  ): Promise<string | null> {
    if (!avatarUrl) {
      return null;
    }

    if (avatarUrl.startsWith('http')) {
      return avatarUrl;
    }

    try {
      return await this.supabaseService.getSignedUrl(avatarUrl);
    } catch {
      return null;
    }
  }

  private async mapUser(user: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
    level: number;
    xp: number;
    role: string;
    subscription?: { plan: string; status: string } | null;
  }) {
    const avatarUrl = await this.resolveAvatarUrl(user.avatarUrl);
    const plan = this.resolvePublicPlan(
      user.role,
      user.subscription ?? null,
    );

    return {
      id: user.id,
      name: user.name,
      avatarUrl,
      level: user.level,
      xp: user.xp,
      role: user.role,
      plan,
    };
  }

  async getLeaderboard(params: {
    oppositionId?: string;
    limit?: number;
    offset?: number;
  }) {
    const { oppositionId, limit = 50, offset = 0 } = params;

    const ranking = await this.getOrCreateGlobalRanking(oppositionId);

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
              role: true,
              subscription: {
                select: {
                  plan: true,
                  status: true,
                },
              },
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

    const mapped = await Promise.all(
      entries.map(async (entry) => ({
        id: entry.id,
        position: entry.position,
        score: entry.score,
        user: await this.mapUser(entry.user),
      })),
    );

    return {
      rankingId: ranking.id,
      rankingName: ranking.name,
      total,
      limit: safeLimit,
      offset: safeOffset,
      entries: mapped,
    };
  }

  async getUserPosition(userId: string, oppositionId?: string) {
    const ranking = await this.getOrCreateGlobalRanking(oppositionId);

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
            role: true,
            subscription: {
              select: {
                plan: true,
                status: true,
              },
            },
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
      user: await this.mapUser(entry.user),
    };
  }
}