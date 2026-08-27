import {
  Controller,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';

import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';

import { AiService } from './ai.service';

import { TutorQuestionDto } from './dto/tutor-question.dto';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
  ) {}

  @Post('tutor')
  @ApiOperation({
    summary: 'Preguntar al tutor IA (contextual)',
    description:
      'La IA recibe contexto del usuario, pregunta, artículo, ley e historial cuando están disponibles.',
  })
  askTutor(
    @CurrentUser('id') userId: string,
    @Body() dto: TutorQuestionDto,
  ) {
    return this.aiService.askTutor(
      userId,
      dto,
    );
  }
}