/**
 * IMPORTADOR DE PREGUNTAS IBERIAN
 *
 * Origen:
 *   data/preguntas/*.xlsx
 *
 * Uso:
 *   npm run questions:import
 *   npm run questions:watch
 *
 * Comportamiento:
 * - Importa todos los archivos .xlsx de /data/preguntas.
 * - Procesa todas las hojas que contengan una columna "Pregunta".
 * - Ignora hojas de instrucciones o sin preguntas.
 * - Si la pregunta no existe: la crea.
 * - Si la pregunta ya existe: la actualiza.
 * - Una pregunta se considera la misma cuando coinciden:
 *      · enunciado
 *      · las 4 respuestas
 *      · respuesta correcta
 *      · y, cuando ambas tienen artículo, el artículo.
 * - Actualiza también las 4 respuestas existentes sin cambiar sus IDs.
 * - No elimina preguntas.
 * - No elimina respuestas.
 * - No modifica TestQuestion.
 * - No modifica UserAnswer.
 * - PREÁMBULO se guarda como "PREÁMBULO".
 * - Si un artículo no existe, se crea automáticamente.
 *
 * Watch:
 *   npm run questions:watch
 *
 * Al guardar cualquier Excel dentro de /data/preguntas,
 * se vuelve a importar automáticamente.
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

import * as chokidar from 'chokidar';

const prisma = new PrismaClient();

/**
 * IMPORTANTE:
 *
 * Los Excel de preguntas están dentro de:
 *
 * C:\Users\JUANS\Downloads\iberian-backend\data\preguntas
 *
 * Por eso el importador debe apuntar a:
 *
 * data/preguntas
 */
const DATA_DIR = path.join(
  process.cwd(),
  'data',
  'preguntas',
);

const WATCH_MODE =
  process.argv.includes('--watch');

const WATCH_DELAY_MS = 1500;

type GenericRow =
  Record<string, unknown>;

type ImportSummary = {
  file: string;
  sheets: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
};

type ImportTotals = {
  files: number;
  sheets: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
};

/* ============================================================
   UTILIDADES
   ============================================================ */

function normalize(
  value: unknown,
): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeForComparison(
  value: unknown,
): string {
  return normalize(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    );
}

/**
 * Obtiene una columna aunque Excel
 * haya generado diferencias de:
 *
 * Código / Codigo
 * Artículo / Articulo
 * Explicación / Explicacion
 * etc.
 */
function getField(
  row: GenericRow,
  aliases: string[],
): string {
  const normalizedAliases =
    aliases.map(
      normalizeForComparison,
    );

  for (const key of Object.keys(row)) {
    const normalizedKey =
      normalizeForComparison(key);

    if (
      normalizedAliases.includes(
        normalizedKey,
      )
    ) {
      return normalize(row[key]);
    }
  }

  return '';
}

function isMeaningfulRow(
  row: GenericRow,
): boolean {
  return Object.values(row).some(
    (value) =>
      normalize(value) !== '',
  );
}

/**
 * Convierte la dificultad del Excel
 * al enum de Prisma.
 */
function mapDifficulty(
  raw?: string,
): Difficulty {
  const value =
    normalize(raw)
      .toUpperCase()
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        '',
      );

  if (
    value === 'EASY' ||
    value === 'FACIL'
  ) {
    return Difficulty.EASY;
  }

  if (
    value === 'HARD' ||
    value === 'DIFICIL'
  ) {
    return Difficulty.HARD;
  }

  if (
    value === 'EXPERT' ||
    value === 'EXPERTO'
  ) {
    return Difficulty.EXPERT;
  }

  return Difficulty.MEDIUM;
}

/**
 * Convierte A/B/C/D o 1/2/3/4
 * en índice 0/1/2/3.
 */
function getCorrectIndex(
  value?: string,
): number | null {
  const normalized =
    normalize(value).toUpperCase();

  const map: Record<
    string,
    number
  > = {
    A: 0,
    B: 1,
    C: 2,
    D: 3,

    '1': 0,
    '2': 1,
    '3': 2,
    '4': 3,
  };

  return (
    map[normalized] ??
    null
  );
}

/**
 * Normaliza el artículo.
 *
 * Ejemplos:
 *
 * 1
 * 1.
 * Artículo 1
 * Art. 1
 * art. 1
 * 14
 * 14 bis
 * 14 ter
 * PREÁMBULO
 * Preámbulo
 *
 * Resultado:
 *
 * 1
 * 14
 * 14 bis
 * 14 ter
 * PREÁMBULO
 */
function normalizeArticleNumber(
  value?: string,
): string | null {
  const raw =
    normalize(value);

  if (!raw) {
    return null;
  }

  const normalized =
    normalizeForComparison(raw);

  if (
    normalized === 'preambulo'
  ) {
    return 'PREÁMBULO';
  }

  const match =
    raw.match(
      /(?:art[ií]culo|art\.?)?\s*([0-9]+(?:\.[0-9]+)?(?:\s*bis|\s*ter)?)\s*$/i,
    );

  if (match) {
    return normalize(
      match[1],
    );
  }

  return raw;
}

/**
 * Orden estructural de los artículos.
 *
 * PREÁMBULO = 0
 * Artículo 1 = 1
 * Artículo 2 = 2
 * etc.
 */
function getArticleOrder(
  articleNumber: string,
): number {
  if (
    normalizeForComparison(
      articleNumber,
    ) === 'preambulo'
  ) {
    return 0;
  }

  const match =
    articleNumber.match(
      /^(\d+)/,
    );

  if (!match) {
    return 999999;
  }

  return Number(
    match[1],
  );
}

/**
 * Orden del tema.
 */
function getTopicOrder(
  topicCode: string,
): number {
  const match =
    topicCode.match(
      /\d+/,
    );

  if (!match) {
    return 0;
  }

  return Number(
    match[0],
  );
}

/**
 * Comprueba si la hoja contiene
 * una columna "Pregunta".
 */
function isQuestionSheet(
  rows: GenericRow[],
): boolean {
  if (!rows.length) {
    return false;
  }

  return Object.keys(
    rows[0],
  ).some(
    (key) =>
      normalizeForComparison(
        key,
      ) === 'pregunta',
  );
}

/**
 * Obtiene todos los Excel de /data/preguntas.
 *
 * Ignora:
 * - archivos temporales de Excel ~$...
 * - archivos que no sean .xlsx
 *
 * IMPORTANTE:
 * Solo se leen archivos directamente
 * dentro de DATA_DIR.
 */
function getExcelFiles(): string[] {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(
      DATA_DIR,
      {
        recursive: true,
      },
    );
  }

  return fs
    .readdirSync(
      DATA_DIR,
      {
        withFileTypes: true,
      },
    )
    .filter(
      (entry) => {
        if (!entry.isFile()) {
          return false;
        }

        const file =
          entry.name;

        const lower =
          file.toLowerCase();

        return (
          lower.endsWith(
            '.xlsx',
          ) &&
          !file.startsWith(
            '~$',
          )
        );
      },
    )
    .map(
      (entry) =>
        entry.name,
    )
    .sort(
      (a, b) =>
        a.localeCompare(
          b,
          'es',
          {
            numeric: true,
            sensitivity:
              'base',
          },
        ),
    )
    .map(
      (file) =>
        path.join(
          DATA_DIR,
          file,
        ),
    );
}

/* ============================================================
   OPOSICIÓN
   ============================================================ */

async function getOpposition() {
  let opposition =
    await prisma.opposition.findFirst(
      {
        where: {
          OR: [
            {
              code: 'GC',
            },
            {
              name: {
                contains:
                  'Guardia',
                mode:
                  'insensitive',
              },
            },
          ],
        },
      },
    );

  if (!opposition) {
    opposition =
      await prisma.opposition.create(
        {
          data: {
            name:
              'Guardia Civil',

            code:
              'GC',

            description:
              'Oposición a Guardia Civil - Escala de Cabos y Guardias',
          },
        },
      );

    console.log(
      '✅ Oposición creada: Guardia Civil',
    );
  } else {
    console.log(
      `✅ Oposición: ${opposition.name}`,
    );
  }

  return opposition;
}

/* ============================================================
   COMPARACIÓN DE PREGUNTAS
   ============================================================ */

/**
 * Determina si una pregunta existente representa
 * exactamente la misma pregunta que la fila del Excel.
 *
 * IMPORTANTE:
 *
 * No basta con comparar el enunciado.
 *
 * Ejemplo:
 *
 * Pregunta:
 * "¿Cuál de las siguientes asociaciones es correcta?"
 *
 * Puede existir varias veces con respuestas distintas.
 *
 * Por eso se comparan:
 *
 * 1. Enunciado
 * 2. Respuesta A
 * 3. Respuesta B
 * 4. Respuesta C
 * 5. Respuesta D
 * 6. Respuesta correcta
 * 7. Artículo, cuando ambas preguntas tienen artículo.
 */
function isSameQuestion(
  existing: {
    statement: string;
    articleId: string | null;
    lawId: string | null;
    answers: Array<{
      text: string;
      isCorrect: boolean;
      order: number;
    }>;
  },
  incoming: {
    statement: string;
    answers: string[];
    correctIndex: number;
    articleId: string | null;
    lawId: string | null;
  },
): boolean {
  /*
   * 1. Comparar enunciado normalizado.
   */
  if (
    normalizeForComparison(
      existing.statement,
    ) !==
    normalizeForComparison(
      incoming.statement,
    )
  ) {
    return false;
  }

  /*
   * 2. Ordenar respuestas por posición.
   *
   * No modificamos el array original.
   */
  const existingAnswers =
    [...existing.answers]
      .sort(
        (a, b) =>
          a.order - b.order,
      );

  /*
   * Una pregunta IBERIAN válida
   * debe tener exactamente 4 respuestas.
   */
  if (
    existingAnswers.length !== 4
  ) {
    return false;
  }

  /*
   * 3. Comparar las cuatro respuestas.
   */
  for (
    let index = 0;
    index < 4;
    index++
  ) {
    const existingText =
      normalizeForComparison(
        existingAnswers[index]
          ?.text,
      );

    const incomingText =
      normalizeForComparison(
        incoming.answers[index],
      );

    if (
      existingText !==
      incomingText
    ) {
      return false;
    }
  }

  /*
   * 4. Comparar respuesta correcta.
   */
  const existingCorrectIndex =
    existingAnswers.findIndex(
      (answer) =>
        answer.isCorrect,
    );

  if (
    existingCorrectIndex !==
    incoming.correctIndex
  ) {
    return false;
  }

  /*
   * 5. Comparar artículo.
   *
   * Si ambas preguntas tienen artículo,
   * deben pertenecer al mismo artículo.
   *
   * Si una no tiene artículo, permitimos
   * reutilizarla para completar la relación
   * durante la importación.
   */
  if (
    existing.articleId &&
    incoming.articleId
  ) {
    return (
      existing.articleId ===
      incoming.articleId
    );
  }

  /*
   * Si ninguna tiene artículo,
   * comprobamos la ley cuando existe.
   */
  if (
    !existing.articleId &&
    !incoming.articleId &&
    existing.lawId &&
    incoming.lawId
  ) {
    return (
      existing.lawId ===
      incoming.lawId
    );
  }

  /*
   * Si falta una de las relaciones,
   * permitimos reutilizar la pregunta
   * para completar sus datos.
   */
  return true;
}

/* ============================================================
   IMPORTAR UN ARCHIVO
   ============================================================ */

async function importFile(
  filePath: string,
  oppositionId: string,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    file:
      path.basename(
        filePath,
      ),
    sheets: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  console.log('');
  console.log(
    '============================================================',
  );
  console.log(
    `📖 ARCHIVO: ${path.basename(filePath)}`,
  );
  console.log(
    '============================================================',
  );

  let workbook;

  try {
    workbook =
      XLSX.readFile(
        filePath,
      );
  } catch (error: any) {
    summary.errors++;

    console.error(
      `❌ No se pudo leer ${path.basename(filePath)}:`,
    );

    console.error(
      error?.message ||
        error,
    );

    return summary;
  }

  const sheetNames =
    workbook.SheetNames as string[];

  console.log(
    `📑 Hojas encontradas: ${sheetNames.length}`,
  );

  console.log(
    `   ${sheetNames.join(', ')}`,
  );

  /*
   * Cachés por archivo.
   */
  const topicCache =
    new Map<
      string,
      string
    >();

  const lawCache =
    new Map<
      string,
      string
    >();

  const articleCache =
    new Map<
      string,
      string
    >();

  let questionSheets = 0;

  /* ==========================================================
     PROCESAR TODAS LAS HOJAS
     ========================================================== */

  for (
    const sheetName of sheetNames
  ) {
    const sheet =
      workbook.Sheets[
        sheetName
      ];

    if (!sheet) {
      continue;
    }

    let rawRows: GenericRow[];

    try {
      rawRows =
        XLSX.utils.sheet_to_json(
          sheet,
          {
            defval: '',
          },
        ) as GenericRow[];
    } catch (error: any) {
      summary.errors++;

      console.error(
        `❌ Error leyendo hoja "${sheetName}":`,
        error?.message ||
          error,
      );

      continue;
    }

    const rows =
      rawRows.filter(
        isMeaningfulRow,
      );

    if (!rows.length) {
      console.log(
        `   ⏭️ Hoja "${sheetName}": vacía`,
      );

      continue;
    }

    if (
      !isQuestionSheet(
        rows,
      )
    ) {
      console.log(
        `   ⏭️ Hoja "${sheetName}": sin columna "Pregunta"`,
      );

      continue;
    }

    questionSheets++;
    summary.sheets++;

    console.log(
      `   📄 Hoja "${sheetName}": ${rows.length} filas`,
    );

    /* ========================================================
       PROCESAR FILAS
       ======================================================== */

    for (
      let i = 0;
      i < rows.length;
      i++
    ) {
      const row =
        rows[i];

      /*
       * sheet_to_json devuelve únicamente
       * las filas de datos, no la cabecera.
       *
       * Por tanto:
       * i = 0 corresponde normalmente
       * a la fila 2 de Excel.
       */
      const excelRow =
        i + 2;

      const statement =
        getField(
          row,
          ['Pregunta'],
        );

      if (!statement) {
        summary.skipped++;
        continue;
      }

      const answerA =
        getField(
          row,
          [
            'Respuesta A',
            'A',
          ],
        );

      const answerB =
        getField(
          row,
          [
            'Respuesta B',
            'B',
          ],
        );

      const answerC =
        getField(
          row,
          [
            'Respuesta C',
            'C',
          ],
        );

      const answerD =
        getField(
          row,
          [
            'Respuesta D',
            'D',
          ],
        );

      /*
       * IBERIAN requiere exactamente
       * cuatro respuestas.
       */
      if (
        !answerA ||
        !answerB ||
        !answerC ||
        !answerD
      ) {
        console.warn(
          `⚠️ ${sheetName} fila ${excelRow}: faltan respuestas. Se omite.`,
        );

        summary.skipped++;
        continue;
      }

      const correctRaw =
        getField(
          row,
          [
            'Correcta',
            'Respuesta correcta',
          ],
        );

      const correctIndex =
        getCorrectIndex(
          correctRaw,
        );

      if (
        correctIndex === null
      ) {
        console.warn(
          `⚠️ ${sheetName} fila ${excelRow}: "Correcta" debe ser A, B, C o D. Valor recibido: "${correctRaw}". Se omite.`,
        );

        summary.skipped++;
        continue;
      }

      /* ======================================================
         DATOS DEL EXCEL
         ====================================================== */

      const topicName =
        getField(
          row,
          ['Tema'],
        ) ||
        'Sin tema';

      const topicCode =
        getField(
          row,
          [
            'Código Tema',
            'Codigo Tema',
          ],
        );

      const subtopicName =
        getField(
          row,
          ['Subtema'],
        );

      const lawName =
        getField(
          row,
          ['Ley'],
        );

      const lawCode =
        getField(
          row,
          [
            'Código Ley',
            'Codigo Ley',
          ],
        );

      const articleRef =
        getField(
          row,
          [
            'Artículo',
            'Articulo',
          ],
        );

      const articleNumber =
        normalizeArticleNumber(
          articleRef,
        );

      const explanation =
        getField(
          row,
          [
            'Explicación',
            'Explicacion',
          ],
        ) || null;

      const excelLegalReference =
        getField(
          row,
          [
            'Referencia legal',
            'Referencia',
          ],
        );

      const difficulty =
        mapDifficulty(
          getField(
            row,
            ['Dificultad'],
          ),
        );

      const rawLevel =
        getField(
          row,
          ['Nivel'],
        );

      const parsedLevel =
        Number(
          rawLevel,
        );

      const level = Math.min(
        10,
        Math.max(
          1,
          Number.isFinite(
            parsedLevel,
          )
            ? parsedLevel
            : 1,
        ),
      );

      const legalReference =
        excelLegalReference ||
        (
          articleNumber &&
          (lawCode ||
            lawName)
            ? `${lawCode || lawName} ${articleNumber}`.trim()
            : null
        );

      try {
        /* ====================================================
           1. TEMA
           ==================================================== */

        const topicKey =
          `${topicCode}|${normalizeForComparison(
            topicName,
          )}`;

        let topicId =
          topicCache.get(
            topicKey,
          );

        if (!topicId) {
          let topic =
            await prisma.topic.findFirst(
              {
                where: {
                  oppositionId,

                  parentId:
                    null,

                  OR: [
                    ...(topicCode
                      ? [
                          {
                            code:
                              topicCode,
                          },
                        ]
                      : []),

                    {
                      name:
                        topicName,
                    },
                  ],
                },
              },
            );

          if (!topic) {
            topic =
              await prisma.topic.create(
                {
                  data: {
                    oppositionId,

                    name:
                      topicName,

                    code:
                      topicCode ||
                      null,

                    order:
                      getTopicOrder(
                        topicCode,
                      ),
                  },
                },
              );

            console.log(
              `   📚 Tema creado: ${
                topicCode
                  ? `${topicCode} `
                  : ''
              }${topicName}`,
            );
          }

          topicId =
            topic.id;

          topicCache.set(
            topicKey,
            topicId,
          );
        }

        /* ====================================================
           2. SUBTEMA
           ==================================================== */

        if (
          subtopicName
        ) {
          const subKey =
            `${topicId}|${normalizeForComparison(
              subtopicName,
            )}`;

          let subtopicId =
            topicCache.get(
              subKey,
            );

          if (!subtopicId) {
            let subtopic =
              await prisma.topic.findFirst(
                {
                  where: {
                    oppositionId,

                    parentId:
                      topicId,

                    name:
                      subtopicName,
                  },
                },
              );

            if (!subtopic) {
              subtopic =
                await prisma.topic.create(
                  {
                    data: {
                      oppositionId,

                      parentId:
                        topicId,

                      name:
                        subtopicName,

                      order:
                        0,
                    },
                  },
                );

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

          /*
           * La pregunta queda vinculada
           * al subtema.
           */
          topicId =
            subtopicId;
        }

        /* ====================================================
           3. LEY
           ==================================================== */

        let lawId:
          | string
          | null = null;

        if (
          lawName ||
          lawCode
        ) {
          const lawKey =
            normalizeForComparison(
              lawCode ||
                lawName,
            );

          lawId =
            lawCache.get(
              lawKey,
            ) || null;

          if (!lawId) {
            let law =
              await prisma.law.findFirst(
                {
                  where: {
                    OR: [
                      ...(lawCode
                        ? [
                            {
                              code:
                                lawCode,
                            },
                          ]
                        : []),

                      ...(lawName
                        ? [
                            {
                              name:
                                lawName,
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
                },
              );

            if (!law) {
              law =
                await prisma.law.create(
                  {
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
                  },
                );

              console.log(
                `   ⚖️ Ley creada: ${
                  lawName ||
                  lawCode
                }`,
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

        /* ====================================================
           4. ARTÍCULO
           ==================================================== */

        let articleId:
          | string
          | null = null;

        if (
          lawId &&
          articleNumber
        ) {
          const articleKey =
            `${lawId}|${normalizeForComparison(
              articleNumber,
            )}`;

          articleId =
            articleCache.get(
              articleKey,
            ) || null;

          if (!articleId) {
            let article =
              await prisma.article.findFirst(
                {
                  where: {
                    lawId,

                    number:
                      articleNumber,
                  },
                },
              );

            /*
             * Si no existe exactamente,
             * buscamos normalizado.
             */
            if (!article) {
              const articles =
                await prisma.article.findMany(
                  {
                    where: {
                      lawId,
                    },

                    select: {
                      id: true,
                      number:
                        true,
                    },
                  },
                );

              const normalizedTarget =
                normalizeForComparison(
                  articleNumber,
                );

              const matchingArticle =
                articles.find(
                  (
                    candidate,
                  ) =>
                    normalizeForComparison(
                      candidate.number,
                    ) ===
                    normalizedTarget,
                );

              if (
                matchingArticle
              ) {
                articleId =
                  matchingArticle.id;
              }
            } else {
              articleId =
                article.id;
            }

            /*
             * Si el artículo no existe,
             * se crea automáticamente.
             */
            if (!articleId) {
              const isPreamble =
                normalizeForComparison(
                  articleNumber,
                ) ===
                'preambulo';

              const articleNumberToStore =
                isPreamble
                  ? 'PREÁMBULO'
                  : articleNumber;

              const articleName =
                isPreamble
                  ? 'Preámbulo'
                  : `Artículo ${articleNumber}`;

              /*
               * Segunda comprobación antes de crear.
               *
               * Esto evita problemas si el mismo artículo
               * aparece varias veces durante una importación.
               */
              article =
                await prisma.article.findFirst(
                  {
                    where: {
                      lawId,

                      number:
                        articleNumberToStore,
                    },
                  },
                );

              if (!article) {
                article =
                  await prisma.article.create(
                    {
                      data: {
                        lawId,

                        number:
                          articleNumberToStore,

                        name:
                          articleName,

                        order:
                          getArticleOrder(
                            articleNumber,
                          ),
                      },
                    },
                  );

                console.log(
                  `   📜 Artículo creado: ${article.number}`,
                );
              }

              articleId =
                article.id;
            }

            articleCache.set(
              articleKey,
              articleId,
            );
          }
        }

        /* ====================================================
           5. BUSCAR PREGUNTA EXISTENTE
           ==================================================== */

        /*
         * ANTES:
         *
         * Se buscaba únicamente por:
         *
         *   oppositionId + statement
         *
         * Eso provocaba que varias preguntas con el mismo
         * enunciado pero respuestas diferentes se mezclasen.
         *
         * AHORA:
         *
         * Primero obtenemos las preguntas con el mismo
         * enunciado y después comparamos:
         *
         *   - enunciado
         *   - respuesta A
         *   - respuesta B
         *   - respuesta C
         *   - respuesta D
         *   - correcta
         *   - artículo cuando corresponde
         *
         * Así se pueden conservar variantes legítimas.
         */
        const existingCandidates =
          await prisma.question.findMany(
            {
              where: {
                oppositionId,

                statement,
              },

              include: {
                answers: {
                  orderBy: {
                    order:
                      'asc',
                  },
                },
              },
            },
          );

        const incomingAnswers = [
          answerA,
          answerB,
          answerC,
          answerD,
        ];

        const existing =
          existingCandidates.find(
            (candidate) =>
              isSameQuestion(
                candidate,
                {
                  statement,
                  answers:
                    incomingAnswers,
                  correctIndex,
                  articleId,
                  lawId,
                },
              ),
          );

        /* ====================================================
           6. ACTUALIZAR PREGUNTA
           ==================================================== */

        if (existing) {
          await prisma.question.update(
            {
              where: {
                id:
                  existing.id,
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
                  existing.publishedAt ||
                  new Date(),
              },
            },
          );

          /*
           * Actualizamos las respuestas existentes
           * sin borrar sus IDs.
           */
          const answerTexts = [
            answerA,
            answerB,
            answerC,
            answerD,
          ];

          for (
            let answerIndex = 0;
            answerIndex < 4;
            answerIndex++
          ) {
            const answer =
              existing.answers.find(
                (
                  item,
                ) =>
                  item.order ===
                  answerIndex,
              );

            if (answer) {
              await prisma.answer.update(
                {
                  where: {
                    id:
                      answer.id,
                  },

                  data: {
                    text:
                      answerTexts[
                        answerIndex
                      ],

                    isCorrect:
                      correctIndex ===
                      answerIndex,

                    order:
                      answerIndex,
                  },
                },
              );
            } else {
              /*
               * Si por algún motivo la pregunta
               * no tenía una de las cuatro respuestas,
               * la creamos.
               */
              await prisma.answer.create(
                {
                  data: {
                    questionId:
                      existing.id,

                    text:
                      answerTexts[
                        answerIndex
                      ],

                    isCorrect:
                      correctIndex ===
                      answerIndex,

                    order:
                      answerIndex,
                  },
                },
              );
            }
          }

          summary.updated++;

          console.log(
            `🔄 Actualizada: ${statement}`,
          );

          continue;
        }

        /* ====================================================
           7. CREAR PREGUNTA NUEVA
           ==================================================== */

        const answers = [
          {
            text:
              answerA,

            isCorrect:
              correctIndex ===
              0,

            order:
              0,
          },

          {
            text:
              answerB,

            isCorrect:
              correctIndex ===
              1,

            order:
              1,
          },

          {
            text:
              answerC,

            isCorrect:
              correctIndex ===
              2,

            order:
              2,
          },

          {
            text:
              answerD,

            isCorrect:
              correctIndex ===
              3,

            order:
              3,
          },
        ];

        await prisma.question.create(
          {
            data: {
              oppositionId,

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
          },
        );

        summary.created++;

        console.log(
          `✅ Creada: ${statement}`,
        );
      } catch (error: any) {
        summary.errors++;

        console.error('');
        console.error(
          `❌ ${sheetName} fila ${excelRow}:`,
        );

        console.error(
          error?.message ||
            error,
        );

        console.error(
          '   Pregunta:',
          statement,
        );
      }
    }
  }

  if (
    questionSheets === 0
  ) {
    console.log(
      `   ⚠️ No se encontraron hojas de preguntas en ${path.basename(
        filePath,
      )}`,
    );
  }

  return summary;
}

/* ============================================================
   RESUMEN BASE DE DATOS
   ============================================================ */

async function printDatabaseSummary() {
  const total =
    await prisma.question.count();

  const withArticle =
    await prisma.question.count(
      {
        where: {
          articleId: {
            not: null,
          },
        },
      },
    );

  const withLaw =
    await prisma.question.count(
      {
        where: {
          lawId: {
            not: null,
          },
        },
      },
    );

  const totalTopics =
    await prisma.topic.count();

  const totalLaws =
    await prisma.law.count();

  const totalArticles =
    await prisma.article.count();

  console.log('');
  console.log(
    '============================================================',
  );
  console.log(
    '              RESUMEN BASE DE DATOS',
  );
  console.log(
    '============================================================',
  );

  console.log(
    `📚 Total preguntas: ${total}`,
  );

  console.log(
    `⚖️  Preguntas con ley: ${withLaw}`,
  );

  console.log(
    `📜 Preguntas con artículo: ${withArticle}`,
  );

  console.log(
    `📚 Temas/subtemas: ${totalTopics}`,
  );

  console.log(
    `⚖️  Leyes: ${totalLaws}`,
  );

  console.log(
    `📜 Artículos: ${totalArticles}`,
  );

  console.log(
    '------------------------------------------------------------',
  );

  console.log(
    'Las preguntas existentes NO se eliminan.',
  );

  console.log(
    'Las respuestas existentes NO se eliminan.',
  );

  console.log(
    'Los IDs de las respuestas existentes se conservan.',
  );

  console.log(
    'TestQuestion y UserAnswer NO se modifican.',
  );

  console.log(
    '============================================================',
  );

  console.log('');
}

/* ============================================================
   IMPORTAR TODOS LOS EXCEL
   ============================================================ */

async function importAllFiles() {
  const files =
    getExcelFiles();

  if (!files.length) {
    console.error('');
    console.error(
      `❌ No hay archivos .xlsx en: ${DATA_DIR}`,
    );
    console.error('');
    return;
  }

  console.log('');
  console.log(
    '============================================================',
  );
  console.log(
    '             IBERIAN - IMPORTADOR EXCEL',
  );
  console.log(
    '============================================================',
  );

  console.log(
    `📁 Carpeta: ${DATA_DIR}`,
  );

  console.log(
    `📦 Archivos Excel encontrados: ${files.length}`,
  );

  console.log('');

  const opposition =
    await getOpposition();

  const totals: ImportTotals = {
    files:
      files.length,

    sheets:
      0,

    created:
      0,

    updated:
      0,

    skipped:
      0,

    errors:
      0,
  };

  for (
    const filePath of files
  ) {
    try {
      const summary =
        await importFile(
          filePath,
          opposition.id,
        );

      totals.sheets +=
        summary.sheets;

      totals.created +=
        summary.created;

      totals.updated +=
        summary.updated;

      totals.skipped +=
        summary.skipped;

      totals.errors +=
        summary.errors;
    } catch (error: any) {
      totals.errors++;

      console.error('');
      console.error(
        `❌ ERROR EN ARCHIVO ${path.basename(
          filePath,
        )}:`,
      );

      console.error(
        error?.message ||
          error,
      );
    }
  }

  await printDatabaseSummary();

  console.log(
    `📦 Archivos procesados: ${totals.files}`,
  );

  console.log(
    `📄 Hojas de preguntas procesadas: ${totals.sheets}`,
  );

  console.log(
    `🆕 Preguntas creadas: ${totals.created}`,
  );

  console.log(
    `🔄 Preguntas actualizadas: ${totals.updated}`,
  );

  console.log(
    `⏭️ Filas omitidas: ${totals.skipped}`,
  );

  console.log(
    `❌ Errores: ${totals.errors}`,
  );

  console.log('');
}

/* ============================================================
   WATCH
   ============================================================ */

function startWatcher() {
  console.log('');
  console.log(
    '============================================================',
  );
  console.log(
    '              IBERIAN - MODO WATCH',
  );
  console.log(
    '============================================================',
  );

  console.log(
    `👀 Vigilando: ${DATA_DIR}`,
  );

  console.log(
    '📝 Cuando guardes un .xlsx, se volverá a importar automáticamente.',
  );

  console.log(
    '⏹️  Pulsa Ctrl+C para detener.',
  );

  console.log('');

  let timer:
    NodeJS.Timeout | null =
    null;

  let importing =
    false;

  let pendingImport =
    false;

  const scheduleImport =
    () => {
      if (timer) {
        clearTimeout(
          timer,
        );
      }

      timer =
        setTimeout(
          () => {
            timer =
              null;

            void runImport();
          },
          WATCH_DELAY_MS,
        );
    };

  const runImport =
    async () => {
      if (importing) {
        pendingImport =
          true;

        return;
      }

      importing =
        true;

      try {
        await importAllFiles();
      } catch (error) {
        console.error('');
        console.error(
          '❌ Error durante la importación automática:',
        );

        console.error(
          error,
        );
      } finally {
        importing =
          false;

        if (
          pendingImport
        ) {
          pendingImport =
            false;

          scheduleImport();
        }
      }
    };

  /*
   * IMPORTANTE:
   *
   * Chokidar 4 eliminó el soporte
   * para determinados patrones glob.
   *
   * Por eso vigilamos directamente
   * la carpeta DATA_DIR y filtramos
   * los .xlsx mediante los eventos.
   */
  const watcher =
    chokidar.watch(
      DATA_DIR,
      {
        ignoreInitial:
          true,

        awaitWriteFinish: {
          stabilityThreshold:
            1000,

          pollInterval:
            100,
        },
      },
    );

  const isExcelFile =
    (filePath: string) => {
      const fileName =
        path.basename(
          filePath,
        );

      return (
        fileName
          .toLowerCase()
          .endsWith(
            '.xlsx',
          ) &&
        !fileName.startsWith(
          '~$',
        )
      );
    };

  watcher.on(
    'add',
    (filePath) => {
      if (
        !isExcelFile(
          filePath,
        )
      ) {
        return;
      }

      console.log('');
      console.log(
        `📥 Excel añadido: ${path.basename(
          filePath,
        )}`,
      );

      scheduleImport();
    },
  );

  watcher.on(
    'change',
    (filePath) => {
      if (
        !isExcelFile(
          filePath,
        )
      ) {
        return;
      }

      console.log('');
      console.log(
        `✏️ Excel modificado: ${path.basename(
          filePath,
        )}`,
      );

      scheduleImport();
    },
  );

  watcher.on(
    'unlink',
    (filePath) => {
      if (
        !isExcelFile(
          filePath,
        )
      ) {
        return;
      }

      console.log('');
      console.log(
        `🗑️ Excel eliminado: ${path.basename(
          filePath,
        )}`,
      );

      /*
       * Eliminar un Excel NO elimina
       * preguntas de la base de datos.
       *
       * El importador es no destructivo.
       */
    },
  );

  watcher.on(
    'error',
    (error) => {
      console.error(
        '❌ Error del watcher:',
        error,
      );
    },
  );

  const shutdown =
    async () => {
      console.log('');
      console.log(
        '⏹️ Deteniendo watcher...',
      );

      if (timer) {
        clearTimeout(
          timer,
        );
      }

      await watcher.close();

      await prisma.$disconnect();

      process.exit(0);
    };

  process.once(
    'SIGINT',
    () => {
      void shutdown();
    },
  );

  process.once(
    'SIGTERM',
    () => {
      void shutdown();
    },
  );
}

/* ============================================================
   EJECUCIÓN
   ============================================================ */

async function main() {
  await importAllFiles();

  if (WATCH_MODE) {
    startWatcher();

    /*
     * En modo watch mantenemos
     * Prisma conectado.
     */
    return;
  }

  await prisma.$disconnect();
}

main().catch(
  async (error) => {
    console.error('');
    console.error(
      '❌ ERROR FATAL:',
    );

    console.error(
      error,
    );

    await prisma.$disconnect();

    process.exit(1);
  },
);
