// src/masajes/repositorios/citas.js
const { enteroSql } = require('../utils/paginacion');
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

/** ¿Hay alguna cita activa de la semana que se solape con [inicio, fin)? Con bloqueo: ve lo último confirmado. */
async function hayActivaSolapada(conn, semanaId, inicio, fin) {
  const [filas] = await conn.execute(
    'SELECT 1 AS si FROM msj_citas WHERE semana_id = ? AND slot_key IS NOT NULL AND inicio < ? AND fin > ? LIMIT 1 FOR SHARE',
    [semanaId, fin, inicio],
  );
  return filas.length > 0;
}

async function contarActivasDeSemana(ejecutor, semanaId) {
  const [[f]] = await ejecutor.execute('SELECT COUNT(*) AS n FROM msj_citas WHERE semana_id = ? AND slot_key IS NOT NULL', [semanaId]);
  return Number(f.n);
}

/** agendada → asistio | no_asistio. El cupo sigue consumido (spec §5.3): no se tocan las claves. */
async function marcarAsistencia(conn, id, estado, actor) {
  const [r] = await conn.execute(
    "UPDATE msj_citas SET estado = ?, actualizado_por = ? WHERE id = ? AND estado = 'agendada'", [estado, actor, id],
  );
  return r.affectedRows === 1;
}

// ---- Consultas del empleado (/me) y del admin ----

async function delBeneficiario(ejecutor, beneficiarioId, { periodos, desde }) {
  const [filas] = await ejecutor.execute(
    `SELECT id, inicio, fin, periodo, estado FROM msj_citas
      WHERE beneficiario_id = ? AND ((periodo IN (?, ?) AND estado <> 'cancelada') OR (estado = 'agendada' AND inicio >= ?))
      ORDER BY inicio`,
    [beneficiarioId, periodos[0], periodos[1], desde],
  );
  return filas;
}

const ESTADOS = Object.freeze(['agendada', 'cancelada', 'asistio', 'no_asistio']);

async function listarAdmin(ejecutor, { periodo, estado, beneficiarioId, limite, desplazamiento }) {
  const where = [];
  const params = [];
  if (periodo) { where.push('c.periodo = ?'); params.push(periodo); }
  if (estado) { where.push('c.estado = ?'); params.push(estado); }
  if (beneficiarioId) { where.push('c.beneficiario_id = ?'); params.push(beneficiarioId); }
  const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await ejecutor.execute(`SELECT COUNT(*) AS total FROM msj_citas c ${filtro}`, params);
  const [items] = await ejecutor.execute(
    `SELECT c.id, c.inicio, c.fin, c.periodo, c.estado, c.motivo_cancelacion, c.creado_por, c.actualizado_por,
            c.beneficiario_id, b.nombre AS beneficiario_nombre, b.cargo AS beneficiario_cargo
       FROM msj_citas c JOIN msj_beneficiarios b ON b.id = c.beneficiario_id ${filtro}
      ORDER BY c.inicio DESC LIMIT ${enteroSql(limite)} OFFSET ${enteroSql(desplazamiento)}`,
    params,
  );
  return { total: Number(total), items };
}

/** Beneficiarios distintos con una cita que consume el cupo de ese periodo. */
async function contarConCupoEnPeriodo(ejecutor, periodo) {
  const [[f]] = await ejecutor.execute(
    'SELECT COUNT(DISTINCT beneficiario_id) AS n FROM msj_citas WHERE periodo = ? AND cupo_key IS NOT NULL', [periodo],
  );
  return Number(f.n);
}

// ---- Worker y recordatorios (Tareas 13 y 14) ----

/** Lo que necesita una notificación: la cita y los datos de contacto del beneficiario. */
async function obtenerParaNotificar(ejecutor, id) {
  const [filas] = await ejecutor.execute(
    `SELECT c.id, c.inicio, c.fin, c.periodo, c.estado, c.google_event_id,
            b.nombre AS b_nombre, b.cargo AS b_cargo, b.celular AS b_celular, b.correo AS b_correo
       FROM msj_citas c JOIN msj_beneficiarios b ON b.id = c.beneficiario_id WHERE c.id = ?`,
    [id],
  );
  return filas[0] || null;
}

async function guardarEventoGoogle(ejecutor, id, eventId) {
  await ejecutor.execute('UPDATE msj_citas SET google_event_id = ? WHERE id = ?', [eventId, id]);
}

async function agendadasEntre(ejecutor, desde, hasta) {
  const [filas] = await ejecutor.execute(
    "SELECT id, inicio, fin, created_at FROM msj_citas WHERE estado = 'agendada' AND inicio >= ? AND inicio < ? ORDER BY inicio",
    [desde, hasta],
  );
  return filas;
}

module.exports = {
  activasEnRango, insertarActiva, obtenerParaModificar, mover, marcarCancelada,
  hayActivaSolapada, contarActivasDeSemana, marcarAsistencia,
  delBeneficiario, listarAdmin, contarConCupoEnPeriodo, ESTADOS,
  obtenerParaNotificar, guardarEventoGoogle, agendadasEntre,
};
