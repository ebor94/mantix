// src/porteria/repositorios/estado.js
// por_estado_vehiculo: dónde está cada placa ahora. Tabla derivada de por_eventos, escrita en la misma
// transacción que cada evento. Una fila con ultimo_evento_id NULL y sin sembrado_at es provisional (solo existe para bloquear);
// con sembrado_at es una carga inicial (sembrado_sede_id = sede donde se sembró). Si se anula el último evento de un
// sembrado, la fila vuelve a su siembra (restaurarSiembra) en vez de borrarse.
const { COLUMNAS_EVENTO, eventoPublico } = require('./eventos');

const COLUMNAS_ESTADO = 'placa, tipo_vehiculo, sede_id, dentro, ultimo_evento_id, salida_abierta_id, sembrado_at, sembrado_sede_id';
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

/** Devuelve un propio sembrado a su carga inicial (dentro de la sede donde se sembró). No hace nada si no fue sembrado. */
async function restaurarSiembra(conn, placa) {
  await conn.query(
    `UPDATE por_estado_vehiculo
        SET tipo_vehiculo = 'PROPIO', sede_id = sembrado_sede_id, dentro = 1, ultimo_evento_id = NULL, salida_abierta_id = NULL
      WHERE placa = ? AND sembrado_at IS NOT NULL AND sembrado_sede_id IS NOT NULL`,
    [placa],
  );
}

async function borrar(conn, placa) {
  await conn.query('DELETE FROM por_estado_vehiculo WHERE placa = ?', [placa]);
}

/** Carga inicial de un propio dentro de una sede. false si la placa ya tenía estado (nunca se pisa). */
async function sembrar(conn, { placa, sedeId }) {
  try {
    await conn.query(
      `INSERT INTO por_estado_vehiculo (placa, tipo_vehiculo, sede_id, dentro, sembrado_at, sembrado_sede_id)
       VALUES (?, 'PROPIO', ?, 1, NOW(), ?)`,
      [placa, sedeId, sedeId],
    );
    return true;
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') return false;
    throw err;
  }
}

async function obtener(ejecutor, placa) {
  const [[fila]] = await ejecutor.query(
    `SELECT s.placa, s.tipo_vehiculo, s.sede_id, s.dentro, s.ultimo_evento_id, s.salida_abierta_id, s.sembrado_at,
            COALESCE(e.registrado_at, s.sembrado_at) AS desde
       FROM por_estado_vehiculo s LEFT JOIN por_eventos e ON e.id = s.ultimo_evento_id
      WHERE s.placa = ? AND (s.ultimo_evento_id IS NOT NULL OR s.sembrado_at IS NOT NULL)`,
    [placa],
  );
  return fila || null;
}

async function dentroDeSede(ejecutor, sedeId) {
  const [conEvento] = await ejecutor.query(
    `SELECT ${COLUMNAS_EVENTO} ${DESDE_ULTIMO_EVENTO} WHERE s.sede_id = ? AND s.dentro = 1`, [sedeId],
  );
  const [sembrados] = await ejecutor.query(
    `SELECT placa, sede_id, sembrado_at FROM por_estado_vehiculo
      WHERE sede_id = ? AND dentro = 1 AND ultimo_evento_id IS NULL AND sembrado_at IS NOT NULL`,
    [sedeId],
  );
  return [
    ...conEvento.map((f) => ({ ...eventoPublico(f), carga_inicial: false })),
    ...sembrados.map((s) => ({
      id: null, placa: s.placa, tipo_vehiculo: 'PROPIO', sede_id: s.sede_id, sentido: null, motivo: null,
      registrado_at: s.sembrado_at, carga_inicial: true,
    })),
  ].sort((a, b) => b.registrado_at - a.registrado_at);
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

module.exports = { bloquear, guardar, borrar, restaurarSiembra, sembrar, obtener, dentroDeSede, propiosFuera };
