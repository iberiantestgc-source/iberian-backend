import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { QuestionsService } from '../questions/questions.service';
import { AchievementsService } from '../achievements/achievements.service';
import { RankingService } from '../ranking/ranking.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

import {
  GenerateTestDto,
  TestTypeDto,
  TestSelectionDto,
} from './dto/generate-test.dto';

import {
  TestType,
  TestStatus,
  Difficulty,
  Prisma,
} from '@prisma/client';

@Injectable()
export class TestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly questionsService: QuestionsService,
    private readonly achievementsService: AchievementsService,
    private readonly rankingService: RankingService,
    private readonly notificationsService: NotificationsService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  // ============================================================
  // DISTRIBUCIÓN DEL EXAMEN REAL GUARDIA CIVIL 2026
  // ============================================================
  //
  // 100 preguntas puntuables.
  //
  // Las 5 preguntas de reserva NO forman parte de esta
  // distribución.
  //
  // TEMA 01 = 12
  // TEMA 02 = 1
  // TEMA 03 = 3
  // TEMA 04 = 7
  // TEMA 05 = 4
  // TEMA 06 = 5
  // TEMA 07 = 4
  // TEMA 08 = 5
  // TEMA 09 = 9
  // TEMA 10 = 4
  // TEMA 11 = 2
  // TEMA 12 = 3
  // TEMA 13 = 4
  // TEMA 14 = 4
  // TEMA 15 = 9
  // TEMA 16 = 3
  // TEMA 17 = 4
  // TEMA 18 = 2
  // TEMA 19 = 3
  // TEMA 20 = 1
  // TEMA 21 = 2
  // TEMA 22 = 4
  // TEMA 23 = 5
  //
  // TOTAL = 100
  // ============================================================

  private readonly REAL_EXAM_DISTRIBUTION: number[] = [
    12,
    1,
    3,
    7,
    4,
    5,
    4,
    5,
    9,
    4,
    2,
    3,
    4,
    4,
    9,
    3,
    4,
    2,
    3,
    1,
    2,
    4,
    5,
  ];

  // ============================================================
  // GENERAR TEST
  // ============================================================

  async generateTest(
    userId: string,
    dto: GenerateTestDto,
  ) {
    const {
      oppositionId,
      count,
      type = TestTypeDto.PRACTICE,
      selection = TestSelectionDto.GLOBAL,
      topicId,
      topicIds = [],
      lawId,
      articleId,
      articleIds = [],
      difficulty,
      timeLimitSec,
      excludeIds = [],
    } = dto;

    // ============================================================
    // 0. VALIDACIONES
    // ============================================================

    if (!userId) {
      throw new BadRequestException(
        'Usuario no identificado',
      );
    }

    if (!oppositionId) {
      throw new BadRequestException(
        'Debes indicar una oposición',
      );
    }

    if (!count || count < 1) {
      throw new BadRequestException(
        'El número de preguntas debe ser mayor que 0',
      );
    }

    if (count > 100) {
      throw new BadRequestException(
        'Un test no puede tener más de 100 preguntas',
      );
    }

    if (
      timeLimitSec !== undefined &&
      timeLimitSec !== null &&
      timeLimitSec <= 0
    ) {
      throw new BadRequestException(
        'El tiempo límite debe ser mayor que 0 segundos',
      );
    }

    // ============================================================
    // 0.1. CONFIGURACIÓN DEL TIEMPO
    // ============================================================

    // El examen REAL siempre es de 100 preguntas y 144 minutos.
    if (type === TestTypeDto.REAL) {
      if (count !== 100) {
        throw new BadRequestException(
          'El examen real debe tener exactamente 100 preguntas',
        );
      }

      if (
        timeLimitSec !== undefined &&
        timeLimitSec !== null &&
        timeLimitSec !== 8640
      ) {
        throw new BadRequestException(
          'El examen real debe tener exactamente 144 minutos',
        );
      }
    }

    // 86,4 segundos por pregunta.
    // Ejemplos:
    // 10 preguntas  = 864 segundos  = 14:24
    // 25 preguntas  = 2160 segundos = 36:00
    // 50 preguntas  = 4320 segundos = 72:00
    // 100 preguntas = 8640 segundos = 144:00
    const resolvedTimeLimitSec =
      type === TestTypeDto.REAL
        ? 8640
        : timeLimitSec ?? Math.round(count * 86.4);

    // ============================================================
    // 1. COMPROBAR SUSCRIPCIÓN
    // ============================================================

    if (type === TestTypeDto.SIMULACRO) {
      await this.subscriptionsService.canGenerateSimulacro(
        userId,
      );
    }

    await this.subscriptionsService.canAnswerQuestions(
      userId,
      count,
    );

    // ============================================================
    // 2. COMPROBAR OPOSICIÓN
    // ============================================================

    const opposition =
      await this.prisma.opposition.findUnique({
        where: {
          id: oppositionId,
        },
      });

    if (!opposition) {
      throw new NotFoundException(
        'Oposición no encontrada',
      );
    }

    if (!opposition.isActive) {
      throw new BadRequestException(
        'La oposición seleccionada no está activa',
      );
    }

    // ============================================================
    // 3. NORMALIZAR SELECCIONES
    // ============================================================

    const selectedTopicIds = Array.from(
      new Set(
        [
          ...(topicId ? [topicId] : []),
          ...(topicIds ?? []),
        ].filter(Boolean),
      ),
    );

    const selectedArticleIds = Array.from(
      new Set(
        [
          ...(articleId ? [articleId] : []),
          ...(articleIds ?? []),
        ].filter(Boolean),
      ),
    );

    // ============================================================
    // 4. VALIDAR MODO DE SELECCIÓN
    // ============================================================

    if (
      selection === TestSelectionDto.TOPIC ||
      selection === TestSelectionDto.SUBTOPIC
    ) {
      if (selectedTopicIds.length === 0) {
        throw new BadRequestException(
          'Debes seleccionar al menos un tema o subtema',
        );
      }
    }

    if (
      selection === TestSelectionDto.ARTICLE
    ) {
      if (selectedArticleIds.length === 0) {
        throw new BadRequestException(
          'Debes seleccionar al menos un artículo',
        );
      }
    }

    // ============================================================
    // 5. OBTENER PREGUNTAS
    // ============================================================

    let questions: any[] = [];

    switch (type) {
      case TestTypeDto.FAILED_ONLY:
        questions =
          await this.getFailedQuestions(
            userId,
            {
              oppositionId,
              count,
              topicIds: selectedTopicIds,
              lawId,
              articleIds: selectedArticleIds,
              difficulty,
              excludeIds,
            },
          );
        break;

      case TestTypeDto.FAVORITES:
        questions =
          await this.getFavoriteQuestions(
            userId,
            {
              oppositionId,
              count,
              topicIds: selectedTopicIds,
              lawId,
              articleIds: selectedArticleIds,
              excludeIds,
            },
          );
        break;

      case TestTypeDto.REAL:
        questions =
          await this.getRealExamQuestions({
            oppositionId,
            count: 100,
            difficulty,
            excludeIds,
          });
        break;

      case TestTypeDto.GLOBAL:
      case TestTypeDto.SIMULACRO:
      case TestTypeDto.PRACTICE:
      case TestTypeDto.CUSTOM:
      case TestTypeDto.DAILY:
      default:
        questions =
          await this.getQuestionsForSelection({
            oppositionId,
            count,
            topicIds: selectedTopicIds,
            lawId,
            articleIds: selectedArticleIds,
            difficulty,
            excludeIds,
          });
        break;
    }

    // ============================================================
    // 6. COMPROBAR RESULTADO
    // ============================================================

    if (!questions || questions.length === 0) {
      throw new BadRequestException(
        'No se encontraron preguntas con los filtros indicados',
      );
    }

    // Un test solicitado con N preguntas debe contener
    // exactamente N preguntas.
    //
    // No permitimos crear silenciosamente un test incompleto.
    if (questions.length < count) {
      throw new BadRequestException(
        `No hay suficientes preguntas disponibles para generar el test solicitado. Se necesitan ${count} preguntas y solo hay ${questions.length} disponibles.`,
      );
    }

    // ============================================================
    // 7. EVITAR DUPLICADOS
    // ============================================================

    const uniqueQuestions = Array.from(
      new Map(
        questions.map((question) => [
          question.id,
          question,
        ]),
      ).values(),
    );

    if (uniqueQuestions.length < count) {
      throw new BadRequestException(
        `No hay suficientes preguntas únicas para generar el test solicitado. Se necesitan ${count} preguntas y solo hay ${uniqueQuestions.length} preguntas únicas disponibles.`,
      );
    }

    // Por seguridad, limitamos al número solicitado.
    const finalQuestions =
      uniqueQuestions.slice(0, count);

    // ============================================================
    // 8. MEZCLAR PREGUNTAS
    // ============================================================

    this.shuffleArray(finalQuestions);

    // ============================================================
    // 9. CREAR TEST
    // ============================================================

    const test =
      await this.prisma.test.create({
        data: {
          name: this.generateTestName(
            type,
            selectedTopicIds,
            selectedArticleIds,
          ),

          type: type as TestType,

          totalQuestions:
            finalQuestions.length,

          timeLimitSec:
            resolvedTimeLimitSec,

          filters: {
            oppositionId,

            selection,

            topicId:
              topicId ?? null,

            topicIds:
              selectedTopicIds,

            lawId:
              lawId ?? null,

            articleId:
              articleId ?? null,

            articleIds:
              selectedArticleIds,

            difficulty:
              difficulty ?? null,

            type,
          },

          testQuestions: {
            create: finalQuestions.map(
              (question, index) => ({
                questionId: question.id,
                order: index + 1,
              }),
            ),
          },
        },

        include: {
          testQuestions: {
            orderBy: {
              order: 'asc',
            },

            include: {
              question: {
                include: {
                  answers: {
                    orderBy: {
                      order: 'asc',
                    },
                  },

                  topic: {
                    select: {
                      id: true,
                      name: true,
                      code: true,
                    },
                  },

                  article: {
                    select: {
                      id: true,
                      number: true,
                      name: true,
                    },
                  },

                  law: {
                    select: {
                      id: true,
                      shortName: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

    // ============================================================
    // 10. CREAR INTENTO
    // ============================================================

    const attempt =
      await this.prisma.testAttempt.create({
        data: {
          userId,
          testId: test.id,
          status: TestStatus.IN_PROGRESS,
        },
      });

    // ============================================================
    // 11. DEVOLVER TEST
    // ============================================================

    return {
      attemptId:
        attempt.id,

      testId:
        test.id,

      type:
        test.type,

      totalQuestions:
        test.totalQuestions,

      timeLimitSec:
        test.timeLimitSec,

      questions:
        test.testQuestions.map(
          (testQuestion) => {
            const question =
              testQuestion.question;

            return {
              order:
                testQuestion.order,

              id:
                question.id,

              statement:
                question.statement,

              difficulty:
                question.difficulty,

              answers:
                question.answers.map(
                  (answer) => ({
                    id:
                      answer.id,

                    text:
                      answer.text,

                    order:
                      answer.order,
                  }),
                ),

              topic:
                question.topic,

              article:
                question.article,

              law:
                question.law,
            };
          },
        ),
    };
  }

  // ============================================================
  // OBTENER PREGUNTAS SEGÚN SELECCIÓN
  // ============================================================

  private async getQuestionsForSelection(
    params: {
      oppositionId: string;
      count: number;
      topicIds?: string[];
      lawId?: string;
      articleIds?: string[];
      difficulty?: Difficulty;
      excludeIds?: string[];
    },
  ) {
    const topicIds =
      await this.expandTopicIds(
        params.oppositionId,
        params.topicIds ?? [],
      );

    const where: Prisma.QuestionWhereInput = {
      oppositionId:
        params.oppositionId,

      status:
        'PUBLISHED',

      ...(params.lawId
        ? {
            lawId:
              params.lawId,
          }
        : {}),

      ...(params.difficulty
        ? {
            difficulty:
              params.difficulty,
          }
        : {}),

      ...(params.excludeIds &&
      params.excludeIds.length > 0
        ? {
            id: {
              notIn:
                params.excludeIds,
            },
          }
        : {}),

      ...(topicIds.length > 0 ||
      (params.articleIds &&
        params.articleIds.length > 0)
        ? {
            OR: [
              ...(topicIds.length > 0
                ? [
                    {
                      topicId: {
                        in: topicIds,
                      },
                    },
                  ]
                : []),

              ...(params.articleIds &&
              params.articleIds.length > 0
                ? [
                    {
                      articleId: {
                        in:
                          params.articleIds,
                      },
                    },
                  ]
                : []),
            ],
          }
        : {}),
    };

    const candidates =
      await this.prisma.question.findMany({
        where,

        select: {
          id: true,
        },
      });

    if (candidates.length === 0) {
      return [];
    }

    const ids =
      candidates.map(
        (question) =>
          question.id,
      );

    this.shuffleArray(ids);

    const selectedIds =
      ids.slice(
        0,
        params.count,
      );

    if (
      selectedIds.length <
      params.count
    ) {
      return [];
    }

    return this.getQuestionsByIds(
      selectedIds,
    );
  }

  // ============================================================
  // OBTENER TEST REAL
  // ============================================================

  private async getRealExamQuestions(
    params: {
      oppositionId: string;
      count: number;
      difficulty?: Difficulty;
      excludeIds?: string[];
    },
  ) {
    // ==========================================================
    // VALIDACIÓN DEL EXAMEN REAL
    // ==========================================================

    if (params.count !== 100) {
      throw new BadRequestException(
        'El examen real debe tener exactamente 100 preguntas',
      );
    }

    const distributionTotal =
      this.REAL_EXAM_DISTRIBUTION.reduce(
        (sum, value) =>
          sum + value,
        0,
      );

    if (distributionTotal !== 100) {
      throw new BadRequestException(
        'La distribución del examen real debe sumar exactamente 100 preguntas',
      );
    }

    // ==========================================================
    // OBTENER TEMAS PRINCIPALES
    // ==========================================================

    const topics =
      await this.prisma.topic.findMany({
        where: {
          oppositionId:
            params.oppositionId,

          isActive:
            true,

          parentId:
            null,
        },

        select: {
          id: true,
          name: true,
          code: true,
          order: true,
        },

        orderBy: {
          order: 'asc',
        },
      });

    if (
      topics.length <
      this.REAL_EXAM_DISTRIBUTION.length
    ) {
      throw new BadRequestException(
        `La oposición debe tener al menos ${this.REAL_EXAM_DISTRIBUTION.length} temas principales configurados para generar el examen real`,
      );
    }

    // Solo utilizamos los primeros 23 temas principales,
    // que son los que corresponden a la distribución oficial.
    const examTopics =
      topics.slice(
        0,
        this.REAL_EXAM_DISTRIBUTION.length,
      );

    // ==========================================================
    // MAPA DE TEMAS
    // ==========================================================

    const topicById =
      new Map(
        examTopics.map(
          (topic) => [
            topic.id,
            topic,
          ],
        ),
      );

    // ==========================================================
    // OBTENER TODA LA JERARQUÍA DE TEMAS
    // ==========================================================

    const allTopics =
      await this.prisma.topic.findMany({
        where: {
          oppositionId:
            params.oppositionId,

          isActive:
            true,
        },

        select: {
          id: true,
          parentId: true,
        },
      });

    const parentMap =
      new Map<string, string | null>();

    for (
      const topic of allTopics
    ) {
      parentMap.set(
        topic.id,
        topic.parentId,
      );
    }

    // ==========================================================
    // ENCONTRAR TEMA PRINCIPAL
    // ==========================================================

    const getRootTopicId = (
      topicId: string | null,
    ): string | null => {
      if (!topicId) {
        return null;
      }

      let currentId:
        string | null = topicId;

      const visited =
        new Set<string>();

      while (
        currentId &&
        !visited.has(currentId)
      ) {
        visited.add(currentId);

        const parentId =
          parentMap.get(
            currentId,
          );

        if (!parentId) {
          return currentId;
        }

        currentId =
          parentId;
      }

      return null;
    };

    // ==========================================================
    // CUOTAS
    // ==========================================================
    //
    // Para 100 preguntas las cuotas son exactamente las
    // indicadas en REAL_EXAM_DISTRIBUTION.
    //
    // Se mantiene el algoritmo proporcional por seguridad
    // aunque el examen real actualmente sea siempre de 100.
    // ==========================================================

    const targetCount =
      Math.min(
        params.count,
        100,
      );

    const exactQuotas =
      this.REAL_EXAM_DISTRIBUTION.map(
        (value) =>
          (value / 100) *
          targetCount,
      );

    const quotas =
      exactQuotas.map(
        (value) =>
          Math.floor(value),
      );

    let remaining =
      targetCount -
      quotas.reduce(
        (sum, value) =>
          sum + value,
        0,
      );

    const remainders =
      exactQuotas
        .map(
          (
            value,
            index,
          ) => ({
            index,
            remainder:
              value -
              Math.floor(value),
          }),
        )
        .sort(
          (a, b) =>
            b.remainder -
            a.remainder,
        );

    for (
      let i = 0;
      i <
        remainders.length &&
      remaining > 0;
      i++
    ) {
      quotas[
        remainders[i].index
      ]++;

      remaining--;
    }

    // ==========================================================
    // OBTENER PREGUNTAS DISPONIBLES
    // ==========================================================

    const questionWhere:
      Prisma.QuestionWhereInput = {
      oppositionId:
        params.oppositionId,

      status:
        'PUBLISHED',

      ...(params.difficulty
        ? {
            difficulty:
              params.difficulty,
          }
        : {}),

      ...(params.excludeIds &&
      params.excludeIds.length > 0
        ? {
            id: {
              notIn:
                params.excludeIds,
            },
          }
        : {}),
    };

    const candidates =
      await this.prisma.question.findMany({
        where:
          questionWhere,

        select: {
          id: true,
          topicId: true,
        },
      });

    if (candidates.length === 0) {
      return [];
    }

    // ==========================================================
    // AGRUPAR PREGUNTAS POR TEMA PRINCIPAL
    // ==========================================================

    const questionsByTopic =
      new Map<string, string[]>();

    for (
      const question of candidates
    ) {
      const rootTopicId =
        getRootTopicId(
          question.topicId,
        );

      if (!rootTopicId) {
        continue;
      }

      if (
        !topicById.has(
          rootTopicId,
        )
      ) {
        continue;
      }

      if (
        !questionsByTopic.has(
          rootTopicId,
        )
      ) {
        questionsByTopic.set(
          rootTopicId,
          [],
        );
      }

      questionsByTopic
        .get(rootTopicId)!
        .push(question.id);
    }

    // ==========================================================
    // VALIDAR DISPONIBILIDAD POR TEMA
    // ==========================================================
    //
    // IMPORTANTE:
    // No rellenamos un déficit de un tema con preguntas de
    // otro tema, porque entonces el examen dejaría de respetar
    // la distribución oficial.
    // ==========================================================

    const insufficientTopics: string[] = [];

    for (
      let index = 0;
      index <
        this.REAL_EXAM_DISTRIBUTION.length;
      index++
    ) {
      const quota =
        quotas[index];

      if (quota <= 0) {
        continue;
      }

      const topic =
        examTopics[index];

      if (!topic) {
        insufficientTopics.push(
          `Tema ${index + 1}`,
        );
        continue;
      }

      const available =
        questionsByTopic.get(
          topic.id,
        )?.length ?? 0;

      if (
        available <
        quota
      ) {
        insufficientTopics.push(
          `${topic.code || `Tema ${index + 1}`} (${available}/${quota})`,
        );
      }
    }

    if (
      insufficientTopics.length > 0
    ) {
      throw new BadRequestException(
        `No hay suficientes preguntas para respetar la distribución del examen real. Temas insuficientes: ${insufficientTopics.join(', ')}`,
      );
    }

    // ==========================================================
    // SELECCIONAR EXACTAMENTE LA CUOTA DE CADA TEMA
    // ==========================================================

    const selectedIds:
      string[] = [];

    const selectedSet =
      new Set<string>();

    for (
      let index = 0;
      index <
        this.REAL_EXAM_DISTRIBUTION.length;
      index++
    ) {
      const quota =
        quotas[index];

      if (quota <= 0) {
        continue;
      }

      const topic =
        examTopics[index];

      if (!topic) {
        throw new BadRequestException(
          `No se ha encontrado el tema principal correspondiente al tema ${index + 1}`,
        );
      }

      const topicQuestionIds =
        questionsByTopic.get(
          topic.id,
        ) ?? [];

      this.shuffleArray(
        topicQuestionIds,
      );

      const selectedForTopic =
        topicQuestionIds.slice(
          0,
          quota,
        );

      if (
        selectedForTopic.length !==
        quota
      ) {
        throw new BadRequestException(
          `No hay suficientes preguntas disponibles para el ${topic.code || `Tema ${index + 1}`}`,
        );
      }

      for (
        const questionId of
          selectedForTopic
      ) {
        if (
          selectedSet.has(
            questionId,
          )
        ) {
          continue;
        }

        selectedSet.add(
          questionId,
        );

        selectedIds.push(
          questionId,
        );
      }
    }

    // ==========================================================
    // VALIDACIÓN FINAL DE DISTRIBUCIÓN
    // ==========================================================

    if (
      selectedIds.length !==
      targetCount
    ) {
      throw new BadRequestException(
        `No se ha podido generar el examen real con exactamente ${targetCount} preguntas. Se han seleccionado ${selectedIds.length}.`,
      );
    }

    // ==========================================================
    // MEZCLAR ORDEN FINAL
    // ==========================================================

    this.shuffleArray(
      selectedIds,
    );

    return this.getQuestionsByIds(
      selectedIds,
    );
  }

  // ============================================================
  // EXPANDIR TEMAS
  // ============================================================

  private async expandTopicIds(
    oppositionId: string,
    selectedTopicIds: string[],
  ): Promise<string[]> {
    if (
      !selectedTopicIds ||
      selectedTopicIds.length === 0
    ) {
      return [];
    }

    const topics =
      await this.prisma.topic.findMany({
        where: {
          oppositionId,
          isActive: true,
        },

        select: {
          id: true,
          parentId: true,
        },
      });

    const topicMap =
      new Map(
        topics.map(
          (topic) => [
            topic.id,
            topic,
          ],
        ),
      );

    const result =
      new Set<string>();

    for (
      const topicId of selectedTopicIds
    ) {
      const topic =
        topicMap.get(
          topicId,
        );

      if (!topic) {
        throw new BadRequestException(
          `El tema ${topicId} no pertenece a la oposición seleccionada`,
        );
      }

      result.add(
        topicId,
      );
    }

    // Si se selecciona un tema principal, se incluyen todos
    // sus subtemas y descendientes.
    let changed = true;

    while (changed) {
      changed = false;

      for (
        const topic of topics
      ) {
        if (
          topic.parentId &&
          result.has(
            topic.parentId,
          ) &&
          !result.has(
            topic.id,
          )
        ) {
          result.add(
            topic.id,
          );

          changed = true;
        }
      }
    }

    return Array.from(
      result,
    );
  }

  // ============================================================
  // RESPONDER UNA PREGUNTA
  // ============================================================

  async submitAnswer(
    userId: string,
    attemptId: string,
    questionId: string,
    selectedAnswerId: string,
    timeSpentMs?: number,
  ) {
    if (!selectedAnswerId) {
      throw new BadRequestException(
        'Debes seleccionar una respuesta',
      );
    }

    if (
      timeSpentMs !== undefined &&
      timeSpentMs < 0
    ) {
      throw new BadRequestException(
        'El tiempo empleado no puede ser negativo',
      );
    }

    const attempt =
      await this.prisma.testAttempt.findUnique({
        where: {
          id: attemptId,
        },
      });

    if (
      !attempt ||
      attempt.userId !== userId
    ) {
      throw new NotFoundException(
        'Intento de test no encontrado',
      );
    }

    if (
      attempt.status !==
      TestStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        'Este test ya ha finalizado',
      );
    }

    const testQuestion =
      await this.prisma.testQuestion.findFirst({
        where: {
          testId: attempt.testId,
          questionId,
        },
      });

    if (!testQuestion) {
      throw new BadRequestException(
        'La pregunta no pertenece a este test',
      );
    }

    const previousAnswer =
      await this.prisma.userAnswer.findFirst({
        where: {
          userId,
          testAttemptId: attemptId,
          questionId,
        },
      });

    if (previousAnswer) {
      throw new BadRequestException(
        'Esta pregunta ya ha sido respondida',
      );
    }

    const answer =
      await this.prisma.answer.findUnique({
        where: {
          id: selectedAnswerId,
        },

        include: {
          question: true,
        },
      });

    if (
      !answer ||
      answer.questionId !== questionId
    ) {
      throw new BadRequestException(
        'Respuesta no válida',
      );
    }

    const isCorrect =
      answer.isCorrect;

    await this.prisma.userAnswer.create({
      data: {
        userId,
        questionId,
        testAttemptId: attemptId,
        selectedAnswerId,
        isCorrect,
        timeSpentMs,
      },
    });

    await this.prisma.testAttempt.update({
      where: {
        id: attemptId,
      },

      data: {
        ...(isCorrect
          ? {
              correctCount: {
                increment: 1,
              },
            }
          : {
              wrongCount: {
                increment: 1,
              },
            }),
      },
    });

    await this.prisma.question.update({
      where: {
        id: questionId,
      },

      data: {
        timesAnswered: {
          increment: 1,
        },

        ...(isCorrect
          ? {
              timesCorrect: {
                increment: 1,
              },
            }
          : {}),
      },
    });

    const correctAnswer =
      await this.prisma.answer.findFirst({
        where: {
          questionId,
          isCorrect: true,
        },

        select: {
          id: true,
        },
      });

    return {
      isCorrect,

      correctAnswerId:
        correctAnswer?.id ?? null,

      explanation:
        answer.question.explanation ??
        null,
    };
  }

  // ============================================================
  // DEJAR UNA PREGUNTA EN BLANCO
  // ============================================================

  async submitBlankAnswer(
    userId: string,
    attemptId: string,
    questionId: string,
    timeSpentMs?: number,
  ) {
    if (
      timeSpentMs !== undefined &&
      timeSpentMs < 0
    ) {
      throw new BadRequestException(
        'El tiempo empleado no puede ser negativo',
      );
    }

    const attempt =
      await this.prisma.testAttempt.findUnique({
        where: {
          id: attemptId,
        },
      });

    if (
      !attempt ||
      attempt.userId !== userId
    ) {
      throw new NotFoundException(
        'Intento de test no encontrado',
      );
    }

    if (
      attempt.status !==
      TestStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        'Este test ya ha finalizado',
      );
    }

    const testQuestion =
      await this.prisma.testQuestion.findFirst({
        where: {
          testId: attempt.testId,
          questionId,
        },
      });

    if (!testQuestion) {
      throw new BadRequestException(
        'La pregunta no pertenece a este test',
      );
    }

    const previousAnswer =
      await this.prisma.userAnswer.findFirst({
        where: {
          userId,
          testAttemptId: attemptId,
          questionId,
        },
      });

    if (previousAnswer) {
      throw new BadRequestException(
        'Esta pregunta ya ha sido respondida',
      );
    }

    await this.prisma.userAnswer.create({
      data: {
        userId,
        questionId,
        testAttemptId: attemptId,
        selectedAnswerId: null,
        isCorrect: false,
        timeSpentMs,
      },
    });

    return {
      unanswered: true,
      questionId,
    };
  }

  // ============================================================
  // FINALIZAR TEST
  // ============================================================

  async finishTest(
    userId: string,
    attemptId: string,
  ) {
    const attempt =
      await this.prisma.testAttempt.findUnique({
        where: {
          id: attemptId,
        },

        include: {
          test: true,
          userAnswers: true,
        },
      });

    if (
      !attempt ||
      attempt.userId !== userId
    ) {
      throw new NotFoundException(
        'Intento no encontrado',
      );
    }

    if (
      attempt.status !==
      TestStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        'Este test ya ha finalizado',
      );
    }

    const totalQuestions =
      attempt.test.totalQuestions;

    const correctCount =
      attempt.userAnswers.filter(
        (answer) =>
          answer.isCorrect === true &&
          answer.selectedAnswerId !== null,
      ).length;

    const answeredCount =
      attempt.userAnswers.filter(
        (answer) =>
          answer.selectedAnswerId !== null,
      ).length;

    const wrongCount =
      attempt.userAnswers.filter(
        (answer) =>
          answer.isCorrect === false &&
          answer.selectedAnswerId !== null,
      ).length;

    const unansweredCount =
      Math.max(
        totalQuestions -
          answeredCount,
        0,
      );

    // Puntuación:
    // Acierto = +1
    // Fallo   = -0,33
    // Blanco  = 0
    const score =
      correctCount -
      wrongCount * 0.33;

    const percentage =
      totalQuestions > 0
        ? (score / totalQuestions) *
          100
        : 0;

    const xpEarned =
      this.calculateXp(
        correctCount,
        attempt.test.type,
      );

    const finished =
      await this.prisma.testAttempt.update({
        where: {
          id: attemptId,
        },

        data: {
          status:
            TestStatus.COMPLETED,

          score: percentage,

          correctCount,

          wrongCount,

          unansweredCount,

          xpEarned,

          finishedAt:
            new Date(),

          timeSpentSec:
            Math.floor(
              (Date.now() -
                attempt.startedAt.getTime()) /
                1000,
            ),
        },
      });

    const streakResult =
      await this.updateStreakAndStats(
        userId,
        xpEarned,
        answeredCount,
        correctCount,
      );

    await this.updateUserLevel(
      userId,
    );

    await this.rankingService.updateUserScore(
      userId,
    );

    const newAchievements =
      await this.achievementsService.checkAndUnlock(
        userId,
      );

    for (
      const achievement of newAchievements
    ) {
      await this.notificationsService.notifyAchievement(
        userId,
        achievement.name,
        achievement.xpReward,
      );
    }

    const streak =
      streakResult.dailyStreak;

    if (
      [3, 7, 14, 30, 60, 100].includes(
        streak,
      )
    ) {
      await this.notificationsService.notifyStreak(
        userId,
        streak,
      );
    }

    return {
      attemptId:
        finished.id,

      score: Number(
        score.toFixed(2),
      ),

      percentage: Number(
        percentage.toFixed(2),
      ),

      correctCount,

      wrongCount,

      unansweredCount,

      totalQuestions,

      xpEarned,

      timeSpentSec:
        finished.timeSpentSec,

      dailyStreak:
        streak,

      newAchievements,
    };
  }

  // ============================================================
  // PREGUNTAS FALLADAS
  // ============================================================

  private async getFailedQuestions(
    userId: string,
    params: {
      oppositionId: string;
      count: number;
      topicIds?: string[];
      lawId?: string;
      articleIds?: string[];
      difficulty?: Difficulty;
      excludeIds?: string[];
    },
  ) {
    const topicIds =
      await this.expandTopicIds(
        params.oppositionId,
        params.topicIds ?? [],
      );

    const questionWhere:
      Prisma.QuestionWhereInput = {
      oppositionId:
        params.oppositionId,

      status:
        'PUBLISHED',

      ...(params.lawId
        ? {
            lawId:
              params.lawId,
          }
        : {}),

      ...(params.difficulty
        ? {
            difficulty:
              params.difficulty,
          }
        : {}),

      ...(params.excludeIds &&
      params.excludeIds.length > 0
        ? {
            id: {
              notIn:
                params.excludeIds,
            },
          }
        : {}),

      ...(topicIds.length > 0 ||
      (params.articleIds &&
        params.articleIds.length > 0)
        ? {
            OR: [
              ...(topicIds.length > 0
                ? [
                    {
                      topicId: {
                        in: topicIds,
                      },
                    },
                  ]
                : []),

              ...(params.articleIds &&
              params.articleIds.length > 0
                ? [
                    {
                      articleId: {
                        in:
                          params.articleIds,
                      },
                    },
                  ]
                : []),
            ],
          }
        : {}),
    };

    const failed =
      await this.prisma.userAnswer.findMany({
        where: {
          userId,

          isCorrect: false,

          selectedAnswerId: {
            not: null,
          },

          question:
            questionWhere,
        },

        select: {
          questionId: true,
        },

        distinct: [
          'questionId',
        ],
      });

    const ids =
      failed.map(
        (item) =>
          item.questionId,
      );

    if (ids.length === 0) {
      return [];
    }

    this.shuffleArray(ids);

    const selectedIds =
      ids.slice(
        0,
        params.count,
      );

    if (
      selectedIds.length <
      params.count
    ) {
      return [];
    }

    return this.getQuestionsByIds(
      selectedIds,
    );
  }

  // ============================================================
  // FAVORITAS
  // ============================================================

  private async getFavoriteQuestions(
    userId: string,
    params: {
      oppositionId: string;
      count: number;
      topicIds?: string[];
      lawId?: string;
      articleIds?: string[];
      excludeIds?: string[];
    },
  ) {
    const topicIds =
      await this.expandTopicIds(
        params.oppositionId,
        params.topicIds ?? [],
      );

    const questionWhere:
      Prisma.QuestionWhereInput = {
      oppositionId:
        params.oppositionId,

      status:
        'PUBLISHED',

      ...(params.lawId
        ? {
            lawId:
              params.lawId,
          }
        : {}),

      ...(params.excludeIds &&
      params.excludeIds.length > 0
        ? {
            id: {
              notIn:
                params.excludeIds,
            },
          }
        : {}),

      ...(topicIds.length > 0 ||
      (params.articleIds &&
        params.articleIds.length > 0)
        ? {
            OR: [
              ...(topicIds.length > 0
                ? [
                    {
                      topicId: {
                        in: topicIds,
                      },
                    },
                  ]
                : []),

              ...(params.articleIds &&
              params.articleIds.length > 0
                ? [
                    {
                      articleId: {
                        in:
                          params.articleIds,
                      },
                    },
                  ]
                : []),
            ],
          }
        : {}),
    };

    const favorites =
      await this.prisma.favorite.findMany({
        where: {
          userId,

          question:
            questionWhere,
        },

        select: {
          questionId: true,
        },

        distinct: [
          'questionId',
        ],
      });

    const ids =
      favorites.map(
        (item) =>
          item.questionId,
      );

    if (ids.length === 0) {
      return [];
    }

    this.shuffleArray(ids);

    const selectedIds =
      ids.slice(
        0,
        params.count,
      );

    if (
      selectedIds.length <
      params.count
    ) {
      return [];
    }

    return this.getQuestionsByIds(
      selectedIds,
    );
  }

  // ============================================================
  // OBTENER PREGUNTAS POR IDS
  // ============================================================

  private async getQuestionsByIds(
    ids: string[],
  ) {
    if (
      !ids ||
      ids.length === 0
    ) {
      return [];
    }

    const questions =
      await this.prisma.question.findMany({
        where: {
          id: {
            in: ids,
          },

          status:
            'PUBLISHED',
        },

        include: {
          answers: {
            orderBy: {
              order: 'asc',
            },
          },

          topic: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },

          article: {
            select: {
              id: true,
              number: true,
              name: true,
            },
          },

          law: {
            select: {
              id: true,
              shortName: true,
            },
          },
        },
      });

    const questionMap =
      new Map(
        questions.map(
          (question) => [
            question.id,
            question,
          ],
        ),
      );

    return ids
      .map(
        (id) =>
          questionMap.get(id),
      )
      .filter(Boolean);
  }

  // ============================================================
  // NOMBRE DEL TEST
  // ============================================================

  private generateTestName(
    type: string,
    topicIds: string[] = [],
    articleIds: string[] = [],
  ): string {
    const date =
      new Date().toLocaleDateString(
        'es-ES',
      );

    if (
      type === 'REAL'
    ) {
      return `Examen real - ${date}`;
    }

    if (
      type === 'SIMULACRO'
    ) {
      return `Simulacro - ${date}`;
    }

    if (
      type === 'FAILED_ONLY'
    ) {
      return `Repaso de falladas - ${date}`;
    }

    if (
      type === 'FAVORITES'
    ) {
      return `Favoritas - ${date}`;
    }

    if (
      type === 'DAILY'
    ) {
      return `Reto diario - ${date}`;
    }

    if (
      articleIds.length > 0 &&
      topicIds.length > 0
    ) {
      return `Test personalizado - ${date}`;
    }

    if (
      articleIds.length > 0
    ) {
      return `Test de artículos - ${date}`;
    }

    if (
      topicIds.length > 0
    ) {
      return `Test de temas - ${date}`;
    }

    return `Test de práctica - ${date}`;
  }

  // ============================================================
  // RACHA + ESTADÍSTICAS
  // ============================================================

  private async updateStreakAndStats(
    userId: string,
    xpEarned: number,
    totalAnswered: number,
    correctCount: number,
  ) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },

        select: {
          lastStudyDate: true,
          dailyStreak: true,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'Usuario no encontrado',
      );
    }

    const today =
      new Date();

    today.setHours(
      0,
      0,
      0,
      0,
    );

    let newStreak = 1;

    if (user.lastStudyDate) {
      const last =
        new Date(
          user.lastStudyDate,
        );

      last.setHours(
        0,
        0,
        0,
        0,
      );

      const diffDays =
        Math.floor(
          (today.getTime() -
            last.getTime()) /
            (1000 *
              60 *
              60 *
              24),
        );

      if (
        diffDays === 0
      ) {
        newStreak =
          user.dailyStreak;
      } else if (
        diffDays === 1
      ) {
        newStreak =
          user.dailyStreak + 1;
      } else {
        newStreak = 1;
      }
    }

    let streakBonus = 0;

    if (
      newStreak >= 30
    ) {
      streakBonus = 30;
    } else if (
      newStreak >= 7
    ) {
      streakBonus = 15;
    } else if (
      newStreak >= 3
    ) {
      streakBonus = 5;
    }

    const updated =
      await this.prisma.user.update({
        where: {
          id: userId,
        },

        data: {
          xp: {
            increment:
              xpEarned +
              streakBonus,
          },

          totalQuestions: {
            increment:
              totalAnswered,
          },

          correctAnswers: {
            increment:
              correctCount,
          },

          dailyStreak:
            newStreak,

          lastStudyDate:
            new Date(),
        },

        select: {
          dailyStreak: true,
        },
      });

    return {
      dailyStreak:
        updated.dailyStreak,

      streakBonus,
    };
  }

  // ============================================================
  // XP
  // ============================================================

  private calculateXp(
    correctCount: number,
    testType: TestType,
  ): number {
    let base =
      correctCount * 5;

    if (
      testType ===
      TestType.SIMULACRO
    ) {
      base += 50;
    }

    if (
      testType ===
      TestType.DAILY
    ) {
      base += 20;
    }

    return base;
  }

  // ============================================================
  // NIVEL
  // ============================================================

  private async updateUserLevel(
    userId: string,
  ) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },

        select: {
          xp: true,
          level: true,
        },
      });

    if (!user) {
      return;
    }

    const thresholds = [
      0,
      250,
      700,
      1500,
      3000,
      5500,
      9000,
      14000,
      21000,
      30000,
    ];

    let newLevel = 1;

    for (
      let i =
        thresholds.length - 1;
      i >= 0;
      i--
    ) {
      if (
        user.xp >=
        thresholds[i]
      ) {
        newLevel =
          i + 1;

        break;
      }
    }

    if (
      newLevel !==
      user.level
    ) {
      await this.prisma.user.update({
        where: {
          id: userId,
        },

        data: {
          level:
            newLevel,
        },
      });
    }
  }

  // ============================================================
  // SHUFFLE
  // ============================================================

  private shuffleArray<T>(
    array: T[],
  ): void {
    for (
      let i =
        array.length - 1;
      i > 0;
      i--
    ) {
      const j =
        Math.floor(
          Math.random() *
            (i + 1),
        );

      [
        array[i],
        array[j],
      ] = [
        array[j],
        array[i],
      ];
    }
  }
}