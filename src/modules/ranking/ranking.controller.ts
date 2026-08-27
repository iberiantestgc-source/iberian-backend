import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { RankingService } from './ranking.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('ranking')
@Controller('ranking')
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  @Get('leaderboard')
  @ApiOperation({ summary: 'Tabla de clasificación (Top usuarios)' })
  @ApiQuery({ name: 'oppositionId', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  getLeaderboard(
    @Query('oppositionId') oppositionId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.rankingService.getLeaderboard({
      oppositionId,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mi posición en el ranking' })
  @ApiQuery({ name: 'oppositionId', required: false })
  getMyPosition(
    @CurrentUser('id') userId: string,
    @Query('oppositionId') oppositionId?: string,
  ) {
    return this.rankingService.getUserPosition(userId, oppositionId);
  }
}
