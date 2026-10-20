const ExcelJS = require('exceljs');
const { QueryTypes } = require('sequelize');
const db = require('../../models');
const { rankingEnVivo } = require('./rankingDatos.service');

const encabezadoEnNegrita = (hoja) => { hoja.getRow(1).font = { bold: true }; hoja.views = [{ state: 'frozen', ySplit: 1 }]; };

async function generarResultadosXlsx() {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'TRIKIPELUDOS';
  const categorias = await db.TrkCategoria.findAll({ order: [['orden', 'ASC']] });

  for (const categoria of categorias) {
    const ranking = await rankingEnVivo(categoria.id);
    const hoja = libro.addWorksheet(categoria.codigo);
    hoja.addRow(['Puesto', 'Mascota', 'Disfraz', 'Puntaje final', ...ranking.criterios.map((c) => c.nombre), 'Calificaciones', 'Estado', 'Premiado', 'Empate sin resolver']);
    for (const f of ranking.filas) {
      hoja.addRow([
        f.puesto, f.mascota_nombre, f.participante ? f.participante.disfraz_nombre : null, f.puntaje_final,
        ...ranking.criterios.map((c) => f.promedios[c.codigo]),
        `${f.n_calificaciones}/${f.n_jurados}`, f.completa ? 'Completa' : 'Incompleta', f.premiado ? 'Sí' : 'No', f.empate_sin_resolver ? 'Sí' : 'No'
      ]);
    }
    encabezadoEnNegrita(hoja);
  }

  const detalle = libro.addWorksheet('Detalle');
  detalle.addRow(['Categoría', 'Mascota', 'Jurado', 'Criterio', 'Puntaje', 'Total del jurado', 'Enviada']);
  const filas = await db.sequelize.query(
    `SELECT c.codigo AS categoria, v.mascota_nombre, v.jurado_nombre, v.criterio_nombre, v.puntaje, v.total, v.enviada_at
       FROM trk_vw_calificacion_totales v JOIN trk_categorias c ON c.id = v.categoria_id
      ORDER BY c.orden, v.mascota_nombre, v.jurado_nombre, v.criterio_orden`,
    { type: QueryTypes.SELECT }
  );
  for (const f of filas) detalle.addRow([f.categoria, f.mascota_nombre, f.jurado_nombre, f.criterio_nombre, f.puntaje, f.total, f.enviada_at]);
  encabezadoEnNegrita(detalle);

  return Buffer.from(await libro.xlsx.writeBuffer());
}

module.exports = { generarResultadosXlsx };
