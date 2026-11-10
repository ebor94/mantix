// Construye xlsx en memoria para las pruebas (sin fixtures binarios en el repo).
const ExcelJS = require('exceljs');

const ENCABEZADOS_REALES = ['N.º', 'NOMBRE', 'CARGO', 'NUEMRODECELULAR', 'CORREO ELECTRONICO'];

/**
 * `filas`: arreglos de valores en el orden de `encabezados`. Un valor puede ser un objeto de exceljs
 * ({ formula, result }, { text, hyperlink }, { richText }) para probar esos tipos de celda.
 */
async function crearXlsx({ titulo = 'LISTADO MASAJES 53 BONOS', encabezados = ENCABEZADOS_REALES, filas = [], hojaPrevia = false } = {}) {
  const wb = new ExcelJS.Workbook();
  if (hojaPrevia) wb.addWorksheet('Instrucciones').addRow(['Esta hoja no es el listado']);
  const ws = wb.addWorksheet('Listado');
  if (titulo !== null) ws.addRow([titulo]);
  ws.addRow(encabezados);
  for (const f of filas) ws.addRow(f);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Fila con las columnas reales: [n, nombre, cargo, celular, correo]. */
const fila = (n, nombre, cargo, celular, correo) => [n, nombre, cargo, celular, correo];

module.exports = { crearXlsx, fila, ENCABEZADOS_REALES };
