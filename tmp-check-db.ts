import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== INICIO ===');

  const count = await prisma.law.count();

  console.log('Número total de leyes:', count);

  const laws = await prisma.law.findMany({
    select: {
      id: true,
      name: true,
      shortName: true,
      code: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  console.log('=== LEYES ===');
  console.log(JSON.stringify(laws, null, 2));

  console.log('=== FIN ===');
}

main()
  .catch((error) => {
    console.error('? ERROR:');
    console.error(error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
