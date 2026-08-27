/**
 * Importa preguntas desde:
 * data/IBERIAN_Plantilla_Preguntas.xlsx
 *
 * Uso:
 *   npm install xlsx
 *   npx ts-node prisma/import-questions.ts
 *
 * Comportamiento:
 * - Si la pregunta NO existe: la crea.
 * - Si la pregunta YA existe: NO crea otra.
 * - Las preguntas existentes se actualizan para completar/corregir:
 *   - topicId
 *   - lawId
 *   - articleId
 *   - explanation
 *   - legalReference
 *   - difficulty
 *   - level
 *
 * - NO elimina preguntas.
 * - NO elimina respuestas.
 * - NO modifica TestQuestion.
 * - NO modifica UserAnswer.
 */

import {
  PrismaClient,
  Difficulty,
  QuestionStatus,
} from '@prisma/client';

// @ts-ignore
import * as XLSX from 'xlsx';

import * as path from 'path';
import * as fs from 'fs';

const prisma = new PrismaClient();

type Row = {
  Tema?: string;
  'Código Tema'?: string;
  Subtema?: string;
  Ley?: string;
  'Código Ley'?: string;
  Artículo?: string;
  Pregunta?: string;
  'Respuesta A'?: string;
  'Respuesta B'?: string;
  'Respuesta C'?: string;
  'Respuesta D'?: string;
  Correcta?: string;
  Explicación?: string;
  'Referencia legal'?: string;
  Dificultad?: string;
  Nivel?: number | string;
};

/* ============================================================
   UTILIDADES
   ============================================================ */

function normalize(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeForComparison(value: unknown): string {
  return normalize(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function mapDifficulty(raw?: string): Difficulty {
  const v = normalize(raw)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (v === 'EASY' || v === 'FACIL') {
    return Difficulty.EASY;
  }

  if (v === 'HARD' || v === 'DIFICIL') {
    return Difficulty.HARD;
  }

  if (v === 'EXPERT' || v === 'EXPERTO') {
    return Difficulty.EXPERT;
  }

  return Difficulty.MEDIUM;
}

function correctIndex(letter?: string): number {
  const c = normalize(letter).toUpperCase();

  const map: Record<string, number> = {
    A: 0,
    B: 1,
    C: 2,
    D: 3,

    '1': 0,
    '2': 1,
    '3': 2,
    '4': 3,
  };

  return map[c] ?? 0;
}

/**
 * Convierte referencias como:
 *
 * 1
 * 1.
 * Artículo 1
 * Art. 1
 * art. 1
 * 14
 * Preámbulo
 * PREÁMBULO
 *
 * en:
 *
 * 1
 * 14
 * PREÁMBULO
 */
function normalizeArticleNumber(value?: string): string | null {
  const raw = normalize(value);

  if (!raw) {
    return null;
  }

  const normalized = normalizeForComparison(raw);

  if (
    normalized === 'preambulo' ||
    normalized === 'preámbulo'
  ) {
    return 'PREÁMBULO';
  }

  const match = raw.match(
    /(?:art[ií]culo|art\.?)?\s*([0-9]+(?:\.[0-9]+)?(?:\s*bis|\s*ter)?)\s*$/i,
  );

  if (match) {
    return normalize(match[1]);
  }

  return raw;
}

/* ============================================================
   MAIN
   ============================================================ */

async function main() {
  const fileArg = process.argv[2];

  const filePath =
    fileArg ||
    path.join(
      process.cwd(),
      'data',
      'IBERIAN_Plantilla_Preguntas.xlsx',
    );

  if (!fs.existsSync(filePath)) {
    console.error(
      '❌ No se encuentra el Excel en:',
      filePath,
    );

    console.error(
      '   Colócalo en:',
      path.join(
        process.cwd(),
        'data',
        'IBERIAN_Plantilla_Preguntas.xlsx',
      ),
    );

    process.exit(1);
  }

  console.log('');
  console.log('========================================');
  console.log('IMPORTADOR DE PREGUNTAS IBERIAN');
  console.log('========================================');
  console.log('');

  console.log('📖 Leyendo:', filePath);

  const workbook = XLSX.readFile(filePath);

  const sheetNames = workbook.SheetNames as string[];

  console.log(
    '📑 Hojas encontradas:',
    sheetNames.join(', '),
  );

  /* ============================================================
     LEER HOJA CON MÁS FILAS
     ============================================================ */

  let sheetName = sheetNames[0];

  let rows: Row[] = [];

  for (const name of sheetNames) {
    const candidate = XLSX.utils.sheet_to_json(
      workbook.Sheets[name],
      {
        defval: '',
      },
    ) as Row[];

    const filtered = candidate.filter((row) =>
      Object.values(row).some(
        (value) =>
          normalize(value) !== '',
      ),
    );

    console.log(
      `   Hoja "${name}": ${filtered.length} filas`,
    );

    if (filtered.length > rows.length) {
      rows = filtered;
      sheetName = name;
    }
  }

  console.log(
    `📄 Usando hoja "${sheetName}": ${rows.length} filas`,
  );

  if (rows.length === 0) {
    console.error(
      '❌ El Excel no tiene filas de datos.',
    );

    process.exit(1);
  }

  console.log(
    '🔑 Columnas:',
    Object.keys(rows[0]).join(' | '),
  );

  /* ============================================================
     OPOSICIÓN
     ============================================================ */

  let opposition =
    await prisma.opposition.findFirst({
      where: {
        OR: [
          {
            code: 'GC',
          },
          {
            name: {
              contains: 'Guardia',
              mode: 'insensitive',
            },
          },
        ],
      },
    });

  if (!opposition) {
    opposition =
      await prisma.opposition.create({
        data: {
          name: 'Guardia Civil',
          code: 'GC',
          description:
            'Oposición a Guardia Civil - Escala de Cabos y Guardias',
        },
      });

    console.log(
      '✅ Oposición creada:',
      opposition.name,
    );
  } else {
    console.log(
      '✅ Oposición:',
      opposition.name,
    );
  }

  /* ============================================================
     CACHÉS
     ============================================================ */

  const topicCache =
    new Map<string, string>();

  const lawCache =
    new Map<string, string>();

  const articleCache =
    new Map<string, string>();

  /* ============================================================
     CONTADORES
     ============================================================ */

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  /* ============================================================
     PROCESAR FILAS
     ============================================================ */

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const statement =
      normalize(row.Pregunta);

    if (!statement) {
      skipped++;
      continue;
    }

    const a =
      normalize(row['Respuesta A']);

    const b =
      normalize(row['Respuesta B']);

    const c =
      normalize(row['Respuesta C']);

    const d =
      normalize(row['Respuesta D']);

    if (!a || !b || !c || !d) {
      console.warn(
        `⚠️ Fila ${i + 2}: faltan respuestas. Se omite.`,
      );

      skipped++;
      continue;
    }

    const topicName =
      normalize(row.Tema) ||
      'Sin tema';

    const topicCode =
      normalize(row['Código Tema']) ||
      null;

    const subtopicName =
      normalize(row.Subtema);

    const lawName =
      normalize(row.Ley);

    const lawCode =
      normalize(row['Código Ley']);

    const articleRef =
      normalize(row.Artículo);

    const articleNumber =
      normalizeArticleNumber(articleRef);

    const explanation =
      normalize(row.Explicación) ||
      null;

    const excelLegalReference =
      normalize(row['Referencia legal']);

    const legalReference =
      excelLegalReference ||
      (
        articleNumber
          ? `${lawCode || lawName} ${articleNumber}`.trim()
          : null
      );

    const difficulty =
      mapDifficulty(
        normalize(row.Dificultad),
      );

    const parsedLevel =
      Number(row.Nivel);

    const level = Math.min(
      10,
      Math.max(
        1,
        Number.isFinite(parsedLevel)
          ? parsedLevel
          : 1,
      ),
    );

    const correctIdx =
      correctIndex(
        normalize(row.Correcta),
      );

    try {
      /* ========================================================
         1. TEMA PRINCIPAL
         ======================================================== */

      const topicKey =
        `${topicCode || ''}|${normalizeForComparison(topicName)}`;

      let topicId =
        topicCache.get(topicKey);

      if (!topicId) {
        let topic =
          await prisma.topic.findFirst({
            where: {
              oppositionId:
                opposition.id,

              parentId: null,

              OR: [
                ...(topicCode
                  ? [
                      {
                        code: topicCode,
                      },
                    ]
                  : []),

                {
                  name: topicName,
                },
              ],
            },
          });

        if (!topic) {
          topic =
            await prisma.topic.create({
              data: {
                oppositionId:
                  opposition.id,

                name: topicName,

                code:
                  topicCode,

                order:
                  topicCode
                    ? parseInt(
                        topicCode.replace(
                          /\D/g,
                          '',
                        ),
                        10,
                      ) || 0
                    : 0,
              },
            });

          console.log(
            `   📚 Tema creado: ${topicCode || ''} ${topicName}`,
          );
        }

        topicId = topic.id;

        topicCache.set(
          topicKey,
          topicId,
        );
      }

      /* ========================================================
         2. SUBTEMA
         ======================================================== */

      if (subtopicName) {
        const subKey =
          `${topicId}|${normalizeForComparison(subtopicName)}`;

        let subtopicId =
          topicCache.get(subKey);

        if (!subtopicId) {
          let subtopic =
            await prisma.topic.findFirst({
              where: {
                oppositionId:
                  opposition.id,

                parentId:
                  topicId,

                name:
                  subtopicName,
              },
            });

          if (!subtopic) {
            subtopic =
              await prisma.topic.create({
                data: {
                  oppositionId:
                    opposition.id,

                  parentId:
                    topicId,

                  name:
                    subtopicName,

                  order: 0,
                },
              });

            console.log(
              `   📂 Subtema creado: ${subtopicName}`,
            );
          }

          subtopicId =
            subtopic.id;

          topicCache.set(
            subKey,
            subtopicId,
          );
        }

        topicId =
          subtopicId;
      }

      /* ========================================================
         3. LEY
         ======================================================== */

      let lawId:
        string | null = null;

      if (lawName || lawCode) {
        const lawKey =
          normalizeForComparison(
            lawCode || lawName,
          );

        lawId =
          lawCache.get(lawKey) ||
          null;

        if (!lawId) {
          let law =
            await prisma.law.findFirst({
              where: {
                OR: [
                  ...(lawCode
                    ? [
                        {
                          code: lawCode,
                        },
                      ]
                    : []),

                  ...(lawName
                    ? [
                        {
                          name: lawName,
                        },
                      ]
                    : []),

                  ...(lawCode
                    ? [
                        {
                          shortName:
                            lawCode,
                        },
                      ]
                    : []),
                ],
              },
            });

          if (!law) {
            law =
              await prisma.law.create({
                data: {
                  name:
                    lawName ||
                    lawCode,

                  shortName:
                    lawCode ||
                    null,

                  code:
                    lawCode ||
                    null,
                },
              });

            console.log(
              `   ⚖️ Ley creada: ${lawName || lawCode}`,
            );
          }

          lawId =
            law.id;

          lawCache.set(
            lawKey,
            lawId,
          );
        }
      }

      /* ========================================================
         4. ARTÍCULO
         ======================================================== */

      let articleId:
        string | null = null;

      if (
        lawId &&
        articleNumber
      ) {
        const articleKey =
          `${lawId}|${normalizeForComparison(articleNumber)}`;

        articleId =
          articleCache.get(
            articleKey,
          ) || null;

        if (!articleId) {
          let article =
            await prisma.article.findFirst({
              where: {
                lawId,
                number:
                  articleNumber,
              },
            });

          /*
           * Si no se encuentra exactamente,
           * intentamos comparar de forma normalizada.
           */

          if (!article) {
            const articles =
              await prisma.article.findMany({
                where: {
                  lawId,
                },

                select: {
                  id: true,
                  number: true,
                },
              });

            const normalizedTarget =
              normalizeForComparison(
                articleNumber,
              );

            const matchingArticle =
              articles.find(
                (candidate) =>
                  normalizeForComparison(
                    candidate.number,
                  ) ===
                  normalizedTarget,
              );

            if (matchingArticle) {
              articleId =
                matchingArticle.id;
            }
          } else {
            articleId =
              article.id;
          }

          /*
           * El Preámbulo es una parte estructural de la ley
           * y debe poder utilizarse como nivel de selección
           * dentro de IBERIAN.
           */
          if (
            !articleId &&
            lawId &&
            normalizeForComparison(
              articleNumber,
            ) === 'preambulo'
          ) {
            article =
              await prisma.article.create({
                data: {
                  lawId,
                  number: 'PREÁMBULO',
                  name: 'Preámbulo',
                  order: 0,
                },
              });

            articleId =
              article.id;

            console.log(
              `   📜 Artículo estructural creado: PREÁMBULO`,
            );
          }

          if (articleId) {
            articleCache.set(
              articleKey,
              articleId,
            );
          } else {
            console.warn(
              `⚠️ Fila ${i + 2}: no existe el artículo "${articleNumber}" para la ley "${lawName}". La pregunta se importará sin articleId.`,
            );
          }
        }
      }

      /* ========================================================
         5. BUSCAR PREGUNTA EXISTENTE
         ======================================================== */

      const existing =
        await prisma.question.findFirst({
          where: {
            oppositionId:
              opposition.id,

            statement,
          },

          select: {
            id: true,
          },
        });

      /* ========================================================
         6. ACTUALIZAR PREGUNTA EXISTENTE
         ======================================================== */

      if (existing) {
        await prisma.question.update({
          where: {
            id: existing.id,
          },

          data: {
            topicId,

            lawId,

            articleId,

            explanation,

            legalReference,

            difficulty,

            level,

            status:
              QuestionStatus.PUBLISHED,

            publishedAt:
              new Date(),
          },
        });

        updated++;

        console.log(
          `🔄 Actualizada: ${statement}`,
        );

        continue;
      }

      /* ========================================================
         7. CREAR PREGUNTA NUEVA
         ======================================================== */

      const answers = [
        {
          text: a,
          isCorrect:
            correctIdx === 0,
          order: 0,
        },

        {
          text: b,
          isCorrect:
            correctIdx === 1,
          order: 1,
        },

        {
          text: c,
          isCorrect:
            correctIdx === 2,
          order: 2,
        },

        {
          text: d,
          isCorrect:
            correctIdx === 3,
          order: 3,
        },
      ];

      await prisma.question.create({
        data: {
          oppositionId:
            opposition.id,

          topicId,

          lawId,

          articleId,

          statement,

          explanation,

          legalReference,

          difficulty,

          level,

          status:
            QuestionStatus.PUBLISHED,

          publishedAt:
            new Date(),

          answers: {
            create:
              answers,
          },
        },
      });

      created++;

      console.log(
        `✅ Creada: ${statement}`,
      );
    } catch (error: any) {
      errors++;

      console.error('');
      console.error(
        `❌ Fila ${i + 2}:`,
        error?.message || error,
      );
      console.error(
        '   Pregunta:',
        statement,
      );
    }
  }

  /* ============================================================
     RESUMEN
     ============================================================ */

  const total =
    await prisma.question.count();

  const withArticle =
    await prisma.question.count({
      where: {
        articleId: {
          not: null,
        },
      },
    });

  const withLaw =
    await prisma.question.count({
      where: {
        lawId: {
          not: null,
        },
      },
    });

  console.log('');
  console.log(
    '========================================',
  );

  console.log(
    '           IMPORTACIÓN COMPLETADA',
  );

  console.log(
    '========================================',
  );

  console.log(
    `🆕 Creadas:       ${created}`,
  );

  console.log(
    `🔄 Actualizadas:  ${updated}`,
  );

  console.log(
    `⏭️  Omitidas:      ${skipped}`,
  );

  console.log(
    `❌ Errores:       ${errors}`,
  );

  console.log(
    '----------------------------------------',
  );

  console.log(
    `📚 Total preguntas:       ${total}`,
  );

  console.log(
    `⚖️  Con ley:               ${withLaw}`,
  );

  console.log(
    `📜 Con artículo:           ${withArticle}`,
  );

  console.log(
    '========================================',
  );

  console.log('');

  console.log(
    'Las preguntas existentes NO han sido eliminadas.',
  );

  console.log(
    'Las respuestas, TestQuestion y UserAnswer existentes se han conservado.',
  );

  console.log('');
}

/* ============================================================
   EJECUCIÓN
   ============================================================ */

main()
  .catch((error) => {
    console.error('');
    console.error(
      '❌ ERROR FATAL:',
    );
    console.error(error);

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });