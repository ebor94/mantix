const db = require('../../models');

// RNF-6: quién, qué, antes, después, cuándo + código de API del request.
function registrarAuditoria(ctx, { entidad, entidadId, accion, antes = null, despues = null }, { transaction } = {}) {
  return db.TrkAuditoria.create({
    usuario_id: ctx.usuarioId,
    api_codigo: ctx.apiCodigo,
    entidad,
    entidad_id: entidadId == null ? null : String(entidadId),
    accion,
    antes,
    despues,
    ip: ctx.ip || null
  }, { transaction });
}

module.exports = { registrarAuditoria };
