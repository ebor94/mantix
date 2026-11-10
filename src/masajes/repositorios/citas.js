// src/masajes/repositorios/citas.js
// Citas activas = las que retienen franja (slot_key IS NOT NULL; ver ck_msj_citas_claves).

// Para el empleado ni siquiera se leen datos del beneficiario: no hay nada que filtrar después.
const SQL_ACTIVAS = `SELECT c.id, c.inicio, c.estado
  FROM msj_citas c WHERE c.inicio >= ? AND c.inicio < ? AND c.slot_key IS NOT NULL`;
const SQL_ACTIVAS_CON_BENEFICIARIO = `SELECT c.id, c.inicio, c.estado, c.beneficiario_id, b.nombre AS beneficiario_nombre
  FROM msj_citas c JOIN msj_beneficiarios b ON b.id = c.beneficiario_id
  WHERE c.inicio >= ? AND c.inicio < ? AND c.slot_key IS NOT NULL`;

async function activasEnRango(ejecutor, desde, hasta, { conBeneficiario }) {
  const [filas] = await ejecutor.execute(conBeneficiario ? SQL_ACTIVAS_CON_BENEFICIARIO : SQL_ACTIVAS, [desde, hasta]);
  return filas;
}

/** Inserta una cita activa. Un ER_DUP_ENTRY de slot_key o cupo_key lo traduce el servicio (mapDuplicado). */
async function insertarActiva(conn, d) {
  const [r] = await conn.execute(
    `INSERT INTO msj_citas (beneficiario_id, semana_id, inicio, fin, periodo, estado, slot_key, cupo_key, creado_por, actualizado_por)
     VALUES (?, ?, ?, ?, ?, 'agendada', ?, ?, ?, ?)`,
    [d.beneficiarioId, d.semanaId, d.inicio, d.fin, d.periodo, d.slotKey, d.cupoKey, d.actor, d.actor],
  );
  return r.insertId;
}

const COLUMNAS_CITA = 'id, beneficiario_id, semana_id, inicio, fin, periodo, estado, google_event_id';
const SQL_PARA_MODIFICAR = `SELECT ${COLUMNAS_CITA} FROM msj_citas WHERE id = ? FOR UPDATE`;
const SQL_PARA_MODIFICAR_PROPIA = `SELECT ${COLUMNAS_CITA} FROM msj_citas WHERE id = ? AND beneficiario_id = ? FOR UPDATE`;

/**
 * Cita bloqueada hasta el commit. Con `beneficiarioId` (empleado) el filtro de propiedad va en el propio SQL:
 * una cita ajena simplemente no existe para él (spec §9.7).
 */
async function obtenerParaModificar(conn, id, beneficiarioId) {
  const [filas] = beneficiarioId === null
    ? await conn.execute(SQL_PARA_MODIFICAR, [id])
    : await conn.execute(SQL_PARA_MODIFICAR_PROPIA, [id, beneficiarioId]);
  return filas[0] || null;
}

/** Mueve la cita a otra franja (misma fila). Un ER_DUP_ENTRY revierte solo esta sentencia. */
async function mover(conn, id, d) {
  await conn.execute(
    `UPDATE msj_citas SET semana_id = ?, inicio = ?, fin = ?, periodo = ?, slot_key = ?, cupo_key = ?, actualizado_por = ?
     WHERE id = ? AND estado = 'agendada'`,
    [d.semanaId, d.inicio, d.fin, d.periodo, d.slotKey, d.cupoKey, d.actor, id],
  );
}

/** Cancela liberando franja y cupo (ck_msj_citas_claves lo exige). Devuelve si se aplicó. */
async function marcarCancelada(conn, id, motivo, actor) {
  const [r] = await conn.execute(
    `UPDATE msj_citas SET estado = 'cancelada', slot_key = NULL, cupo_key = NULL, motivo_cancelacion = ?, actualizado_por = ?
     WHERE id = ? AND estado = 'agendada'`,
    [motivo, actor, id],
  );
  return r.affectedRows === 1;
}

module.exports = { activasEnRango, insertarActiva, obtenerParaModificar, mover, marcarCancelada };
