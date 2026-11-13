// Exportaciones del panel: Excel para certificados y ZIP de fotos para el homenaje.
const fs = require('fs');
const ExcelJS = require('exceljs');
const archiver = require('archiver');

const COLUMNAS = [
  ['Nombre completo', 34], ['Cédula', 14], ['Celular', 14], ['Correo', 32], ['Honra a un compañero', 20],
  ['Compañero 1', 20], ['Compañero 2', 20], ['Compañero 3', 20], ['Correo enviado', 14],
  ['utm_source', 16], ['utm_medium', 16], ['utm_campaign', 20], ['utm_content', 20], ['Fecha de inscripción', 20],
];

const siNo = (v) => (v ? 'Sí' : 'No');

async function libroExcel(inscripciones) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Inscritos');
  hoja.columns = COLUMNAS.map(([header, width]) => ({ header, width }));
  hoja.getRow(1).font = { bold: true };
  for (const i of inscripciones) {
    const nombres = [1, 2, 3].map((orden) => (i.companeros.find((c) => c.orden === orden) || {}).nombre);
    hoja.addRow([
      i.nombre_completo, String(i.cedula), String(i.celular), i.correo, siNo(i.honra_companero),
      ...nombres, siNo(i.correo_enviado),
      i.utm_source, i.utm_medium, i.utm_campaign, i.utm_content, i.created_at,
    ]);
  }
  hoja.getColumn(14).numFmt = 'yyyy-mm-dd hh:mm';
  return Buffer.from(await libro.xlsx.writeBuffer());
}

/** Escribe en `salida` un ZIP con las entradas { ruta, nombre } cuyo archivo exista. */
function escribirZip(salida, entradas) {
  return new Promise((ok, mal) => {
    const zip = archiver('zip', { zlib: { level: 1 } }); // los JPG ya están comprimidos
    zip.on('error', mal);
    salida.on('finish', ok);
    zip.pipe(salida);
    for (const { ruta, nombre } of entradas) {
      if (ruta && fs.existsSync(ruta)) zip.file(ruta, { name: nombre });
    }
    zip.finalize();
  });
}

module.exports = { libroExcel, escribirZip };
