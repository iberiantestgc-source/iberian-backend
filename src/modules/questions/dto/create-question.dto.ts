import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsUUID,
  IsEnum,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsInt,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export enum DifficultyDto {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
  EXPERT = 'EXPERT',
}

class AnswerDto {
  @ApiProperty({ example: 'Texto de la respuesta' })
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isCorrect!: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreateQuestionDto {
  @ApiProperty({ example: 'uuid-de-la-oposicion' })
  @IsUUID()
  oppositionId!: string;

  @ApiProperty({
    example:
      '¿Cuál es el contenido del artículo 14 de la Constitución?',
  })
  @IsString()
  @IsNotEmpty()
  statement!: string;

  @ApiProperty({ type: [AnswerDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers!: AnswerDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiProperty({
    example: 'Art. 14 CE',
    required: false,
  })
  @IsOptional()
  @IsString()
  legalReference?: string;

  @ApiProperty({
    enum: DifficultyDto,
    default: DifficultyDto.MEDIUM,
  })
  @IsOptional()
  @IsEnum(DifficultyDto)
  difficulty?: DifficultyDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  topicId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  lawId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  articleId?: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  level?: number;
}