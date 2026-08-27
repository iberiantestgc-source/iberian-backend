import {
  IsString,
  MinLength,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'token-de-recuperacion',
  })
  @IsString()
  token!: string;

  @ApiProperty({
    example: 'NuevaPassword123!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password!: string;
}