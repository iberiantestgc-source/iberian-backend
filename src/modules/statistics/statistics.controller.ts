import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';

import { StatisticsService } from './statistics.service';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('statistics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('statistics')
export class StatisticsController {
  constructor(
    private readonly statisticsService: StatisticsService,
  ) {}

  // ==========================================================
  // ESTADÍSTICAS GENERALES
  // ==========================================================

  @Get('me')
  @ApiOperation({
    summary: 'Estadísticas generales del usuario',
  })
  getUserStats(
    @CurrentUser('id') userId: string,
  ) {
    return this.statisticsService.getUserStats(
      userId,
    );
  }

  // ==========================================================
  // ESTADÍSTICAS POR TEMA
  // ==========================================================

  @Get('me/topics')
  @ApiOperation({
    summary: 'Estadísticas por tema',
  })
  @ApiQuery({
    name: 'oppositionId',
    required: false,
  })
  getTopicStats(
    @CurrentUser('id') userId: string,
    @Query('oppositionId')
    oppositionId?: string,
  ) {
    return this.statisticsService.getTopicStats(
      userId,
      oppositionId,
    );
  }

  // ==========================================================
  // RECOMENDACIONES DE ESTUDIO
  // ==========================================================

  @Get('me/recommendations')
  @ApiOperation({
    summary:
      'Recomendaciones personalizadas de estudio',
  })
  @ApiQuery({
    name: 'oppositionId',
    required: false,
  })
  getStudyRecommendations(
    @CurrentUser('id') userId: string,
    @Query('oppositionId')
    oppositionId?: string,
  ) {
    return this.statisticsService.getStudyRecommendations(
      userId,
      oppositionId,
    );
  }
}