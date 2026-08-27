import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { Difficulty, QuestionStatus } from '@prisma/client';

@Injectable()
export class QuestionsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateQuestionDto) {
    const correctAnswers = dto.answers.filter((a) => a.isCorrect);
    if (correctAnswers.length !== 1) {
      throw new BadRequestException(
        'Debe haber exactamente una respuesta correcta',
      );
    }

    const opposition = await this.prisma.opposition.findUnique({
      where: { id: dto.oppositionId },
    });
    if (!opposition) {
      throw new NotFoundException('Oposición no encontrada');
    }

    return this.prisma.question.create({
      data: {
        oppositionId: dto.oppositionId,
        statement: dto.statement,
        explanation: dto.explanation,
        legalReference: dto.legalReference,
        difficulty: (dto.difficulty as Difficulty) || Difficulty.MEDIUM,
        level: dto.level ?? 1,
        topicId: dto.topicId,
        lawId: dto.lawId,
        articleId: dto.articleId,
        status: QuestionStatus.PUBLISHED,
        answers: {
          create: dto.answers.map((a, index) => ({
            text: a.text,
            isCorrect: a.isCorrect,
            explanation: a.explanation,
            order: a.order ?? index,
          })),
        },
      },
      include: {
        answers: { orderBy: { order: 'asc' } },
        topic: { select: { id: true, name: true, code: true } },
        law: { select: { id: true, name: true, shortName: true } },
        article: { select: { id: true, number: true, name: true } },
      },
    });
  }

  async findOne(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: {
        answers: { orderBy: { order: 'asc' } },
        topic: { select: { id: true, name: true, code: true } },
        law: { select: { id: true, name: true, shortName: true } },
        article: {
          select: {
            id: true,
            number: true,
            name: true,
            content: true,
          },
        },
        opposition: { select: { id: true, name: true, code: true } },
      },
    });

    if (!question) {
      throw new NotFoundException('Pregunta no encontrada');
    }

    return question;
  }

  async findByFilters(filters: {
    oppositionId?: string;
    topicId?: string;
    lawId?: string;
    articleId?: string;
    difficulty?: Difficulty;
    status?: QuestionStatus;
    limit?: number;
    offset?: number;
  }) {
    const {
      oppositionId,
      topicId,
      lawId,
      articleId,
      difficulty,
      status = QuestionStatus.PUBLISHED,
      limit = 20,
      offset = 0,
    } = filters;

    const where: any = { status };

    if (oppositionId) where.oppositionId = oppositionId;
    if (topicId) where.topicId = topicId;
    if (lawId) where.lawId = lawId;
    if (articleId) where.articleId = articleId;
    if (difficulty) where.difficulty = difficulty;

    const [items, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        take: Math.min(limit, 100),
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          answers: { orderBy: { order: 'asc' } },
          topic: { select: { id: true, name: true, code: true } },
          article: { select: { id: true, number: true } },
        },
      }),
      this.prisma.question.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  /**
   * Obtiene preguntas aleatorias según filtros.
   * Usado por el Motor de Tests.
   */
  async getRandomQuestions(params: {
    oppositionId: string;
    count: number;
    topicId?: string;
    lawId?: string;
    articleId?: string;
    difficulty?: Difficulty;
    excludeIds?: string[];
  }) {
    const {
      oppositionId,
      count,
      topicId,
      lawId,
      articleId,
      difficulty,
      excludeIds = [],
    } = params;

    const where: any = {
      oppositionId,
      status: QuestionStatus.PUBLISHED,
    };

    if (topicId) where.topicId = topicId;
    if (lawId) where.lawId = lawId;
    if (articleId) where.articleId = articleId;
    if (difficulty) where.difficulty = difficulty;
    if (excludeIds.length > 0) {
      where.id = { notIn: excludeIds };
    }

    // Traemos más de las necesarias y hacemos shuffle en memoria
    // (suficiente para volúmenes normales de oposiciones)
    const candidates = await this.prisma.question.findMany({
      where,
      select: { id: true },
      take: Math.min(count * 5, 500),
    });

    // Fisher-Yates shuffle
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    const selectedIds = candidates.slice(0, count).map((q) => q.id);

    if (selectedIds.length === 0) {
      return [];
    }

    const questions = await this.prisma.question.findMany({
      where: { id: { in: selectedIds } },
      include: {
        answers: { orderBy: { order: 'asc' } },
        topic: { select: { id: true, name: true, code: true } },
        article: { select: { id: true, number: true, name: true } },
        law: { select: { id: true, shortName: true } },
      },
    });

    // Mantener el orden aleatorio
    const orderMap = new Map(selectedIds.map((id, idx) => [id, idx]));
    questions.sort(
      (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
    );

    return questions;
  }
}
