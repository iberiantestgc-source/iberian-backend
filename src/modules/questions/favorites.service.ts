import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class FavoritesService {
  constructor(private prisma: PrismaService) {}

  async add(userId: string, questionId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question) throw new NotFoundException('Pregunta no encontrada');

    try {
      return await this.prisma.favorite.create({
        data: { userId, questionId },
      });
    } catch {
      throw new ConflictException('Ya está en favoritos');
    }
  }

  async remove(userId: string, questionId: string) {
    const fav = await this.prisma.favorite.findUnique({
      where: { userId_questionId: { userId, questionId } },
    });
    if (!fav) throw new NotFoundException('No está en favoritos');

    await this.prisma.favorite.delete({
      where: { id: fav.id },
    });
    return { removed: true };
  }

  async list(userId: string, limit = 50, offset = 0) {
    const [items, total] = await Promise.all([
      this.prisma.favorite.findMany({
        where: { userId },
        take: Math.min(limit, 100),
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          question: {
            include: {
              answers: { orderBy: { order: 'asc' } },
              topic: { select: { id: true, name: true, code: true } },
              article: { select: { id: true, number: true } },
            },
          },
        },
      }),
      this.prisma.favorite.count({ where: { userId } }),
    ]);

    return {
      items: items.map((f) => ({
        favoriteId: f.id,
        createdAt: f.createdAt,
        question: f.question,
      })),
      total,
      limit,
      offset,
    };
  }

  async isFavorite(userId: string, questionId: string) {
    const fav = await this.prisma.favorite.findUnique({
      where: { userId_questionId: { userId, questionId } },
    });
    return { isFavorite: !!fav };
  }
}
