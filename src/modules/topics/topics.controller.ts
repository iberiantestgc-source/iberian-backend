import {
Controller,
Get,
Param,
Query,
UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { TopicsService } from './topics.service';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Topics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('topics')
export class TopicsController {
constructor(private readonly topicsService: TopicsService) {}

@Get()
@ApiOperation({ summary: 'Obtener todos los temas' })
async findAll(@Query('oppositionId') oppositionId?: string) {
return this.topicsService.findAll(oppositionId);
}

@Get(':id')
@ApiOperation({ summary: 'Obtener un tema por ID' })
async findOne(@Param('id') id: string) {
return this.topicsService.findOne(id);
}
}
