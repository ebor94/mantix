// src/masajes/repositorios/notificaciones.js — outbox msj_notificaciones.

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

module.exports = { encolar, descartarPendientes, huboEnvioAlSpa };
