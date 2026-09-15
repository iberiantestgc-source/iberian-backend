import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const articles = await prisma.article.findMany({
    where: {
      law: {
        code: 'CE',
      },
    },
    orderBy: {
      order: 'asc',
    },
    select: {
      number: true,
      name: true,
      _count: {
        select: {
          questions: true,
        },
      },
    },
  });

  const result = articles.filter(
    (article) =>
      article.number === 'PREÁMBULO' ||
      article.number === '1' ||
      article._count.questions > 0,
  );

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });