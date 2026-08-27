import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface AchievementCondition {
  type?: string;
  count?: number;
  days?: number;
  xp?: number;
}

@Injectable()
export class AchievementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista todos los logros activos e indica cuáles
   * están desbloqueados por el usuario.
   */
  async findAllForUser(userId: string) {
    const [achievements, unlocked] = await Promise.all([
      this.prisma.achievement.findMany({
        where: { isActive: true },
        orderBy: {
          xpReward: 'asc',
        },
      }),

      this.prisma.userAchievement.findMany({
        where: { userId },
        select: {
          achievementId: true,
          unlockedAt: true,
        },
      }),
    ]);

    const unlockedMap = new Map(
      unlocked.map((achievement) => [
        achievement.achievementId,
        achievement.unlockedAt,
      ]),
    );

    return achievements.map((achievement) => ({
      id: achievement.id,
      code: achievement.code,
      name: achievement.name,
      description: achievement.description,
      iconUrl: achievement.iconUrl,
      xpReward: achievement.xpReward,
      unlocked: unlockedMap.has(achievement.id),
      unlockedAt: unlockedMap.get(achievement.id) ?? null,
    }));
  }

  /**
   * Comprueba y desbloquea los logros que correspondan
   * después de una acción del usuario.
   *
   * Puede ejecutarse después de:
   * - finalizar un test
   * - responder preguntas
   * - conseguir XP
   * - mantener una racha
   */
  async checkAndUnlock(
    userId: string,
  ): Promise<
    {
      code: string;
      name: string;
      xpReward: number;
    }[]
  > {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        xp: true,
        totalQuestions: true,
        correctAnswers: true,
        dailyStreak: true,
      },
    });

    if (!user) {
      return [];
    }

    const [testsCompleted, alreadyUnlocked, candidates] =
      await Promise.all([
        this.prisma.testAttempt.count({
          where: {
            userId,
            status: 'COMPLETED',
          },
        }),

        this.prisma.userAchievement.findMany({
          where: { userId },
          select: {
            achievementId: true,
          },
        }),

        this.prisma.achievement.findMany({
          where: {
            isActive: true,
          },
        }),
      ]);

    const unlockedIds = new Set(
      alreadyUnlocked.map(
        (achievement) => achievement.achievementId,
      ),
    );

    const newlyUnlocked: {
      code: string;
      name: string;
      xpReward: number;
    }[] = [];

    for (const achievement of candidates) {
      if (unlockedIds.has(achievement.id)) {
        continue;
      }

      const condition =
        achievement.condition &&
        typeof achievement.condition === 'object' &&
        !Array.isArray(achievement.condition)
          ? (achievement.condition as AchievementCondition)
          : {};

      let shouldUnlock = false;

      switch (condition.type) {
        case 'FIRST_TEST':
          shouldUnlock = testsCompleted >= 1;
          break;

        case 'TESTS_COMPLETED':
          shouldUnlock =
            testsCompleted >= (condition.count ?? 10);
          break;

        case 'QUESTIONS_ANSWERED':
          shouldUnlock =
            user.totalQuestions >= (condition.count ?? 100);
          break;

        case 'CORRECT_ANSWERS':
          shouldUnlock =
            user.correctAnswers >= (condition.count ?? 50);
          break;

        case 'DAILY_STREAK':
          shouldUnlock =
            user.dailyStreak >= (condition.days ?? 7);
          break;

        case 'XP_REACHED':
          shouldUnlock =
            user.xp >= (condition.xp ?? 1000);
          break;

        default:
          shouldUnlock = false;
          break;
      }

      if (!shouldUnlock) {
        continue;
      }

      try {
        await this.prisma.userAchievement.create({
          data: {
            userId,
            achievementId: achievement.id,
          },
        });
      } catch {
        // Si otro proceso desbloqueó el logro simultáneamente,
        // no debemos romper la operación.
        continue;
      }

      if (achievement.xpReward > 0) {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            xp: {
              increment: achievement.xpReward,
            },
          },
        });
      }

      newlyUnlocked.push({
        code: achievement.code,
        name: achievement.name,
        xpReward: achievement.xpReward,
      });
    }

    return newlyUnlocked;
  }

  /**
   * Crea los logros predeterminados de IBERIAN.
   *
   * Puede ejecutarse desde:
   * - seed de Prisma
   * - panel de administración
   * - proceso de inicialización
   */
  async seedDefaultAchievements() {
    const defaults = [
      {
        code: 'FIRST_TEST',
        name: 'Primer test',
        description: 'Completa tu primer test',
        xpReward: 25,
        condition: {
          type: 'FIRST_TEST',
        },
      },

      {
        code: 'TESTS_10',
        name: '10 tests',
        description: 'Completa 10 tests',
        xpReward: 100,
        condition: {
          type: 'TESTS_COMPLETED',
          count: 10,
        },
      },

      {
        code: 'TESTS_50',
        name: '50 tests',
        description: 'Completa 50 tests',
        xpReward: 300,
        condition: {
          type: 'TESTS_COMPLETED',
          count: 50,
        },
      },

      {
        code: 'QUESTIONS_100',
        name: '100 preguntas',
        description: 'Responde 100 preguntas',
        xpReward: 75,
        condition: {
          type: 'QUESTIONS_ANSWERED',
          count: 100,
        },
      },

      {
        code: 'QUESTIONS_1000',
        name: '1000 preguntas',
        description: 'Responde 1000 preguntas',
        xpReward: 400,
        condition: {
          type: 'QUESTIONS_ANSWERED',
          count: 1000,
        },
      },

      {
        code: 'STREAK_7',
        name: 'Racha de 7 días',
        description: 'Estudia 7 días seguidos',
        xpReward: 150,
        condition: {
          type: 'DAILY_STREAK',
          days: 7,
        },
      },

      {
        code: 'STREAK_30',
        name: 'Racha de 30 días',
        description: 'Estudia 30 días seguidos',
        xpReward: 500,
        condition: {
          type: 'DAILY_STREAK',
          days: 30,
        },
      },

      {
        code: 'XP_1000',
        name: '1000 XP',
        description: 'Alcanza 1000 puntos de experiencia',
        xpReward: 50,
        condition: {
          type: 'XP_REACHED',
          xp: 1000,
        },
      },
    ];

    for (const achievement of defaults) {
      await this.prisma.achievement.upsert({
        where: {
          code: achievement.code,
        },
        update: {
          name: achievement.name,
          description: achievement.description,
          xpReward: achievement.xpReward,
          condition: achievement.condition,
          isActive: true,
        },
        create: achievement,
      });
    }

    return {
      seeded: defaults.length,
    };
  }
}