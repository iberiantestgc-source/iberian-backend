import { Module } from '@nestjs/common';
import { TopicsController } from './topics.controller';
import { TopicsService } from './topics.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
controllers: [TopicsController],
providers: [TopicsService, PrismaService],
exports: [TopicsService],
})
export class TopicsModule {}
