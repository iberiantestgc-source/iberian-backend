import { Module } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { FavoritesService } from './favorites.service';
import { QuestionsController } from './questions.controller';

@Module({
  controllers: [QuestionsController],
  providers: [QuestionsService, FavoritesService],
  exports: [QuestionsService, FavoritesService],
})
export class QuestionsModule {}
