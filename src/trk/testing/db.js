// Limpieza entre pruebas de integración. Usa una transacción para fijar la conexión
// (FOREIGN_KEY_CHECKS es por sesión).
const db = require('../../models');

const TABLAS_DATOS = [
  'trk_calificacion_detalle',
  'trk_calificaciones',
  'trk_auditoria',
  'trk_importaciones',
  'trk_ranking_snapshots',
  'trk_accesos',
  'trk_participantes'
];

async function existe(tabla, transaction) {
  const [filas] = await db.sequelize.query(
    'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    { replacements: [tabla], transaction }
  );
  return Number(filas[0].n) > 0;
}

async function limpiar() {
  await db.sequelize.transaction(async (transaction) => {
    const q = (sql) => db.sequelize.query(sql, { transaction });
    await q('SET FOREIGN_KEY_CHECKS = 0');
    for (const tabla of TABLAS_DATOS) {
      if (await existe(tabla, transaction)) await q(`DELETE FROM ${tabla}`);
    }
    if (await existe('trk_evento_estado', transaction)) {
      await q("UPDATE trk_evento_estado SET participante_en_pasarela_id = NULL, modo_pantalla = 'PASARELA', categoria_pantalla_id = NULL");
    }
    if (await existe('trk_categorias', transaction)) {
      await q('UPDATE trk_categorias SET abierta = 1, ranking_publicado = 0, puestos_premiados = 3');
    }
    await q("DELETE FROM usuarios WHERE email LIKE '%@trikipeludos.local' OR email LIKE '%@prueba.test'");
    await q('SET FOREIGN_KEY_CHECKS = 1');
  });
}

async function cerrar() {
  await db.sequelize.close();
}

module.exports = { limpiar, cerrar };
