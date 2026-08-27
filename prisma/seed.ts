import { PrismaClient, Difficulty, QuestionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding IBERIAN database...');

  // 1. Admin user
  const passwordHash = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@iberian.app' },
    update: {},
    create: {
      email: 'admin@iberian.app',
      passwordHash,
      name: 'Administrador',
      role: 'ADMIN',
      xp: 0,
      level: 1,
      subscription: {
        create: {
          status: 'ACTIVE',
          plan: 'PREMIUM_YEARLY',
        },
      },
    },
  });
  console.log('✅ Admin creado:', admin.email);

  // 2. Oposición Guardia Civil
  const gc = await prisma.opposition.upsert({
    where: { code: 'GC' },
    update: {},
    create: {
      name: 'Guardia Civil',
      code: 'GC',
      description: 'Oposición a Guardia Civil - Escala de Cabos y Guardias',
    },
  });
  console.log('✅ Oposición creada:', gc.name);

  // 3. Ley Orgánica 2/1986
  const lofcs = await prisma.law.create({
    data: {
      name: 'Ley Orgánica 2/1986, de 13 de marzo, de Fuerzas y Cuerpos de Seguridad',
      shortName: 'LOFCS',
      code: 'LO 2/1986',
      description: 'Ley orgánica que regula las Fuerzas y Cuerpos de Seguridad',
    },
  });
  console.log('✅ Ley creada:', lofcs.shortName);

  // 4. Artículo 14 de ejemplo
  const art14 = await prisma.article.create({
    data: {
      lawId: lofcs.id,
      number: '14',
      name: 'Funciones de las Fuerzas y Cuerpos de Seguridad',
      content:
        'Las Fuerzas y Cuerpos de Seguridad tienen como misión proteger el libre ejercicio de los derechos y libertades y garantizar la seguridad ciudadana.',
      order: 14,
    },
  });
  console.log('✅ Artículo creado: Art.', art14.number);

  // 5. Tema de ejemplo
  const topic = await prisma.topic.create({
    data: {
      oppositionId: gc.id,
      name: 'Derecho Constitucional y Organización del Estado',
      code: 'T1',
      order: 1,
    },
  });

  // 6. Preguntas de ejemplo
  const questionsData = [
    {
      statement:
        'Según la Ley Orgánica 2/1986, ¿cuál es la misión principal de las Fuerzas y Cuerpos de Seguridad?',
      explanation:
        'El artículo 11 y concordantes de la LOFCS establecen que la misión es proteger el libre ejercicio de los derechos y libertades y garantizar la seguridad ciudadana.',
      legalReference: 'Art. 11 LOFCS',
      difficulty: Difficulty.MEDIUM,
      answers: [
        {
          text: 'Proteger el libre ejercicio de los derechos y libertades y garantizar la seguridad ciudadana',
          isCorrect: true,
        },
        {
          text: 'Únicamente perseguir el delito',
          isCorrect: false,
        },
        {
          text: 'Dirigir la política de seguridad del Estado',
          isCorrect: false,
        },
        {
          text: 'Controlar las fronteras exclusivamente',
          isCorrect: false,
        },
      ],
    },
    {
      statement:
        '¿Qué rango tiene la Ley Orgánica 2/1986 de Fuerzas y Cuerpos de Seguridad?',
      explanation:
        'Es una Ley Orgánica, por lo que requiere mayoría absoluta del Congreso para su aprobación, modificación o derogación.',
      legalReference: 'Art. 81 CE y LO 2/1986',
      difficulty: Difficulty.EASY,
      answers: [
        {
          text: 'Ley ordinaria',
          isCorrect: false,
        },
        {
          text: 'Ley Orgánica',
          isCorrect: true,
        },
        {
          text: 'Real Decreto',
          isCorrect: false,
        },
        {
          text: 'Reglamento',
          isCorrect: false,
        },
      ],
    },
  ];

  for (const q of questionsData) {
    await prisma.question.create({
      data: {
        oppositionId: gc.id,
        topicId: topic.id,
        lawId: lofcs.id,
        articleId: art14.id,
        statement: q.statement,
        explanation: q.explanation,
        legalReference: q.legalReference,
        difficulty: q.difficulty,
        status: QuestionStatus.PUBLISHED,
        level: 1,
        answers: {
          create: q.answers.map((a, i) => ({
            text: a.text,
            isCorrect: a.isCorrect,
            order: i,
          })),
        },
      },
    });
  }
  console.log(`✅ ${questionsData.length} preguntas de ejemplo creadas`);

  // 7. Logros por defecto
  const achievements = [
    { code: 'FIRST_TEST', name: 'Primer test', description: 'Completa tu primer test', xpReward: 25, condition: { type: 'FIRST_TEST' } },
    { code: 'TESTS_10', name: '10 tests', description: 'Completa 10 tests', xpReward: 100, condition: { type: 'TESTS_COMPLETED', count: 10 } },
    { code: 'TESTS_50', name: '50 tests', description: 'Completa 50 tests', xpReward: 300, condition: { type: 'TESTS_COMPLETED', count: 50 } },
    { code: 'QUESTIONS_100', name: '100 preguntas', description: 'Responde 100 preguntas', xpReward: 75, condition: { type: 'QUESTIONS_ANSWERED', count: 100 } },
    { code: 'QUESTIONS_1000', name: '1000 preguntas', description: 'Responde 1000 preguntas', xpReward: 400, condition: { type: 'QUESTIONS_ANSWERED', count: 1000 } },
    { code: 'STREAK_7', name: 'Racha de 7 días', description: 'Estudia 7 días seguidos', xpReward: 150, condition: { type: 'DAILY_STREAK', days: 7 } },
    { code: 'STREAK_30', name: 'Racha de 30 días', description: 'Estudia 30 días seguidos', xpReward: 500, condition: { type: 'DAILY_STREAK', days: 30 } },
    { code: 'XP_1000', name: '1000 XP', description: 'Alcanza 1000 puntos de experiencia', xpReward: 50, condition: { type: 'XP_REACHED', xp: 1000 } },
  ];

  for (const a of achievements) {
    await prisma.achievement.upsert({
      where: { code: a.code },
      update: {},
      create: a,
    });
  }
  console.log(`✅ ${achievements.length} logros creados`);

  console.log('🎉 Seed completado correctamente');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
