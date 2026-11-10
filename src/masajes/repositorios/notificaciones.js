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

module.exports = { encolar };
