// src/masajes/repositorios/historial.js
// msj_cita_historial es de solo inserción (el usuario de BD del módulo no tiene UPDATE ni DELETE sobre ella).

/** `auditoria` = { ip, userAgent, requestId } que arma la ruta; aquí solo se recorta a lo que cabe en la tabla. */
async function registrar(conn, { beneficiarioId, citaId = null, accion, inicioAnterior = null, inicioNuevo = null, motivo = null, usuario, esAdmin = false, auditoria = {} }) {
  await conn.execute(
    `INSERT INTO msj_cita_historial
       (beneficiario_id, cita_id, accion, inicio_anterior, inicio_nuevo, motivo, usuario, es_admin, ip, user_agent, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      beneficiarioId, citaId, accion, inicioAnterior, inicioNuevo, motivo ? String(motivo).slice(0, 255) : null, usuario,
      esAdmin === true ? 1 : 0,
      auditoria.ip ? String(auditoria.ip).slice(0, 45) : null,
      auditoria.userAgent ? String(auditoria.userAgent).slice(0, 255) : null,
      auditoria.requestId ? String(auditoria.requestId).slice(0, 64) : null,
    ],
  );
}

/** Inicio anterior de la reprogramación que dejó la cita en `inicioActual` (para el correo "antes → ahora"). */
async function inicioAnteriorDe(ejecutor, citaId, inicioActual) {
  const [filas] = await ejecutor.execute(
    "SELECT inicio_anterior FROM msj_cita_historial WHERE cita_id = ? AND accion = 'reprogramada' AND inicio_nuevo = ? ORDER BY id DESC LIMIT 1",
    [citaId, inicioActual],
  );
  return filas[0] ? filas[0].inicio_anterior : null;
}

/**
 * Cambios (reprogramar/cancelar) que hizo el propio empleado en las últimas 24 h. El corte se calcula con el
 * reloj de la BD, el mismo que escribió created_at (comparar contra el reloj de la app mezclaría dos relojes).
 */
async function contarCambiosDelEmpleado(conn, beneficiarioId) {
  const [[f]] = await conn.execute(
    `SELECT COUNT(*) AS n FROM msj_cita_historial WHERE beneficiario_id = ? AND accion IN ('reprogramada', 'cancelada')
       AND es_admin = 0 AND created_at >= NOW() - INTERVAL 24 HOUR`,
    [beneficiarioId],
  );
  return Number(f.n);
}

module.exports = { registrar, inicioAnteriorDe, contarCambiosDelEmpleado };
