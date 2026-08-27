import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { QuestionStatus, Role } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  /**
   * Dashboard resumen
   */
  async getDashboard() {
    const [
      totalUsers,
      premiumUsers,
      totalQuestions,
      publishedQuestions,
      totalTests,
      testsToday,
      totalLaws,
      totalArticles,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.subscription.count({
        where: { status: 'ACTIVE', plan: { not: 'FREE' } },
      }),
      this.prisma.question.count(),
      this.prisma.question.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.testAttempt.count({ where: { status: 'COMPLETED' } }),
      this.prisma.testAttempt.count({
        where: {
          status: 'COMPLETED',
          finishedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      this.prisma.law.count(),
      this.prisma.article.count(),
    ]);

    return {
      users: { total: totalUsers, premium: premiumUsers },
      questions: { total: totalQuestions, published: publishedQuestions },
      tests: { totalCompleted: totalTests, completedToday: testsToday },
      content: { laws: totalLaws, articles: totalArticles },
    };
  }

  /**
   * Listar usuarios (paginado)
   */
  async listUsers(params: { limit?: number; offset?: number; search?: string }) {
    const { limit = 20, offset = 0, search } = params;

    const where: any = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        take: Math.min(limit, 100),
        skip: offset,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          xp: true,
          level: true,
          isActive: true,
          createdAt: true,
          subscription: {
            select: { status: true, plan: true, endDate: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  /**
   * Cambiar rol de usuario
   */
  async updateUserRole(userId: string, role: Role) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });
  }

  /**
   * Activar / desactivar usuario
   */
  async setUserActive(userId: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, email: true, isActive: true },
    });
  }

  /**
   * Listar preguntas para moderación
   */
  async listQuestions(params: {
    status?: QuestionStatus;
    limit?: number;
    offset?: number;
  }) {
    const { status, limit = 20, offset = 0 } = params;

    const where: any = {};
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        take: Math.min(limit, 100),
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          answers: { orderBy: { order: 'asc' } },
          opposition: { select: { id: true, name: true, code: true } },
          topic: { select: { id: true, name: true } },
          _count: { select: { userAnswers: true } },
        },
      }),
      this.prisma.question.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  /**
   * Cambiar estado de una pregunta (DRAFT → REVIEW → PUBLISHED → ARCHIVED)
   */
  async updateQuestionStatus(questionId: string, status: QuestionStatus) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question) throw new NotFoundException('Pregunta no encontrada');

    return this.prisma.question.update({
      where: { id: questionId },
      data: {
        status,
        publishedAt: status === 'PUBLISHED' ? new Date() : question.publishedAt,
      },
      select: {
        id: true,
        statement: true,
        status: true,
        publishedAt: true,
      },
    });
  }

  /**
   * Eliminar pregunta (soft: archivar)
   */
  async archiveQuestion(questionId: string) {
    return this.updateQuestionStatus(questionId, 'ARCHIVED');
  }
}
