// src/masajes/repositorios/semanas.js
// fecha_inicio sale como texto YYYY-MM-DD (DATE_FORMAT): así no depende de cómo mysql2 convierta un DATE a Date.
const COLUMNAS = "id, DATE_FORMAT(fecha_inicio, '%Y-%m-%d') AS fecha_inicio, estado, capacidad_franja AS capacidad";

const SQL_RANGO_TODAS = `SELECT ${COLUMNAS} FROM msj_semanas WHERE fecha_inicio BETWEEN ? AND ? ORDER BY fecha_inicio`;
const SQL_RANGO_PUBLICADAS = `SELECT ${COLUMNAS} FROM msj_semanas WHERE fecha_inicio BETWEEN ? AND ? AND estado = 'publicada' ORDER BY fecha_inicio`;

/** Semanas cuyo lunes está entre `desdeLunes` y `hasta` (YYYY-MM-DD). */
async function listarEnRango(ejecutor, desdeLunes, hasta, { soloPublicadas }) {
  const [filas] = await ejecutor.execute(soloPublicadas ? SQL_RANGO_PUBLICADAS : SQL_RANGO_TODAS, [desdeLunes, hasta]);
  return filas;
}

/**
 * Semana publicada de ese lunes con bloqueo COMPARTIDO hasta el commit. Crear un bloqueo toma FOR UPDATE sobre
 * la misma fila (Tarea 10), así agendar y bloquear la misma franja no pueden cruzarse.
 */
async function publicadaPorLunesCompartida(conn, fechaLunes) {
  const [filas] = await conn.execute(
    "SELECT id, capacidad_franja AS capacidad FROM msj_semanas WHERE fecha_inicio = ? AND estado = 'publicada' FOR SHARE",
    [fechaLunes],
  );
  return filas[0] || null;
}

/** Crea la semana; el ER_DUP_ENTRY de uq_msj_semanas_fecha_inicio lo traduce el servicio. */
async function insertar(conn, { fechaInicio, capacidad, notas, actor }) {
  const [r] = await conn.execute(
    "INSERT INTO msj_semanas (fecha_inicio, estado, capacidad_franja, notas, creado_por) VALUES (?, 'borrador', ?, ?, ?)",
    [fechaInicio, capacidad, notas, actor],
  );
  return r.insertId;
}

async function obtener(ejecutor, id) {
  const [filas] = await ejecutor.execute(`SELECT ${COLUMNAS}, notas FROM msj_semanas WHERE id = ?`, [id]);
  return filas[0] || null;
}

/** Bloqueo exclusivo: espera a que terminen las reservas en curso de la semana (que toman FOR SHARE). */
async function obtenerParaModificar(conn, id) {
  const [filas] = await conn.execute(`SELECT ${COLUMNAS}, notas FROM msj_semanas WHERE id = ? FOR UPDATE`, [id]);
  return filas[0] || null;
}

async function cambiarEstado(conn, id, desde, hacia) {
  const [r] = await conn.execute('UPDATE msj_semanas SET estado = ? WHERE id = ? AND estado = ?', [hacia, id, desde]);
  return r.affectedRows === 1;
}

async function actualizarNotas(conn, id, notas) {
  await conn.execute('UPDATE msj_semanas SET notas = ? WHERE id = ?', [notas, id]);
}

module.exports = { listarEnRango, publicadaPorLunesCompartida, insertar, obtener, obtenerParaModificar, cambiarEstado, actualizarNotas };
