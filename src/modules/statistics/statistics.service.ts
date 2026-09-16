import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

type StatisticsPeriod =
  | 'general'
  | 'semanal'
  | 'mensual'
  | 'anual';

type TopicStatLevel = 'TOPIC' | 'SUBTOPIC';

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
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentAnswers = await this.prisma.userAnswer.groupBy({
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
      recentAnswers.find((r) => r.isCorrect === true)?._count ?? 0;

    const recentWrong =
      recentAnswers.find((r) => r.isCorrect === false)?._count ?? 0;

    const testsCompleted = await this.prisma.testAttempt.count({
      where: {
        userId,
        status: 'COMPLETED',
      },
    });

    const studyTime = await this.getStudyTime(userId, undefined);

    const wrongCount = Math.max(
      0,
      user.totalQuestions - user.correctAnswers,
    );

    // Cobertura temario: media de % por tema (artículos hechos / total)
    const temario = await this.getTemarioProgress(userId);

    return {
      xp: user.xp,
      level: user.level,
      dailyStreak: user.dailyStreak,
      totalQuestions: user.totalQuestions,
      correctAnswers: user.correctAnswers,
      wrongCount,
      unansweredCount: 0,
      accuracy,
      /** % que debe mostrar el donut de Home */
      progressPercent: temario.progressPercent,
      temario,
      testsCompleted,
      lastStudyDate: user.lastStudyDate,

      studyTimeSeconds: studyTime.studyTimeSeconds,

      studyHours:
        Math.round((studyTime.studyTimeSeconds / 3600) * 10) / 10,

      last7Days: {
        correct: recentCorrect,
        wrong: recentWrong,
        total: recentCorrect + recentWrong,
        accuracy:
          recentCorrect + recentWrong > 0
            ? Math.round(
                (recentCorrect / (recentCorrect + recentWrong)) *
                  10000,
              ) / 100
            : 0,
      },
    };
  }

  // ============================================================
  // PROGRESO DEL TEMARIO (artículos → subtema → tema → media)
  // ============================================================
  /**
   * Artículo "hecho" = al menos 1 respuesta del usuario en ese articleId.
   * % subtema = artículos hechos / artículos con preguntas del subtema.
   * % tema = media de % de sus subtemas.
   * % global = media de % de todos los temas.
   */
  async getTemarioProgress(userId: string, oppositionId?: string) {
    const questionWhere: any = {
      status: 'PUBLISHED',
      articleId: { not: null },
    };

    if (oppositionId) {
      questionWhere.oppositionId = oppositionId;
    }

    const questions = await this.prisma.question.findMany({
      where: questionWhere,
      select: {
        id: true,
        articleId: true,
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
        article: {
          select: {
            id: true,
            number: true,
            name: true,
          },
        },
      },
    });

    const answered = await this.prisma.userAnswer.findMany({
      where: {
        userId,
        question: {
          articleId: { not: null },
          ...(oppositionId ? { oppositionId } : {}),
        },
      },
      select: {
        question: {
          select: {
            articleId: true,
          },
        },
      },
    });

    const doneArticles = new Set<string>();
    for (const row of answered) {
      const id = row.question?.articleId;
      if (id) doneArticles.add(id);
    }

    // subtopicId -> Set<articleId>
    const subtopicArticles = new Map<string, Set<string>>();
    // subtopicId -> meta
    const subtopicMeta = new Map<
      string,
      {
        id: string;
        name: string;
        code: string | null;
        parentId: string;
        parentName: string;
        parentCode: string | null;
      }
    >();

    for (const q of questions) {
      if (!q.articleId || !q.topic) continue;

      // Si tiene parent, el topic actual es subtema; si no, tratamos el propio tema como "subtema" virtual
      const isSub = !!q.topic.parent;
      const subId = q.topic.id;
      const parent = q.topic.parent ?? q.topic;

      if (!subtopicArticles.has(subId)) {
        subtopicArticles.set(subId, new Set());
        subtopicMeta.set(subId, {
          id: subId,
          name: q.topic.name,
          code: q.topic.code,
          parentId: parent.id,
          parentName: parent.name,
          parentCode: parent.code,
        });
      }
      subtopicArticles.get(subId)!.add(q.articleId);
    }

    type SubProgress = {
      subtopicId: string;
      name: string;
      code: string | null;
      parentTopicId: string;
      parentTopicName: string;
      totalArticles: number;
      doneArticles: number;
      percent: number;
    };

    const subtopics: SubProgress[] = [];

    for (const [subId, articleSet] of subtopicArticles.entries()) {
      const meta = subtopicMeta.get(subId)!;
      const totalArticles = articleSet.size;
      let done = 0;
      for (const articleId of articleSet) {
        if (doneArticles.has(articleId)) done += 1;
      }
      const percent =
        totalArticles > 0
          ? Math.round((done / totalArticles) * 10000) / 100
          : 0;

      subtopics.push({
        subtopicId: subId,
        name: meta.name,
        code: meta.code,
        parentTopicId: meta.parentId,
        parentTopicName: meta.parentName,
        totalArticles,
        doneArticles: done,
        percent,
      });
    }

    // Agrupar por tema padre
    const byParent = new Map<string, SubProgress[]>();
    for (const s of subtopics) {
      const list = byParent.get(s.parentTopicId) ?? [];
      list.push(s);
      byParent.set(s.parentTopicId, list);
    }

    const topics = Array.from(byParent.entries()).map(
      ([topicId, subs]) => {
        const avg =
          subs.length > 0
            ? Math.round(
                (subs.reduce((a, b) => a + b.percent, 0) /
                  subs.length) *
                  100,
              ) / 100
            : 0;

        return {
          topicId,
          name: subs[0]?.parentTopicName ?? '',
          percent: avg,
          subtopics: subs,
        };
      },
    );

    const progressPercent =
      topics.length > 0
        ? Math.round(
            (topics.reduce((a, b) => a + b.percent, 0) /
              topics.length) *
              100,
          ) / 100
        : 0;

    return {
      progressPercent,
      topics,
      subtopics,
      articlesDone: doneArticles.size,
    };
  }

  // ============================================================
  // ESTADÍSTICAS POR PERIODO
  // ============================================================

  async getPeriodStats(userId: string, period: StatisticsPeriod) {
    const now = new Date();

    let startDate: Date;

    switch (period) {
      case 'semanal':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        break;

      case 'mensual':
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 1);
        break;

      case 'anual':
        startDate = new Date(now);
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;

      case 'general':
      default:
        startDate = new Date(0);
        break;
    }

    const answers = await this.prisma.userAnswer.findMany({
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

    const tests = await this.prisma.testAttempt.findMany({
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

    const correct = answers.filter((a) => a.isCorrect === true).length;
    const wrong = answers.filter((a) => a.isCorrect === false).length;
    const total = answers.length;

    const accuracy =
      total > 0 ? Math.round((correct / total) * 10000) / 100 : 0;

    const studyTimeSeconds = tests.reduce(
      (sum, test) => sum + (test.timeSpentSec ?? 0),
      0,
    );

    return {
      period,
      correct,
      wrong,
      total,
      accuracy,
      testsCompleted: tests.length,
      studyTimeSeconds,
      studyHours: Math.round((studyTimeSeconds / 3600) * 10) / 10,
      evolution: this.buildEvolution(answers, period),
    };
  }

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
      const date = this.getEvolutionDate(answer.answeredAt, period);

      const current = buckets.get(date) ?? {
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

    return Array.from(buckets.values()).map((bucket) => ({
      date: bucket.date,
      correct: bucket.correct,
      wrong: bucket.wrong,
      total: bucket.total,
      accuracy:
        bucket.total > 0
          ? Math.round((bucket.correct / bucket.total) * 10000) / 100
          : 0,
    }));
  }

  private getEvolutionDate(
    date: Date,
    period: StatisticsPeriod,
  ): string {
    const d = new Date(date);

    if (period === 'anual') {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private async getStudyTime(userId: string, startDate?: Date) {
    const tests = await this.prisma.testAttempt.findMany({
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

    const studyTimeSeconds = tests.reduce(
      (sum, test) => sum + (test.timeSpentSec ?? 0),
      0,
    );

    return {
      studyTimeSeconds,
    };
  }

  // ============================================================
  // ESTADÍSTICAS POR TEMA Y SUBTEMA (aciertos — sin cambiar)
  // ============================================================

  async getTopicStats(userId: string, oppositionId?: string) {
    const answers = await this.prisma.userAnswer.findMany({
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

    const bySubtopic = new Map<string, TopicAccumulator>();
    const byTopic = new Map<string, TopicAccumulator>();

    for (const answer of answers) {
      const topic = answer.question.topic;
      if (!topic) continue;

      const parentTopic = topic.parent ?? topic;

      const parentAccumulator = byTopic.get(parentTopic.id) ?? {
        topicId: parentTopic.id,
        name: parentTopic.name,
        code: parentTopic.code,
        parentTopicId: null,
        parentTopicName: null,
        parentTopicCode: null,
        level: 'TOPIC' as const,
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
      byTopic.set(parentTopic.id, parentAccumulator);

      if (topic.parent) {
        const subtopicAccumulator = bySubtopic.get(topic.id) ?? {
          topicId: topic.id,
          name: topic.name,
          code: topic.code,
          parentTopicId: topic.parent.id,
          parentTopicName: topic.parent.name,
          parentTopicCode: topic.parent.code,
          level: 'SUBTOPIC' as const,
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
        bySubtopic.set(topic.id, subtopicAccumulator);
      }
    }

    const calculateAccuracy = (topic: TopicAccumulator) => ({
      ...topic,
      accuracy:
        topic.total > 0
          ? Math.round((topic.correct / topic.total) * 10000) / 100
          : 0,
    });

    return [
      ...Array.from(byTopic.values()).map(calculateAccuracy),
      ...Array.from(bySubtopic.values()).map(calculateAccuracy),
    ];
  }

  async getStudyRecommendations(
    userId: string,
    oppositionId?: string,
  ) {
    const [userStats, topicStats] = await Promise.all([
      this.getUserStats(userId),
      this.getTopicStats(userId, oppositionId),
    ]);

    if (!userStats) {
      return null;
    }

    const mainTopics = topicStats.filter(
      (topic) => topic.level === 'TOPIC',
    );

    const weakTopics = mainTopics
      .filter((topic) => topic.total >= 3 && topic.accuracy < 70)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5);

    const mediumTopics = mainTopics
      .filter(
        (topic) =>
          topic.total >= 3 &&
          topic.accuracy >= 70 &&
          topic.accuracy < 85,
      )
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5);

    const strongTopics = mainTopics
      .filter((topic) => topic.total >= 3 && topic.accuracy >= 85)
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 5);

    let priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (weakTopics.length > 0) priority = 'HIGH';
    else if (mediumTopics.length > 0) priority = 'MEDIUM';

    const mainTopic = weakTopics[0] ?? mediumTopics[0] ?? null;

    let recommendedMinutes = 30;
    if (weakTopics.length >= 3) recommendedMinutes = 45;
    else if (weakTopics.length === 1) recommendedMinutes = 30;
    else if (mediumTopics.length > 0) recommendedMinutes = 25;
    else if (strongTopics.length > 0) recommendedMinutes = 20;

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

    let sessionRecommendation = `Estudia durante ${recommendedMinutes} minutos.`;
    if (recommendedMinutes >= 45) {
      sessionRecommendation =
        'Haz una sesión de 45 minutos: 35 minutos de estudio y 10 minutos de repaso de errores.';
    } else if (recommendedMinutes === 30) {
      sessionRecommendation =
        'Haz una sesión de 30 minutos: 25 minutos de estudio y 5 minutos de repaso.';
    } else {
      sessionRecommendation = `Haz una sesión concentrada de ${recommendedMinutes} minutos y después descansa.`;
    }

    return {
      priority,
      message,
      recommendedMinutes,
      sessionRecommendation,
      focusTopic: mainTopic
        ? {
            id: mainTopic.topicId,
            name: mainTopic.name,
            code: mainTopic.code,
            accuracy: mainTopic.accuracy,
            totalQuestions: mainTopic.total,
            correct: mainTopic.correct,
            wrong: mainTopic.wrong,
          }
        : null,
      weakTopics: weakTopics.map((topic) => ({
        id: topic.topicId,
        name: topic.name,
        code: topic.code,
        accuracy: topic.accuracy,
        totalQuestions: topic.total,
        correct: topic.correct,
        wrong: topic.wrong,
      })),
      mediumTopics: mediumTopics.map((topic) => ({
        id: topic.topicId,
        name: topic.name,
        code: topic.code,
        accuracy: topic.accuracy,
        totalQuestions: topic.total,
        correct: topic.correct,
        wrong: topic.wrong,
      })),
      strongTopics: strongTopics.map((topic) => ({
        id: topic.topicId,
        name: topic.name,
        code: topic.code,
        accuracy: topic.accuracy,
        totalQuestions: topic.total,
        correct: topic.correct,
        wrong: topic.wrong,
      })),
      globalStats: {
        level: userStats.level,
        xp: userStats.xp,
        accuracy: userStats.accuracy,
        totalQuestions: userStats.totalQuestions,
        dailyStreak: userStats.dailyStreak,
        testsCompleted: userStats.testsCompleted,
        progressPercent: userStats.progressPercent,
      },
    };
  }
}