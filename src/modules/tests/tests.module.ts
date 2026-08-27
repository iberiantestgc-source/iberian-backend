import { Module } from '@nestjs/common';
import { TestsService } from './tests.service';
import { TestsController } from './tests.controller';
import { QuestionsModule } from '../questions/questions.module';
import { AchievementsModule } from '../achievements/achievements.module';
import { RankingModule } from '../ranking/ranking.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    QuestionsModule,
    AchievementsModule,
    RankingModule,
    NotificationsModule,
    SubscriptionsModule,
  ],
  controllers: [TestsController],
  providers: [TestsService],
  exports: [TestsService],
})
export class TestsModule {}
