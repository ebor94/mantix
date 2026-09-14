/**
 * sv/services/publicEventos.service.js
 * Endpoints públicos (sin auth) del landing de eventos + registro al pool.
 */
const { SvEventoAgenda, SvEventoPoolRegistro, SvEmpresa } = require('../models');
const { normalizar } = require('../utils/telefono');

function err(msg, code) { const e = new Error(msg); e.code = code; return e; }

// Devuelve la instancia Sequelize del evento (no un DTO) — el controller
// arma la forma pública al responder. Esto permite que `registrar` reutilice
// esta misma consulta sin acoplarse a un contrato de campos intermedio.
async function obtenerPorHash(hash) {
  if (!hash || hash.length !== 32) return null;
  return SvEventoAgenda.findOne({
    where: { evento_link_hash: hash, evento_registros_publicos_habilitado: 1 },
    include: [{ model: SvEmpresa, as: 'empresa', attributes: ['empresa_id', 'empresa_razon_social'], required: false }]
  });
}

async function registrar(hash, payload, meta = {}) {
  const evento = await obtenerPorHash(hash);
  if (!evento) throw err('Evento no encontrado o registro cerrado', 'NOT_FOUND');
  if (evento.evento_fecha_fin && new Date(evento.evento_fecha_fin) < new Date()) {
    throw err('Evento ya cerrado', 'EVENTO_CERRADO');
  }

  const telNorm = normalizar(payload.telefono);

  // Idempotencia por (evento, telefono_norm)
  const existente = await SvEventoPoolRegistro.findOne({
    where: { pool_evento_id: evento.evento_id, pool_telefono: telNorm }
  });
  if (existente) return { poolId: existente.pool_id, dedup: true };

  try {
    const row = await SvEventoPoolRegistro.create({
      pool_evento_id:  evento.evento_id,
      pool_nombre:     payload.nombre.trim(),
      pool_telefono:   telNorm,  // guarda normalizado para próximas comparaciones
      pool_correo:     payload.correo?.trim() || null,
      pool_ip:         (meta.ip || '').slice(0, 45),
      pool_user_agent: (meta.userAgent || '').slice(0, 255)
    });
    return { poolId: row.pool_id, dedup: false };
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      // Race: otra request creó el registro entre nuestro findOne y create
      const dup = await SvEventoPoolRegistro.findOne({
        where: { pool_evento_id: evento.evento_id, pool_telefono: telNorm }
      });
      if (dup) return { poolId: dup.pool_id, dedup: true };
    }
    throw e;
  }
}

module.exports = { obtenerPorHash, registrar };
