import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsDateString,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class CreateLawDto {
  @ApiProperty({
    example:
      'Ley Orgánica 2/1986, de 13 de marzo, de Fuerzas y Cuerpos de Seguridad',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: 'LOFCS',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  shortName?: string;

  @ApiProperty({
    example: 'LO 2/1986',
    required: false,
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}