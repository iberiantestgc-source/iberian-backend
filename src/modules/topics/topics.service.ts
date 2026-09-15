import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TopicsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(oppositionId?: string) {
    return this.prisma.topic.findMany({
      where: oppositionId ? { oppositionId } : undefined,
      orderBy: { order: 'asc' },
      include: {
        children: {
          orderBy: { order: 'asc' },
        },
        _count: {
          select: {
            questions: true,
            children: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.topic.findUnique({
      where: { id },
      include: {
        children: {
          orderBy: { order: 'asc' },
        },
        parent: true,
        _count: {
          select: {
            questions: true,
            children: true,
          },
        },
      },
    });
  }

  /**
   * Devuelve el catálogo real:
   *
   * TEMA
   *   └── SUBTEMA
   *        └── LEY
   *             └── ARTÍCULOS
   *
   * La relación Tema/Subtema → Ley se obtiene de las preguntas
   * existentes en PostgreSQL, ya que Topic no tiene una relación
   * directa con Law en Prisma.
   *
   * Una vez localizada una ley para un subtema, se devuelven todos
   * sus artículos, aunque alguno todavía tenga 0 preguntas.
   */
  async findCatalog(oppositionId?: string) {
    const topics = await this.prisma.topic.findMany({
      where: oppositionId
        ? { oppositionId }
        : undefined,
      orderBy: { order: 'asc' },
      include: {
        children: {
          orderBy: { order: 'asc' },
        },
        _count: {
          select: {
            questions: true,
            children: true,
          },
        },
      },
    });

    const topicIds = topics.flatMap((topic) => [
      topic.id,
      ...topic.children.map((child) => child.id),
    ]);

    if (topicIds.length === 0) {
      return [];
    }

    const questions = await this.prisma.question.findMany({
      where: {
        ...(oppositionId ? { oppositionId } : {}),
        status: 'PUBLISHED',
        topicId: {
          in: topicIds,
        },
        lawId: {
          not: null,
        },
      },
      select: {
        topicId: true,
        lawId: true,
      },
      distinct: ['topicId', 'lawId'],
    });

    const lawIdsByTopic = new Map<string, Set<string>>();

    for (const question of questions) {
      if (!question.topicId || !question.lawId) {
        continue;
      }

      if (!lawIdsByTopic.has(question.topicId)) {
        lawIdsByTopic.set(
          question.topicId,
          new Set<string>(),
        );
      }

      lawIdsByTopic
        .get(question.topicId)!
        .add(question.lawId);
    }

    const allLawIds = Array.from(
      new Set(
        Array.from(lawIdsByTopic.values()).flatMap(
          (ids) => Array.from(ids),
        ),
      ),
    );

    if (allLawIds.length === 0) {
      return topics.map((topic) => ({
        ...topic,
        children: topic.children.map((child) => ({
          ...child,
          laws: [],
        })),
        laws: [],
      }));
    }

    const laws = await this.prisma.law.findMany({
      where: {
        id: {
          in: allLawIds,
        },
      },
      orderBy: {
        name: 'asc',
      },
      select: {
        id: true,
        name: true,
        shortName: true,
        code: true,
        articles: {
          orderBy: {
            order: 'asc',
          },
          select: {
            id: true,
            number: true,
            name: true,
            order: true,
            _count: {
              select: {
                questions: true,
              },
            },
          },
        },
      },
    });

    const lawsById = new Map(
      laws.map((law) => [law.id, law]),
    );

    const getLawsForTopic = (topicId: string) => {
      const ids = lawIdsByTopic.get(topicId);

      if (!ids) {
        return [];
      }

      return Array.from(ids)
        .map((lawId) => lawsById.get(lawId))
        .filter(Boolean)
        .map((law) => ({
          id: law!.id,
          name: law!.name,
          shortName: law!.shortName,
          code: law!.code,
          articles: law!.articles.map((article) => ({
            id: article.id,
            number: article.number,
            name: article.name,
            order: article.order,
            questions: article._count.questions,
          })),
        }));
    };

    return topics.map((topic) => ({
      ...topic,
      laws: getLawsForTopic(topic.id),
      children: topic.children.map((child) => ({
        ...child,
        laws: getLawsForTopic(child.id),
      })),
    }));
  }
}