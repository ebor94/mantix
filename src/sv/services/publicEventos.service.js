/**
 * sv/services/publicEventos.service.js
 * Endpoints públicos (sin auth) del landing de eventos + registro al pool.
 */
const { SvEventoAgenda, SvEventoPoolRegistro, SvEmpresa } = require('../models');

function err(msg, code) { const e = new Error(msg); e.code = code; return e; }

// Devuelve un DTO plano (no la instancia Sequelize) con los nombres de campo
// del contrato público — así el controller y este mismo service comparten
// una sola forma (`fecha_fin`, no `evento_fecha_fin`) sin acoplarse a los
// nombres de columna internos de sv_org_eventos_agenda.
async function obtenerPorHash(hash) {
  if (!hash || hash.length !== 32) return null;
  const ev = await SvEventoAgenda.findOne({
    where: { evento_link_hash: hash, evento_registros_publicos_habilitado: 1 },
    include: [{ model: SvEmpresa, as: 'empresa', attributes: ['empresa_id', 'empresa_razon_social'], required: false }]
  });
  if (!ev) return null;
  return {
    evento_id:      ev.evento_id,
    titulo:         ev.evento_titulo,
    descripcion:    ev.evento_descripcion,
    fecha_inicio:   ev.evento_fecha_hora,
    fecha_fin:      ev.evento_fecha_fin,
    empresa_nombre: ev.empresa?.empresa_razon_social || null
  };
}

async function registrar(hash, payload, meta = {}) {
  const evento = await obtenerPorHash(hash);
  if (!evento) throw err('Evento no encontrado o registro cerrado', 'NOT_FOUND');
  if (evento.fecha_fin && new Date(evento.fecha_fin) < new Date()) {
    throw err('Evento ya cerrado', 'EVENTO_CERRADO');
  }
  // Idempotencia por (evento, telefono)
  const existente = await SvEventoPoolRegistro.findOne({
    where: { pool_evento_id: evento.evento_id, pool_telefono: payload.telefono }
  });
  if (existente) return { poolId: existente.pool_id, dedup: true };

  const row = await SvEventoPoolRegistro.create({
    pool_evento_id:  evento.evento_id,
    pool_nombre:     payload.nombre.trim(),
    pool_telefono:   payload.telefono.trim(),
    pool_correo:     payload.correo?.trim() || null,
    pool_ip:         (meta.ip || '').slice(0, 45),
    pool_user_agent: (meta.userAgent || '').slice(0, 255)
  });
  return { poolId: row.pool_id, dedup: false };
}

module.exports = { obtenerPorHash, registrar };
