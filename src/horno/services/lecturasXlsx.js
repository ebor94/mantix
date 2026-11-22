// Excel de lecturas en streaming (no arma el libro completo en memoria).
const ExcelJS = require('exceljs');
const { VARIABLES } = require('./lecturas.service');

const columnas = () => [
  { header: 'Fecha y hora', key: 'registrado_en', width: 20 },
  ...VARIABLES.map((v) => ({
    header: v.unidad ? `${v.etiqueta} (${v.unidad})` : v.etiqueta,
    key: v.campo,
    width: 20,
    style: { numFmt: `0.${'0'.repeat(v.decimales)}` },
  })),
];

async function escribirLecturasXlsx(stream, filas) {
  const libro = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
  const hoja = libro.addWorksheet('Lecturas', { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = columnas();
  hoja.getRow(1).font = { bold: true };
  for (const f of filas) hoja.addRow(f).commit();
  hoja.commit();
  await libro.commit();
}

module.exports = { escribirLecturasXlsx };
