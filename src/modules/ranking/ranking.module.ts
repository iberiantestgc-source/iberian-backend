import { Module } from '@nestjs/common';
import { RankingService } from './ranking.service';
import { RankingController } from './ranking.controller';
import { SupabaseService } from '../users/supabase.service';

@Module({
  controllers: [RankingController],
  providers: [RankingService, SupabaseService],
  exports: [RankingService],
})
export class RankingModule {}