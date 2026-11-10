// src/masajes/repositorios/notificaciones.js — outbox msj_notificaciones.
const { enteroSql } = require('../utils/paginacion');

/**
 * Inserta la tarea si su clave no existe. ON DUPLICATE KEY UPDATE y no INSERT IGNORE: IGNORE también callaría
 * otros errores (FK, truncamientos) y la cita quedaría sin sus avisos sin que nadie lo note.
 */
async function encolar(conn, { citaId, tipo, canal, clave }) {
  await conn.execute(
    'INSERT INTO msj_notificaciones (cita_id, tipo, canal, clave) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id',
    [citaId, tipo, canal, clave],
  );
}

/** Al reprogramar o cancelar: lo pendiente habla del horario anterior y ya no debe salir. */
async function descartarPendientes(conn, citaId) {
  await conn.execute("UPDATE msj_notificaciones SET estado = 'descartado' WHERE cita_id = ? AND estado = 'pendiente'", [citaId]);
}

/** ¿El spa recibió alguna vez esta cita? Decide si se le escribe "reprogramada"/"cancelada" o nada. */
async function huboEnvioAlSpa(conn, citaId) {
  const [filas] = await conn.execute(
    "SELECT 1 AS si FROM msj_notificaciones WHERE cita_id = ? AND tipo IN ('spa_nueva', 'spa_reprogramada') AND estado = 'enviado' LIMIT 1",
    [citaId],
  );
  return filas.length > 0;
}

// ---- Administración ----
const ESTADOS = Object.freeze(['pendiente', 'enviado', 'fallido', 'descartado']);

async function listar(ejecutor, { estado, limite, desplazamiento }) {
  const filtro = estado ? 'WHERE n.estado = ?' : '';
  const params = estado ? [estado] : [];
  const [[{ total }]] = await ejecutor.execute(`SELECT COUNT(*) AS total FROM msj_notificaciones n ${filtro}`, params);
  const [items] = await ejecutor.execute(
    `SELECT n.id, n.cita_id, n.tipo, n.canal, n.estado, n.intentos, n.proximo_intento, n.ultimo_error, n.enviado_at, n.created_at
       FROM msj_notificaciones n ${filtro} ORDER BY n.id DESC LIMIT ${enteroSql(limite)} OFFSET ${enteroSql(desplazamiento)}`,
    params,
  );
  return { total: Number(total), items };
}

/** Solo una fallida vuelve a la cola, desde cero. El worker revalida la cita antes de enviar. */
async function reintentar(conn, id) {
  const [r] = await conn.execute(
    "UPDATE msj_notificaciones SET estado = 'pendiente', intentos = 0, proximo_intento = CURRENT_TIMESTAMP WHERE id = ? AND estado = 'fallido'",
    [id],
  );
  return r.affectedRows === 1;
}

module.exports = { encolar, descartarPendientes, huboEnvioAlSpa, listar, reintentar, ESTADOS };
