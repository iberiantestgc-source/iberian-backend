import { Module } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';

import { AppService } from './app.service';

import { DatabaseModule } from './database/database.module';

import { AuthModule } from './modules/auth/auth.module';

import { UsersModule } from './modules/users/users.module';

import { OppositionsModule } from './modules/oppositions/oppositions.module';

import { LawsModule } from './modules/laws/laws.module';

import { QuestionsModule } from './modules/questions/questions.module';

import { TestsModule } from './modules/tests/tests.module';

import { StatisticsModule } from './modules/statistics/statistics.module';

import { AchievementsModule } from './modules/achievements/achievements.module';

import { RankingModule } from './modules/ranking/ranking.module';

import { NotificationsModule } from './modules/notifications/notifications.module';

import { AiModule } from './modules/ai/ai.module';

import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';

import { AdminModule } from './modules/admin/admin.module';

import { FilesModule } from './modules/files/files.module';

import { TopicsModule } from './modules/topics/topics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    OppositionsModule,
    LawsModule,
    QuestionsModule,
    TestsModule,
    StatisticsModule,
    AchievementsModule,
    RankingModule,
    NotificationsModule,
    AiModule,
    SubscriptionsModule,
    AdminModule,
    FilesModule,
    TopicsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}