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

module.exports = { listarEnRango, publicadaPorLunesCompartida };
