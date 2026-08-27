import {
  IsString,
  IsOptional,
  IsUUID,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class TutorQuestionDto {
  @ApiProperty({
    example:
      '¿Me puedes explicar el artículo 14 de la Constitución de forma sencilla?',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  question!: string;

  @ApiProperty({
    required: false,
    description:
      'ID de la pregunta del banco. Al proporcionarlo, IBERIAN obtiene automáticamente su artículo, ley, tema y respuestas.',
  })
  @IsOptional()
  @IsUUID()
  questionId?: string;

  @ApiProperty({
    required: false,
    description:
      'ID del artículo legal. Se utiliza como contexto cuando no se obtiene automáticamente desde questionId.',
  })
  @IsOptional()
  @IsUUID()
  articleId?: string;

  @ApiProperty({
    required: false,
    description:
      'ID de la ley. Se utiliza como contexto cuando no se obtiene automáticamente desde questionId.',
  })
  @IsOptional()
  @IsUUID()
  lawId?: string;
}