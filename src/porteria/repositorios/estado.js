// src/porteria/repositorios/estado.js
// por_estado_vehiculo: dónde está cada placa ahora. Tabla derivada de por_eventos, escrita en la misma
// transacción que cada evento. Una fila con ultimo_evento_id NULL es provisional (solo existe para bloquear).
const { COLUMNAS_EVENTO, eventoPublico } = require('./eventos');

const COLUMNAS_ESTADO = 'placa, tipo_vehiculo, sede_id, dentro, ultimo_evento_id, salida_abierta_id';
const DESDE_ULTIMO_EVENTO = `
  FROM por_estado_vehiculo s
  JOIN por_eventos e ON e.id = s.ultimo_evento_id
  JOIN por_motivos m ON m.id = e.motivo_id`;

/** Crea la fila provisional si no existe y la bloquea hasta el fin de la transacción. */
async function bloquear(conn, placa) {
  await conn.query(
    'INSERT INTO por_estado_vehiculo (placa, dentro) VALUES (?, 0) ON DUPLICATE KEY UPDATE placa = placa', [placa],
  );
  const [[fila]] = await conn.query(`SELECT ${COLUMNAS_ESTADO} FROM por_estado_vehiculo WHERE placa = ? FOR UPDATE`, [placa]);
  return fila;
}

async function guardar(conn, { placa, tipo_vehiculo, sede_id, dentro, ultimo_evento_id, salida_abierta_id }) {
  await conn.query(
    `UPDATE por_estado_vehiculo SET tipo_vehiculo = ?, sede_id = ?, dentro = ?, ultimo_evento_id = ?, salida_abierta_id = ?
      WHERE placa = ?`,
    [tipo_vehiculo, sede_id, dentro, ultimo_evento_id, salida_abierta_id, placa],
  );
}

async function borrar(conn, placa) {
  await conn.query('DELETE FROM por_estado_vehiculo WHERE placa = ?', [placa]);
}

async function obtener(ejecutor, placa) {
  const [[fila]] = await ejecutor.query(
    `SELECT s.placa, s.tipo_vehiculo, s.sede_id, s.dentro, s.ultimo_evento_id, s.salida_abierta_id, e.registrado_at AS desde
       FROM por_estado_vehiculo s JOIN por_eventos e ON e.id = s.ultimo_evento_id
      WHERE s.placa = ?`,
    [placa],
  );
  return fila || null;
}

async function dentroDeSede(ejecutor, sedeId) {
  const [filas] = await ejecutor.query(
    `SELECT ${COLUMNAS_EVENTO} ${DESDE_ULTIMO_EVENTO} WHERE s.sede_id = ? AND s.dentro = 1 ORDER BY e.registrado_at DESC`,
    [sedeId],
  );
  return filas.map(eventoPublico);
}

/** Propios fuera (los que llevan más tiempo, primero). `sedeId` = sede por la que salieron; null = todas. */
async function propiosFuera(ejecutor, sedeId) {
  const filtro = sedeId ? 'AND s.sede_id = ?' : '';
  const [filas] = await ejecutor.query(
    `SELECT ${COLUMNAS_EVENTO} ${DESDE_ULTIMO_EVENTO}
      WHERE s.dentro = 0 AND s.tipo_vehiculo = 'PROPIO' ${filtro} ORDER BY e.registrado_at ASC`,
    sedeId ? [sedeId] : [],
  );
  return filas.map(eventoPublico);
}

module.exports = { bloquear, guardar, borrar, obtener, dentroDeSede, propiosFuera };
