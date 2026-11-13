// Exportaciones del panel: Excel para certificados y ZIP de fotos para el homenaje.
const fs = require('fs');
const ExcelJS = require('exceljs');
const archiver = require('archiver');
const { formatearFechaColombia } = require('../dominio/fechaColombia');

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
      i.utm_source, i.utm_medium, i.utm_campaign, i.utm_content,
      formatearFechaColombia(i.created_at), // texto: ExcelJS serializa los Date en UTC
    ]);
  }
  return Buffer.from(await libro.xlsx.writeBuffer());
}

/**
 * Escribe en `salida` un ZIP con las entradas { ruta, nombre } cuyo archivo exista. Si la salida se
 * cierra antes de terminar (el cliente cortó la descarga), aborta el ZIP para soltar archivos y memoria
 * y resuelve sin error: no hay a quién responder.
 */
function escribirZip(salida, entradas) {
  return new Promise((ok, mal) => {
    const zip = archiver('zip', { zlib: { level: 1 } }); // los JPG ya están comprimidos
    let listo = false;
    const terminar = (fn, valor) => { if (!listo) { listo = true; fn(valor); } };
    zip.on('error', (err) => terminar(mal, err));
    salida.on('finish', () => terminar(ok));
    salida.on('close', () => {
      if (listo) return;
      zip.abort();
      terminar(ok);
    });
    zip.pipe(salida);
    for (const { ruta, nombre } of entradas) {
      if (ruta && fs.existsSync(ruta)) zip.file(ruta, { name: nombre });
    }
    zip.finalize();
  });
}

module.exports = { libroExcel, escribirZip };
