import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LawsService } from './laws.service';
import { CreateLawDto } from './dto/create-law.dto';
import { CreateArticleDto } from './dto/create-article.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('laws')
@Controller('laws')
export class LawsController {
  constructor(private readonly lawsService: LawsService) {}

  // ===== LAWS =====

  @Get()
  @ApiOperation({ summary: 'Listar todas las leyes activas' })
  findAllLaws() {
    return this.lawsService.findAllLaws();
  }

  // Rutas específicas ANTES de las paramétricas
  @Get('articles/:id')
  @ApiOperation({ summary: 'Obtener un artículo por ID' })
  findArticleById(@Param('id') id: string) {
    return this.lawsService.findArticleById(id);
  }

  @Post('articles')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear nuevo artículo (Admin)' })
  createArticle(@Body() dto: CreateArticleDto) {
    return this.lawsService.createArticle(dto);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear nueva ley (Admin)' })
  createLaw(@Body() dto: CreateLawDto) {
    return this.lawsService.createLaw(dto);
  }

  @Get(':id/structure')
  @ApiOperation({ summary: 'Obtener estructura completa de la ley (BOE)' })
  getLawStructure(@Param('id') id: string) {
    return this.lawsService.getLawStructure(id);
  }

  @Get(':id/articles')
  @ApiOperation({ summary: 'Listar artículos de una ley' })
  findArticlesByLaw(@Param('id') id: string) {
    return this.lawsService.findArticlesByLaw(id);
  }

  @Get(':lawId/articles/:number')
  @ApiOperation({ summary: 'Obtener artículo por número dentro de una ley' })
  findArticleByNumber(
    @Param('lawId') lawId: string,
    @Param('number') number: string,
  ) {
    return this.lawsService.findArticleByNumber(lawId, number);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una ley por ID (con estructura)' })
  findLawById(@Param('id') id: string) {
    return this.lawsService.findLawById(id);
  }
}
