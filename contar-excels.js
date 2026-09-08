const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const dir = "C:\\Users\\JUANS\\Downloads";

const files = fs.readdirSync(dir)
  .filter(f => f.startsWith("IBERIAN_Plantilla_Preguntas") && f.endsWith(".xlsx"))
  .sort();

for (const file of files) {
  const fullPath = path.join(dir, file);

  try {
    const wb = XLSX.readFile(fullPath);

    let totalQuestions = 0;

    for (const sheet of wb.SheetNames) {
      const ws = wb.Sheets[sheet];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (rows.length === 0) continue;

      const headers = rows[0];
      const preguntaIndex = headers.indexOf("Pregunta");

      if (preguntaIndex === -1) continue;

      const questions = rows
        .slice(1)
        .filter(row => row[preguntaIndex] && String(row[preguntaIndex]).trim());

      totalQuestions += questions.length;
    }

    console.log(`${file} -> ${totalQuestions} preguntas`);
  } catch (error) {
    console.log(`${file} -> ERROR: ${error.message}`);
  }
}
