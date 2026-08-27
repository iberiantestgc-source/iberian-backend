import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsUUID,
  IsInt,
  Min,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class CreateArticleDto {
  @ApiProperty({ example: 'uuid-de-la-ley' })
  @IsUUID()
  lawId!: string;

  @ApiProperty({ example: '14' })
  @IsString()
  @IsNotEmpty()
  number!: string;

  @ApiProperty({
    example: 'Derechos y deberes',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    example: 'Texto completo del artículo...',
    required: false,
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  titleId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  chapterId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}