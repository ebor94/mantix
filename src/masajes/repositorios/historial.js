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

module.exports = { registrar };
