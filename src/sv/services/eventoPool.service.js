/**
 * sv/services/eventoPool.service.js
 * Pool de registros públicos de eventos → convertidos a prospectos al asignar.
 */
const { Transaction } = require('sequelize');
const {
  SvEventoPoolRegistro, SvEventoAgenda, SvEventoAsistente,
  SvPersona, SvProspecto, SvFuente, SvEstado, SvUsuario, sequelize
} = require('../models');
const { usuariosAccesibles } = require('../utils/acceso');
const { ROLES } = require('../config/constants');

function err(msg, code) { const e = new Error(msg); e.code = code; return e; }

function esAsesor(actor) {
  const c = actor?.rol?.rol_codigo;
  return c === ROLES.ASESOR || c === ROLES.AGENTE_SVC;
}

async function validarAccesoEvento(evento, actor) {
  if (esAsesor(actor)) {
    if (evento.evento_asesor_id === actor.usr_id) return;
    const { SvEventoAsistente } = require('../models');
    const asis = await SvEventoAsistente.findOne({
      where: { eva_evento_id: evento.evento_id, eva_usr_id: actor.usr_id, eva_activo: 1 }
    });
    if (!asis) throw err('Evento fuera de tu alcance', 'FORBIDDEN');
    return;
  }
  const scope = await usuariosAccesibles(actor);
  if (scope !== null && !scope.includes(evento.evento_asesor_id)) {
    throw err('Evento fuera de tu alcance', 'FORBIDDEN');
  }
}

async function listar(eventoId, filtros, actor) {
  const evento = await SvEventoAgenda.findByPk(eventoId);
  if (!evento) throw err('Evento no encontrado', 'NOT_FOUND');
  await validarAccesoEvento(evento, actor);
  const where = { pool_evento_id: parseInt(eventoId) };
  if (filtros.asignado === false || filtros.asignado === 'false' || filtros.asignado === 0 || filtros.asignado === '0') {
    where.pool_prosp_id = null;
  } else if (filtros.asignado === true || filtros.asignado === 'true' || filtros.asignado === 1 || filtros.asignado === '1') {
    const { Op } = require('sequelize');
    where.pool_prosp_id = { [Op.not]: null };
  }
  return SvEventoPoolRegistro.findAll({
    where,
    order: [['pool_created_at', 'ASC']],
    include: [{ model: SvUsuario, as: 'asignadoA', attributes: ['usr_id', 'usr_nombre', 'usr_apellido'], required: false }]
  });
}

async function asignar(eventoId, poolId, payload, actor) {
  const evento = await SvEventoAgenda.findByPk(eventoId);
  if (!evento) throw err('Evento no encontrado', 'NOT_FOUND');
  await validarAccesoEvento(evento, actor);

  // Validaciones no dependientes de la fila del pool: fail-fast fuera de la transacción.
  const asesorId = parseInt(payload.asesor_id);
  if (!asesorId) throw err('asesor_id requerido', 'VALIDATION_ERROR');

  // El destino debe ser asistente activo del evento
  const asis = await SvEventoAsistente.findOne({
    where: { eva_evento_id: evento.evento_id, eva_usr_id: asesorId, eva_activo: 1 }
  });
  if (!asis) throw err('El asesor destino no es asistente activo de este evento', 'VALIDATION_ERROR');

  const destino = await SvUsuario.findByPk(asesorId);
  if (!destino || !destino.usr_activo) throw err('Asesor destino inválido o inactivo', 'VALIDATION_ERROR');

  // Fuente EVENTO_PUBLICO del área del evento (creada por la migración 020)
  const fuente = await SvFuente.findOne({
    where: { fuente_area_id: evento.evento_area_id, fuente_codigo: 'EVENTO_PUBLICO' }
  });

  // Estado inicial del prospecto: primer estado configurado del grupo del evento (estado_orden asc)
  const estado = await SvEstado.findOne({
    where: { estado_grupo_id: evento.evento_grupo_id, estado_activo: 1 },
    order: [['estado_orden', 'ASC']]
  });
  if (!estado) throw err('No hay estado inicial configurado para el grupo del evento', 'VALIDATION_ERROR');

  // Persona: reutilizar si ya existe por teléfono (unique en persona_telefono_norm),
  // si no crear. La normalización la hace utils/telefono.normalizar().
  const personasSvc = require('./personas.service');
  const { normalizar } = require('../utils/telefono');

  return sequelize.transaction(async (t) => {
    // Adquiere row-lock EXCLUSIVO sobre la fila del pool (SELECT ... FOR UPDATE).
    // Esto serializa dos "asignar" concurrentes sobre el mismo registro: el segundo
    // espera a que el primero libere la fila y la vuelve a leer ya con pool_prosp_id seteado.
    const pool = await SvEventoPoolRegistro.findByPk(poolId, {
      transaction: t,
      lock: Transaction.LOCK.UPDATE
    });
    if (!pool || pool.pool_evento_id !== evento.evento_id) throw err('Registro no encontrado', 'NOT_FOUND');
    // Re-check dentro del lock: cualquier request concurrente que haya asignado antes
    // de que adquiriéramos el lock aparece aquí con pool_prosp_id ya seteado.
    if (pool.pool_prosp_id) throw err('Registro ya asignado', 'YA_ASIGNADO');

    let persona = await personasSvc.buscarPorTelefono(pool.pool_telefono);
    if (!persona) {
      const nombreParts = pool.pool_nombre.trim().split(/\s+/);
      const persona_nombre = nombreParts[0] || pool.pool_nombre.trim();
      const persona_apellido = nombreParts.slice(1).join(' ') || null;
      try {
        persona = await SvPersona.create({
          persona_nombre,
          persona_apellido,
          persona_telefono_principal: pool.pool_telefono.trim(),
          persona_telefono_norm: normalizar(pool.pool_telefono),
          persona_email: pool.pool_correo || null
        }, { transaction: t });
      } catch (e) {
        if (e.name === 'SequelizeUniqueConstraintError') {
          // Carrera: otro request creó la persona entre nuestro lookup y el create.
          persona = await personasSvc.buscarPorTelefono(pool.pool_telefono);
          if (!persona) throw e;
        } else {
          throw e;
        }
      }
    }

    const prospecto = await SvProspecto.create({
      prosp_area_id: evento.evento_area_id,
      prosp_grupo_id: evento.evento_grupo_id,
      prosp_persona_id: persona.persona_id,
      prosp_asesor_id: asesorId,
      prosp_estado_id: estado.estado_id,
      prosp_fuente_id: fuente?.fuente_id || null,
      prosp_activo: 1,
      prosp_nota_inicial: `Auto-creado desde pool del evento ${evento.evento_id}`
    }, { transaction: t });

    await pool.update({
      pool_prosp_id: prospecto.prosp_id,
      pool_asignado_a: asesorId,
      pool_asignado_at: new Date(),
      pool_asignado_por: actor.usr_id
    }, { transaction: t });

    return { pool, prospecto };
  });
}

module.exports = { listar, asignar };
