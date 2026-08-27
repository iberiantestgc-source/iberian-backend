import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateLawDto } from './dto/create-law.dto';
import { CreateArticleDto } from './dto/create-article.dto';

@Injectable()
export class LawsService {
  constructor(private prisma: PrismaService) {}

  // ==================== LAWS ====================

  async createLaw(dto: CreateLawDto) {
    return this.prisma.law.create({
      data: {
        name: dto.name,
        shortName: dto.shortName,
        code: dto.code,
        description: dto.description,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null,
      },
    });
  }

  async findAllLaws() {
    return this.prisma.law.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            articles: true,
            questions: true,
          },
        },
      },
    });
  }

  async findLawById(id: string) {
    const law = await this.prisma.law.findUnique({
      where: { id },
      include: {
        titles: {
          orderBy: { order: 'asc' },
          include: {
            chapters: {
              orderBy: { order: 'asc' },
              include: {
                sections: {
                  orderBy: { order: 'asc' },
                },
              },
            },
          },
        },
        _count: {
          select: {
            articles: true,
            questions: true,
          },
        },
      },
    });

    if (!law) {
      throw new NotFoundException('Ley no encontrada');
    }

    return law;
  }

  // ==================== ARTICLES ====================

  async createArticle(dto: CreateArticleDto) {
    // Verificar que la ley existe
    const law = await this.prisma.law.findUnique({
      where: { id: dto.lawId },
    });

    if (!law) {
      throw new NotFoundException('Ley no encontrada');
    }

    return this.prisma.article.create({
      data: {
        lawId: dto.lawId,
        number: dto.number,
        name: dto.name,
        content: dto.content,
        titleId: dto.titleId,
        chapterId: dto.chapterId,
        sectionId: dto.sectionId,
        order: dto.order ?? 0,
      },
      include: {
        law: {
          select: {
            id: true,
            name: true,
            shortName: true,
          },
        },
      },
    });
  }

  async findArticleById(id: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: {
        law: {
          select: {
            id: true,
            name: true,
            shortName: true,
            code: true,
          },
        },
        title: true,
        chapter: true,
        section: true,
        paragraphs: {
          orderBy: { order: 'asc' },
        },
        _count: {
          select: {
            questions: true,
          },
        },
      },
    });

    if (!article) {
      throw new NotFoundException('Artículo no encontrado');
    }

    return article;
  }

  async findArticlesByLaw(lawId: string) {
    return this.prisma.article.findMany({
      where: { lawId },
      orderBy: { order: 'asc' },
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
    });
  }

  async findArticleByNumber(lawId: string, number: string) {
    const article = await this.prisma.article.findUnique({
      where: {
        lawId_number: {
          lawId,
          number,
        },
      },
      include: {
        law: {
          select: {
            id: true,
            name: true,
            shortName: true,
          },
        },
        paragraphs: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!article) {
      throw new NotFoundException(
        `Artículo ${number} no encontrado en esta ley`,
      );
    }

    return article;
  }

  // ==================== STRUCTURE HELPERS ====================

  async getLawStructure(lawId: string) {
    const law = await this.prisma.law.findUnique({
      where: { id: lawId },
      include: {
        titles: {
          orderBy: { order: 'asc' },
          include: {
            chapters: {
              orderBy: { order: 'asc' },
              include: {
                sections: {
                  orderBy: { order: 'asc' },
                  include: {
                    articles: {
                      orderBy: { order: 'asc' },
                      select: {
                        id: true,
                        number: true,
                        name: true,
                      },
                    },
                  },
                },
                articles: {
                  where: { sectionId: null },
                  orderBy: { order: 'asc' },
                  select: {
                    id: true,
                    number: true,
                    name: true,
                  },
                },
              },
            },
            articles: {
              where: { chapterId: null },
              orderBy: { order: 'asc' },
              select: {
                id: true,
                number: true,
                name: true,
              },
            },
          },
        },
        articles: {
          where: { titleId: null },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            number: true,
            name: true,
          },
        },
      },
    });

    if (!law) {
      throw new NotFoundException('Ley no encontrada');
    }

    return law;
  }
}