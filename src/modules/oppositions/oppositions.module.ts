import { Module } from '@nestjs/common';
import { OppositionsService } from './oppositions.service';
import { OppositionsController } from './oppositions.controller';

@Module({
  controllers: [OppositionsController],
  providers: [OppositionsService],
  exports: [OppositionsService],
})
export class OppositionsModule {}
