import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class CreateOppositionDto {
  @ApiProperty({ example: 'Guardia Civil' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'GC' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code!: string;

  @ApiProperty({
    example: 'Oposición a Guardia Civil',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}