import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TopicsService {
constructor(private readonly prisma: PrismaService) {}

async findAll(oppositionId?: string) {
return this.prisma.topic.findMany({
where: oppositionId ? { oppositionId } : undefined,
orderBy: {
order: 'asc',
},
include: {
children: {
orderBy: {
order: 'asc',
},
},
_count: {
select: {
questions: true,
children: true,
},
},
},
});
}

async findOne(id: string) {
return this.prisma.topic.findUnique({
where: { id },
include: {
children: {
orderBy: {
order: 'asc',
},
},
parent: true,
_count: {
select: {
questions: true,
children: true,
},
},
},
});
}
}
