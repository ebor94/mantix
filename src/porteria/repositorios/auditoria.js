// src/porteria/repositorios/auditoria.js
// Quién creó, corrigió, forzó o anuló qué. Se escribe en la misma transacción que el cambio.
async function registrarAuditoria(conn, { usuario, apiCodigo = null, entidad, entidadId, accion, antes = null, despues = null, ip = null }) {
  const json = (v) => (v === null || v === undefined ? null : JSON.stringify(v));
  await conn.query(
    `INSERT INTO por_auditoria (usuario, api_codigo, entidad, entidad_id, accion, antes, despues, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [usuario, apiCodigo, entidad, entidadId, accion, json(antes), json(despues), ip],
  );
}

module.exports = { registrarAuditoria };
