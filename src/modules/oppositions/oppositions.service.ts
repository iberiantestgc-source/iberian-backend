import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateOppositionDto } from './dto/create-opposition.dto';

@Injectable()
export class OppositionsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateOppositionDto) {
    return this.prisma.opposition.create({
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
      },
    });
  }

  async findAll() {
    return this.prisma.opposition.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { questions: true, topics: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const opposition = await this.prisma.opposition.findUnique({
      where: { id },
      include: {
        syllabi: true,
        topics: {
          where: { parentId: null },
          orderBy: { order: 'asc' },
        },
        _count: {
          select: { questions: true },
        },
      },
    });

    if (!opposition) {
      throw new NotFoundException('Oposición no encontrada');
    }

    return opposition;
  }

  async findByCode(code: string) {
    const opposition = await this.prisma.opposition.findUnique({
      where: { code },
    });

    if (!opposition) {
      throw new NotFoundException(`Oposición con código ${code} no encontrada`);
    }

    return opposition;
  }
}
