import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

type StatisticsPeriod =
  | 'general'
  | 'semanal'
  | 'mensual'
  | 'anual';

type TopicStatLevel =
  | 'TOPIC'
  | 'SUBTOPIC';

@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) {}

  // ============================================================
  // ESTADÍSTICAS GENERALES
  // ============================================================

  async getUserStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        xp: true,
        level: true,
        dailyStreak: true,
        totalQuestions: true,
        correctAnswers: true,
        lastStudyDate: true,
      },
    });

    if (!user) return null;

    const accuracy =
      user.totalQuestions > 0
        ? Math.round(
            (user.correctAnswers / user.totalQuestions) * 10000,
          ) / 100
        : 0;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(
      sevenDaysAgo.getDate() - 7,
    );

    const recentAnswers =
      await this.prisma.userAnswer.groupBy({
        by: ['isCorrect'],
        where: {
          userId,
          answeredAt: {
            gte: sevenDaysAgo,
          },
        },
        _count: true,
      });

    const recentCorrect =
      recentAnswers.find(
        (r) => r.isCorrect === true,
      )?._count ?? 0;

    const recentWrong =
      recentAnswers.find(
        (r) => r.isCorrect === false,
      )?._count ?? 0;

    const testsCompleted =
      await this.prisma.testAttempt.count({
        where: {
          userId,
          status: 'COMPLETED',
        },
      });

    const studyTime =
      await this.getStudyTime(
        userId,
        undefined,
      );

    return {
      xp: user.xp,
      level: user.level,
      dailyStreak: user.dailyStreak,
      totalQuestions: user.totalQuestions,
      correctAnswers: user.correctAnswers,
      accuracy,
      testsCompleted,
      lastStudyDate: user.lastStudyDate,

      studyTimeSeconds:
        studyTime.studyTimeSeconds,

      studyHours:
        Math.round(
          (studyTime.studyTimeSeconds / 3600) * 10,
        ) / 10,

      last7Days: {
        correct: recentCorrect,
        wrong: recentWrong,
        total:
          recentCorrect +
          recentWrong,
        accuracy:
          recentCorrect +
            recentWrong >
          0
            ? Math.round(
                (recentCorrect /
                  (recentCorrect +
                    recentWrong)) *
                  10000,
              ) / 100
            : 0,
      },
    };
  }

  // ============================================================
  // ESTADÍSTICAS POR PERIODO
  // ============================================================

  async getPeriodStats(
    userId: string,
    period: StatisticsPeriod,
  ) {
    const now = new Date();

    let startDate: Date;

    switch (period) {
      case 'semanal':
        startDate = new Date(now);
        startDate.setDate(
          startDate.getDate() - 7,
        );
        break;

      case 'mensual':
        startDate = new Date(now);
        startDate.setMonth(
          startDate.getMonth() - 1,
        );
        break;

      case 'anual':
        startDate = new Date(now);
        startDate.setFullYear(
          startDate.getFullYear() - 1,
        );
        break;

      case 'general':
      default:
        startDate = new Date(0);
        break;
    }

    const answers =
      await this.prisma.userAnswer.findMany({
        where: {
          userId,
          answeredAt: {
            gte: startDate,
          },
        },
        select: {
          isCorrect: true,
          answeredAt: true,
        },
        orderBy: {
          answeredAt: 'asc',
        },
      });

    const tests =
      await this.prisma.testAttempt.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          finishedAt: {
            gte: startDate,
          },
        },
        select: {
          id: true,
          finishedAt: true,
          timeSpentSec: true,
        },
        orderBy: {
          finishedAt: 'asc',
        },
      });

    const correct =
      answers.filter(
        (answer) =>
          answer.isCorrect === true,
      ).length;

    const wrong =
      answers.filter(
        (answer) =>
          answer.isCorrect === false,
      ).length;

    const total =
      answers.length;

    const accuracy =
      total > 0
        ? Math.round(
            (correct / total) * 10000,
          ) / 100
        : 0;

    const studyTimeSeconds =
      tests.reduce(
        (sum, test) =>
          sum +
          (test.timeSpentSec ?? 0),
        0,
      );

    return {
      period,
      correct,
      wrong,
      total,
      accuracy,
      testsCompleted:
        tests.length,
      studyTimeSeconds,
      studyHours:
        Math.round(
          (studyTimeSeconds / 3600) * 10,
        ) / 10,
      evolution:
        this.buildEvolution(
          answers,
          period,
        ),
    };
  }

  // ============================================================
  // EVOLUCIÓN
  // ============================================================

  private buildEvolution(
    answers: {
      isCorrect: boolean;
      answeredAt: Date;
    }[],
    period: StatisticsPeriod,
  ) {
    if (answers.length === 0) {
      return [];
    }

    const buckets = new Map<
      string,
      {
        date: string;
        correct: number;
        wrong: number;
        total: number;
      }
    >();

    for (const answer of answers) {
      const date =
        this.getEvolutionDate(
          answer.answeredAt,
          period,
        );

      const current =
        buckets.get(date) ?? {
          date,
          correct: 0,
          wrong: 0,
          total: 0,
        };

      current.total += 1;

      if (answer.isCorrect) {
        current.correct += 1;
      } else {
        current.wrong += 1;
      }

      buckets.set(date, current);
    }

    return Array.from(
      buckets.values(),
    ).map((bucket) => ({
      date: bucket.date,
      correct: bucket.correct,
      wrong: bucket.wrong,
      total: bucket.total,
      accuracy:
        bucket.total > 0
          ? Math.round(
              (bucket.correct /
                bucket.total) *
                10000,
            ) / 100
          : 0,
    }));
  }

  // ============================================================
  // FECHA DE AGRUPACIÓN
  // ============================================================

  private getEvolutionDate(
    date: Date,
    period: StatisticsPeriod,
  ): string {
    const d = new Date(date);

    if (period === 'anual') {
      return `${d.getFullYear()}-${String(
        d.getMonth() + 1,
      ).padStart(2, '0')}`;
    }

    if (period === 'mensual') {
      return `${d.getFullYear()}-${String(
        d.getMonth() + 1,
      ).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;
    }

    if (period === 'semanal') {
      return `${d.getFullYear()}-${String(
        d.getMonth() + 1,
      ).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;
    }

    return `${d.getFullYear()}-${String(
      d.getMonth() + 1,
    ).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  }

  // ============================================================
  // TIEMPO REAL DE ESTUDIO
  // ============================================================

  private async getStudyTime(
    userId: string,
    startDate?: Date,
  ) {
    const tests =
      await this.prisma.testAttempt.findMany({
        where: {
          userId,
          status: 'COMPLETED',

          ...(startDate
            ? {
                finishedAt: {
                  gte: startDate,
                },
              }
            : {}),
        },

        select: {
          timeSpentSec: true,
        },
      });

    const studyTimeSeconds =
      tests.reduce(
        (sum, test) =>
          sum +
          (test.timeSpentSec ?? 0),
        0,
      );

    return {
      studyTimeSeconds,
    };
  }

  // ============================================================
  // ESTADÍSTICAS POR TEMA Y SUBTEMA
  // ============================================================

  async getTopicStats(
    userId: string,
    oppositionId?: string,
  ) {
    const answers =
      await this.prisma.userAnswer.findMany({
        where: {
          userId,
          question: oppositionId
            ? {
                oppositionId,
              }
            : undefined,
        },

        select: {
          isCorrect: true,

          question: {
            select: {
              topicId: true,

              topic: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  parentId: true,
                  parent: {
                    select: {
                      id: true,
                      name: true,
                      code: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

    type TopicAccumulator = {
      topicId: string;
      name: string;
      code: string | null;
      parentTopicId: string | null;
      parentTopicName: string | null;
      parentTopicCode: string | null;
      level: TopicStatLevel;
      correct: number;
      wrong: number;
      total: number;
    };

    // ----------------------------------------------------------
    // ESTADÍSTICAS DIRECTAS DE CADA SUBTEMA
    // ----------------------------------------------------------

    const bySubtopic =
      new Map<
        string,
        TopicAccumulator
      >();

    // ----------------------------------------------------------
    // ESTADÍSTICAS GLOBALES DE CADA TEMA PRINCIPAL
    //
    // Incluye:
    // - preguntas asignadas directamente al tema
    // - preguntas asignadas a cualquiera de sus subtemas
    // ----------------------------------------------------------

    const byTopic =
      new Map<
        string,
        TopicAccumulator
      >();

    for (const answer of answers) {
      const topic =
        answer.question.topic;

      if (!topic) continue;

      // ========================================================
      // RESPUESTA DEL TEMA PRINCIPAL
      // ========================================================

      const parentTopic =
        topic.parent ?? topic;

      const parentAccumulator =
        byTopic.get(
          parentTopic.id,
        ) ?? {
          topicId:
            parentTopic.id,
          name:
            parentTopic.name,
          code:
            parentTopic.code,
          parentTopicId:
            null,
          parentTopicName:
            null,
          parentTopicCode:
            null,
          level: 'TOPIC',
          correct: 0,
          wrong: 0,
          total: 0,
        };

      parentAccumulator.total += 1;

      if (answer.isCorrect) {
        parentAccumulator.correct += 1;
      } else {
        parentAccumulator.wrong += 1;
      }

      byTopic.set(
        parentTopic.id,
        parentAccumulator,
      );

      // ========================================================
      // RESPUESTA DIRECTA DEL SUBTEMA
      // ========================================================

      if (topic.parent) {
        const subtopicAccumulator =
          bySubtopic.get(
            topic.id,
          ) ?? {
            topicId: topic.id,
            name: topic.name,
            code: topic.code,
            parentTopicId:
              topic.parent.id,
            parentTopicName:
              topic.parent.name,
            parentTopicCode:
              topic.parent.code,
            level: 'SUBTOPIC',
            correct: 0,
            wrong: 0,
            total: 0,
          };

        subtopicAccumulator.total += 1;

        if (answer.isCorrect) {
          subtopicAccumulator.correct += 1;
        } else {
          subtopicAccumulator.wrong += 1;
        }

        bySubtopic.set(
          topic.id,
          subtopicAccumulator,
        );
      }
    }

    const calculateAccuracy = (
      topic: TopicAccumulator,
    ) => ({
      ...topic,

      accuracy:
        topic.total > 0
          ? Math.round(
              (topic.correct /
                topic.total) *
                10000,
            ) / 100
          : 0,
    });

    const topicStats =
      Array.from(
        byTopic.values(),
      ).map(
        calculateAccuracy,
      );

    const subtopicStats =
      Array.from(
        bySubtopic.values(),
      ).map(
        calculateAccuracy,
      );

    // ==========================================================
    // DEVOLVEMOS PRIMERO LOS TEMAS Y DESPUÉS LOS SUBTEMAS
    // ==========================================================

    return [
      ...topicStats,
      ...subtopicStats,
    ];
  }

  // ============================================================
  // RECOMENDACIONES DE ESTUDIO
  // ============================================================

  async getStudyRecommendations(
    userId: string,
    oppositionId?: string,
  ) {
    const [
      userStats,
      topicStats,
    ] = await Promise.all([
      this.getUserStats(userId),
      this.getTopicStats(
        userId,
        oppositionId,
      ),
    ]);

    if (!userStats) {
      return null;
    }

    // ----------------------------------------------------------
    // PARA LAS RECOMENDACIONES UTILIZAMOS SOLO LOS TEMAS
    // PRINCIPALES.
    //
    // Así no duplicamos las respuestas de los subtemas.
    // El endpoint de estadísticas sigue devolviendo ambos niveles.
    // ----------------------------------------------------------

    const mainTopics =
      topicStats.filter(
        (topic) =>
          topic.level === 'TOPIC',
      );

    // ----------------------------------------------------------
    // CLASIFICAR TEMAS
    // ----------------------------------------------------------

    const weakTopics =
      mainTopics
        .filter(
          (topic) =>
            topic.total >= 3 &&
            topic.accuracy < 70,
        )
        .sort(
          (a, b) =>
            a.accuracy -
            b.accuracy,
        )
        .slice(0, 5);

    const mediumTopics =
      mainTopics
        .filter(
          (topic) =>
            topic.total >= 3 &&
            topic.accuracy >= 70 &&
            topic.accuracy < 85,
        )
        .sort(
          (a, b) =>
            a.accuracy -
            b.accuracy,
        )
        .slice(0, 5);

    const strongTopics =
      mainTopics
        .filter(
          (topic) =>
            topic.total >= 3 &&
            topic.accuracy >= 85,
        )
        .sort(
          (a, b) =>
            b.accuracy -
            a.accuracy,
        )
        .slice(0, 5);

    // ----------------------------------------------------------
    // PRIORIDAD
    // ----------------------------------------------------------

    let priority:
      | 'HIGH'
      | 'MEDIUM'
      | 'LOW' = 'LOW';

    if (
      weakTopics.length > 0
    ) {
      priority = 'HIGH';
    } else if (
      mediumTopics.length > 0
    ) {
      priority = 'MEDIUM';
    }

    // ----------------------------------------------------------
    // TEMA PRINCIPAL
    // ----------------------------------------------------------

    const mainTopic =
      weakTopics[0] ??
      mediumTopics[0] ??
      null;

    // ----------------------------------------------------------
    // TIEMPO RECOMENDADO
    // ----------------------------------------------------------

    let recommendedMinutes = 30;

    if (
      weakTopics.length >= 3
    ) {
      recommendedMinutes = 45;
    } else if (
      weakTopics.length === 1
    ) {
      recommendedMinutes = 30;
    } else if (
      mediumTopics.length > 0
    ) {
      recommendedMinutes = 25;
    } else if (
      strongTopics.length > 0
    ) {
      recommendedMinutes = 20;
    }

    // ----------------------------------------------------------
    // MENSAJE PRINCIPAL
    // ----------------------------------------------------------

    let message =
      'Continúa estudiando y realizando preguntas para que IBERIAN pueda analizar mejor tu rendimiento.';

    if (mainTopic) {
      message =
        `Te recomiendo reforzar "${mainTopic.name}". ` +
        `Actualmente tienes un ${mainTopic.accuracy}% de aciertos ` +
        `en ${mainTopic.total} preguntas.`;
    } else if (
      strongTopics.length > 0 &&
      userStats.totalQuestions >= 10
    ) {
      message =
        'Tu rendimiento actual es bueno. ' +
        'Continúa practicando y utiliza simulacros para mantener el nivel.';
    }

    // ----------------------------------------------------------
    // RECOMENDACIÓN DE SESIÓN
    // ----------------------------------------------------------

    let sessionRecommendation =
      `Estudia durante ${recommendedMinutes} minutos.`;

    if (
      recommendedMinutes >= 45
    ) {
      sessionRecommendation =
        'Haz una sesión de 45 minutos: 35 minutos de estudio y 10 minutos de repaso de errores.';
    } else if (
      recommendedMinutes === 30
    ) {
      sessionRecommendation =
        'Haz una sesión de 30 minutos: 25 minutos de estudio y 5 minutos de repaso.';
    } else {
      sessionRecommendation =
        `Haz una sesión concentrada de ${recommendedMinutes} minutos y después descansa.`;
    }

    return {
      priority,

      message,

      recommendedMinutes,

      sessionRecommendation,

      focusTopic: mainTopic
        ? {
            id:
              mainTopic.topicId,
            name:
              mainTopic.name,
            code:
              mainTopic.code,
            accuracy:
              mainTopic.accuracy,
            totalQuestions:
              mainTopic.total,
            correct:
              mainTopic.correct,
            wrong:
              mainTopic.wrong,
          }
        : null,

      weakTopics:
        weakTopics.map(
          (topic) => ({
            id:
              topic.topicId,
            name:
              topic.name,
            code:
              topic.code,
            accuracy:
              topic.accuracy,
            totalQuestions:
              topic.total,
            correct:
              topic.correct,
            wrong:
              topic.wrong,
          }),
        ),

      mediumTopics:
        mediumTopics.map(
          (topic) => ({
            id:
              topic.topicId,
            name:
              topic.name,
            code:
              topic.code,
            accuracy:
              topic.accuracy,
            totalQuestions:
              topic.total,
            correct:
              topic.correct,
            wrong:
              topic.wrong,
          }),
        ),

      strongTopics:
        strongTopics.map(
          (topic) => ({
            id:
              topic.topicId,
            name:
              topic.name,
            code:
              topic.code,
            accuracy:
              topic.accuracy,
            totalQuestions:
              topic.total,
            correct:
              topic.correct,
            wrong:
              topic.wrong,
          }),
        ),

      globalStats: {
        level:
          userStats.level,
        xp:
          userStats.xp,
        accuracy:
          userStats.accuracy,
        totalQuestions:
          userStats.totalQuestions,
        dailyStreak:
          userStats.dailyStreak,
        testsCompleted:
          userStats.testsCompleted,
      },
    };
  }
}
