import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { QuestionsService } from './questions.service';
import { FavoritesService } from './favorites.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Difficulty } from '@prisma/client';

@ApiTags('questions')
@Controller('questions')
export class QuestionsController {
  constructor(
    private readonly questionsService: QuestionsService,
    private readonly favoritesService: FavoritesService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear nueva pregunta (Admin)' })
  create(@Body() dto: CreateQuestionDto) {
    return this.questionsService.create(dto);
  }

  // ===== FAVORITES (antes de :id) =====

  @Get('favorites/list')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar favoritos del usuario' })
  listFavorites(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.favoritesService.list(
      userId,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Post(':id/favorite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Añadir pregunta a favoritos' })
  addFavorite(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.favoritesService.add(userId, id);
  }

  @Delete(':id/favorite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Quitar de favoritos' })
  removeFavorite(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.favoritesService.remove(userId, id);
  }

  @Get(':id/favorite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '¿Está en favoritos?' })
  isFavorite(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.favoritesService.isFavorite(userId, id);
  }

  // ===== QUESTIONS =====

  @Get()
  @ApiOperation({ summary: 'Buscar preguntas con filtros' })
  @ApiQuery({ name: 'oppositionId', required: false })
  @ApiQuery({ name: 'topicId', required: false })
  @ApiQuery({ name: 'lawId', required: false })
  @ApiQuery({ name: 'articleId', required: false })
  @ApiQuery({ name: 'difficulty', required: false, enum: Difficulty })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  findByFilters(
    @Query('oppositionId') oppositionId?: string,
    @Query('topicId') topicId?: string,
    @Query('lawId') lawId?: string,
    @Query('articleId') articleId?: string,
    @Query('difficulty') difficulty?: Difficulty,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.questionsService.findByFilters({
      oppositionId,
      topicId,
      lawId,
      articleId,
      difficulty,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una pregunta por ID' })
  findOne(@Param('id') id: string) {
    return this.questionsService.findOne(id);
  }
}
