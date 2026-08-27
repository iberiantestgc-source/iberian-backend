import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
} from '@nestjs/swagger';

import {
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

import { TestsService } from './tests.service';
import { GenerateTestDto } from './dto/generate-test.dto';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// ============================================================
// DTO - RESPONDER PREGUNTA
// ============================================================

class SubmitAnswerDto {
  @ApiProperty({
    example: 'uuid-de-la-pregunta',
  })
  @IsUUID()
  questionId!: string;

  @ApiProperty({
    example: 'uuid-de-la-respuesta',
  })
  @IsUUID()
  selectedAnswerId!: string;

  @ApiProperty({
    example: 8500,
    required: false,
    description:
      'Tiempo empleado en milisegundos',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  timeSpentMs?: number;
}

// ============================================================
// DTO - RESPONDER EN BLANCO
// ============================================================

class SubmitBlankAnswerDto {
  @ApiProperty({
    example: 'uuid-de-la-pregunta',
  })
  @IsUUID()
  questionId!: string;

  @ApiProperty({
    example: 8500,
    required: false,
    description:
      'Tiempo empleado en milisegundos',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  timeSpentMs?: number;
}

// ============================================================
// CONTROLLER
// ============================================================

@ApiTags('tests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tests')
export class TestsController {
  constructor(
    private readonly testsService: TestsService,
  ) {}

  // ==========================================================
  // GENERAR TEST
  // ==========================================================

  @Post('generate')
  @ApiOperation({
    summary:
      'Generar un nuevo test (Motor único de tests)',
    description:
      'Recibe filtros → busca preguntas → mezcla → controla duplicados → devuelve el examen',
  })
  generate(
    @CurrentUser('id') userId: string,
    @Body() dto: GenerateTestDto,
  ) {
    return this.testsService.generateTest(
      userId,
      dto,
    );
  }

  // ==========================================================
  // RESPONDER PREGUNTA
  // ==========================================================

  @Post('attempts/:attemptId/answer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Enviar respuesta a una pregunta del test',
  })
  submitAnswer(
    @CurrentUser('id') userId: string,
    @Param('attemptId') attemptId: string,
    @Body() body: SubmitAnswerDto,
  ) {
    return this.testsService.submitAnswer(
      userId,
      attemptId,
      body.questionId,
      body.selectedAnswerId,
      body.timeSpentMs,
    );
  }

  // ==========================================================
  // DEJAR PREGUNTA EN BLANCO
  // ==========================================================

  @Post(
    'attempts/:attemptId/answer/blank',
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Dejar una pregunta del test en blanco',
    description:
      'Registra la pregunta como no contestada sin seleccionar ninguna respuesta',
  })
  submitBlankAnswer(
    @CurrentUser('id') userId: string,
    @Param('attemptId') attemptId: string,
    @Body() body: SubmitBlankAnswerDto,
  ) {
    return this.testsService.submitBlankAnswer(
      userId,
      attemptId,
      body.questionId,
      body.timeSpentMs,
    );
  }

  // ==========================================================
  // FINALIZAR TEST
  // ==========================================================

  @Post(
    'attempts/:attemptId/finish',
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Finalizar test y calcular resultados + XP',
  })
  finish(
    @CurrentUser('id') userId: string,
    @Param('attemptId') attemptId: string,
  ) {
    return this.testsService.finishTest(
      userId,
      attemptId,
    );
  }
}
