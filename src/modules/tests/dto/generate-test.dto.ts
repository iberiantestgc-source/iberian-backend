import {
  IsOptional,
  IsUUID,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsArray,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

import { Difficulty } from '@prisma/client';

export enum TestTypeDto {
  GLOBAL = 'GLOBAL',
  PRACTICE = 'PRACTICE',
  REAL = 'REAL',
  SIMULACRO = 'SIMULACRO',
  FAILED_ONLY = 'FAILED_ONLY',
  FAVORITES = 'FAVORITES',
  CUSTOM = 'CUSTOM',
  DAILY = 'DAILY',
}

export enum TestSelectionDto {
  GLOBAL = 'GLOBAL',
  TOPIC = 'TOPIC',
  SUBTOPIC = 'SUBTOPIC',
  ARTICLE = 'ARTICLE',
}

export class GenerateTestDto {
  @ApiProperty({
    example: 'uuid-de-la-oposicion',
    description: 'Oposición sobre la que se generará el test',
  })
  @IsUUID()
  oppositionId!: string;

  @ApiProperty({
    example: 20,
    minimum: 1,
    maximum: 100,
    description:
      'Número de preguntas del test. En el examen real se ignora este valor y siempre se generan 100 preguntas.',
  })
  @IsInt()
  @Min(1)
  @Max(100)
  count!: number;

  @ApiProperty({
    enum: TestTypeDto,
    default: TestTypeDto.PRACTICE,
    required: false,
    description: 'Tipo de test',
  })
  @IsOptional()
  @IsEnum(TestTypeDto)
  type?: TestTypeDto;

  @ApiProperty({
    enum: TestSelectionDto,
    required: false,
    description:
      'Modo de selección: global, tema, subtema o artículo',
  })
  @IsOptional()
  @IsEnum(TestSelectionDto)
  selection?: TestSelectionDto;

  @ApiProperty({
    example: 'uuid-del-tema',
    required: false,
    description:
      'Tema o subtema seleccionado. En modo TOPIC se incluyen sus descendientes. En modo SUBTOPIC se seleccionan los subtemas indicados y sus descendientes.',
  })
  @IsOptional()
  @IsUUID()
  topicId?: string;

  @ApiProperty({
    required: false,
    type: [String],
    description:
      'Varios temas o subtemas seleccionados.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  topicIds?: string[];

  @ApiProperty({
    example: 'uuid-de-la-ley',
    required: false,
    description: 'Ley seleccionada',
  })
  @IsOptional()
  @IsUUID()
  lawId?: string;

  @ApiProperty({
    example: 'uuid-del-articulo',
    required: false,
    description: 'Artículo seleccionado',
  })
  @IsOptional()
  @IsUUID()
  articleId?: string;

  @ApiProperty({
    required: false,
    type: [String],
    description:
      'Varios artículos seleccionados',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  articleIds?: string[];

  @ApiProperty({
    enum: Difficulty,
    required: false,
    description: 'Dificultad de las preguntas',
  })
  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @ApiProperty({
    example: 2160,
    required: false,
    minimum: 60,
    description:
      'Tiempo límite en segundos. Si no se indica, se calcula automáticamente según el número de preguntas. El examen real siempre utiliza 8640 segundos.',
  })
  @IsOptional()
  @IsInt()
  @Min(60)
  timeLimitSec?: number;

  @ApiProperty({
    required: false,
    type: [String],
    description:
      'Preguntas que deben excluirse del test',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  excludeIds?: string[];
}