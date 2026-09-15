import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('==============================================');
  console.log('IBERIAN - ESTRUCTURA CONSTITUCIÓN ESPAÑOLA');
  console.log('==============================================');

  // La ley CE ya debe existir en la base de datos.
  const law = await prisma.law.findFirst({
    where: {
      code: 'CE',
    },
  });

  if (!law) {
    throw new Error(
      'No se ha encontrado la ley CE en la base de datos. Ejecuta primero la carga de leyes.',
    );
  }

  console.log(`Ley encontrada: ${law.name}`);
  console.log(`ID: ${law.id}`);
  console.log('');

  // ------------------------------------------------------------
  // PREÁMBULO
  // ------------------------------------------------------------

  const preambulo = await prisma.article.upsert({
    where: {
      lawId_number: {
        lawId: law.id,
        number: 'PREÁMBULO',
      },
    },
    update: {
      name: 'Preámbulo',
      order: 0,
    },
    create: {
      lawId: law.id,
      number: 'PREÁMBULO',
      name: 'Preámbulo',
      order: 0,
    },
  });

  console.log(`✓ PREÁMBULO: ${preambulo.id}`);

  // ------------------------------------------------------------
  // ARTÍCULOS 1 - 169
  // ------------------------------------------------------------

  let created = 0;
  let updated = 0;

  for (let number = 1; number <= 169; number++) {
    const articleNumber = String(number);

    const existing = await prisma.article.findUnique({
      where: {
        lawId_number: {
          lawId: law.id,
          number: articleNumber,
        },
      },
      select: {
        id: true,
      },
    });

    await prisma.article.upsert({
      where: {
        lawId_number: {
          lawId: law.id,
          number: articleNumber,
        },
      },
      update: {
        name: `Artículo ${articleNumber}`,
        order: number,
      },
      create: {
        lawId: law.id,
        number: articleNumber,
        name: `Artículo ${articleNumber}`,
        order: number,
      },
    });

    if (existing) {
      updated++;
    } else {
      created++;
    }

    console.log(`✓ Artículo ${articleNumber}`);
  }

  // ------------------------------------------------------------
  // COMPROBACIÓN FINAL
  // ------------------------------------------------------------

  const articles = await prisma.article.findMany({
    where: {
      lawId: law.id,
    },
    orderBy: {
      order: 'asc',
    },
    select: {
      id: true,
      number: true,
      name: true,
      order: true,
      _count: {
        select: {
          questions: true,
        },
      },
    },
  });

  console.log('');
  console.log('==============================================');
  console.log('RESULTADO');
  console.log('==============================================');
  console.log(`Ley: ${law.name}`);
  console.log(`ID: ${law.id}`);
  console.log(`Total artículos/entradas: ${articles.length}`);
  console.log(`Nuevos creados: ${created}`);
  console.log(`Ya existentes/actualizados: ${updated}`);
  console.log('');

  const preambleCount = articles.filter(
    (article) => article.number === 'PREÁMBULO',
  ).length;

  const numberedArticles = articles.filter(
    (article) => article.number !== 'PREÁMBULO',
  );

  console.log(`PREÁMBULO: ${preambleCount}`);
  console.log(`Artículos numerados: ${numberedArticles.length}`);

  const withQuestions = articles.filter(
    (article) => article._count.questions > 0,
  );

  console.log(`Artículos con preguntas: ${withQuestions.length}`);
  console.log('');

  if (articles.length !== 170) {
    throw new Error(
      `ERROR: se esperaban 170 entradas (PREÁMBULO + 169 artículos), pero hay ${articles.length}.`,
    );
  }

  if (preambleCount !== 1) {
    throw new Error(
      `ERROR: se esperaba exactamente 1 PREÁMBULO, pero hay ${preambleCount}.`,
    );
  }

  if (numberedArticles.length !== 169) {
    throw new Error(
      `ERROR: se esperaban 169 artículos numerados, pero hay ${numberedArticles.length}.`,
    );
  }

  console.log('✓ ESTRUCTURA CORRECTA');
  console.log('✓ PREÁMBULO + ARTÍCULOS 1-169');
  console.log('✓ No se han creado preguntas.');
  console.log('✓ Los artículos existentes se han conservado.');
  console.log('');
}

main()
  .catch((error) => {
    console.error('');
    console.error('❌ ERROR DURANTE LA CARGA:');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
