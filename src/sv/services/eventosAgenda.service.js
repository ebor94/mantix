/**
 * sv/services/eventosAgenda.service.js
 * Migración 018 — CRUD de eventos personales de agenda.
 */
const { Op } = require('sequelize');
const { SvEventoAgenda, SvUsuario, SvProspecto, SvEmpresa } = require('../models');
const { grupoIdsAccesibles } = require('../utils/acceso');
const { ROLES } = require('../config/constants');

const TIPOS_VALIDOS = new Set(['REUNION','VISITA','CAPACITACION','LLAMADA','PERSONAL','OTRO']);

function esAsesor(actor) {
  const c = actor?.rol?.rol_codigo;
  return c === ROLES.ASESOR || c === ROLES.AGENTE_SVC;
}

async function validarAccesoEvento(eventoId, actor) {
  const ev = await SvEventoAgenda.findByPk(eventoId);
  if (!ev) { const e = new Error('Evento no encontrado'); e.code = 'NOT_FOUND'; throw e; }
  if (esAsesor(actor)) {
    if (ev.evento_asesor_id !== actor.usr_id) {
      const e = new Error('Evento fuera de tu alcance'); e.code = 'FORBIDDEN'; throw e;
    }
  } else {
    const grupos = grupoIdsAccesibles(actor);
    if (grupos !== null) {
      const target = await SvUsuario.findByPk(ev.evento_asesor_id, { attributes: ['usr_grupo_id'] });
      if (!target || !grupos.includes(target.usr_grupo_id)) {
        const e = new Error('Evento fuera de tu grupo'); e.code = 'FORBIDDEN'; throw e;
      }
    }
  }
  return ev;
}

async function crear(payload, actor) {
  const titulo = String(payload.titulo || '').trim();
  if (!titulo || titulo.length < 2) {
    const e = new Error('Título es requerido'); e.code = 'VALIDATION_ERROR'; throw e;
  }
  if (!payload.fecha_hora) {
    const e = new Error('Fecha y hora son requeridas'); e.code = 'VALIDATION_ERROR'; throw e;
  }
  const tipo = String(payload.tipo || 'OTRO').toUpperCase();
  if (!TIPOS_VALIDOS.has(tipo)) {
    const e = new Error(`Tipo inválido: ${tipo}`); e.code = 'VALIDATION_ERROR'; throw e;
  }

  // ¿Para quién es este evento? Asesor solo puede crearlos para sí mismo.
  let asesorId = actor.usr_id;
  if (!esAsesor(actor) && payload.asesor_id) {
    asesorId = parseInt(payload.asesor_id);
    // Validar que el asesor objetivo está en el scope del actor
    const grupos = grupoIdsAccesibles(actor);
    if (grupos !== null) {
      const target = await SvUsuario.findByPk(asesorId, { attributes: ['usr_grupo_id', 'usr_activo'] });
      if (!target || !target.usr_activo) {
        const e = new Error('Asesor destino inválido'); e.code = 'VALIDATION_ERROR'; throw e;
      }
      if (!grupos.includes(target.usr_grupo_id)) {
        const e = new Error('Asesor destino fuera de tu grupo'); e.code = 'FORBIDDEN'; throw e;
      }
    }
  }

  return SvEventoAgenda.create({
    evento_asesor_id:   asesorId,
    evento_creado_por:  actor.usr_id,
    evento_titulo:      titulo,
    evento_descripcion: payload.descripcion || null,
    evento_tipo:        tipo,
    evento_fecha_hora:  payload.fecha_hora,    // ISO string o 'YYYY-MM-DD HH:MM:SS'
    evento_prosp_id:    payload.prosp_id   ? parseInt(payload.prosp_id)   : null,
    evento_empresa_id:  payload.empresa_id ? parseInt(payload.empresa_id) : null,
    evento_completado:  0
  });
}

async function actualizar(id, payload, actor) {
  const ev = await validarAccesoEvento(id, actor);
  const patch = {};
  if (payload.titulo      !== undefined) patch.evento_titulo      = String(payload.titulo).trim();
  if (payload.descripcion !== undefined) patch.evento_descripcion = payload.descripcion || null;
  if (payload.tipo        !== undefined) {
    const t = String(payload.tipo).toUpperCase();
    if (!TIPOS_VALIDOS.has(t)) { const e = new Error(`Tipo inválido: ${t}`); e.code = 'VALIDATION_ERROR'; throw e; }
    patch.evento_tipo = t;
  }
  if (payload.fecha_hora !== undefined) patch.evento_fecha_hora = payload.fecha_hora;
  if (payload.prosp_id   !== undefined) patch.evento_prosp_id   = payload.prosp_id   ? parseInt(payload.prosp_id)   : null;
  if (payload.empresa_id !== undefined) patch.evento_empresa_id = payload.empresa_id ? parseInt(payload.empresa_id) : null;
  await ev.update(patch);
  return ev;
}

async function marcarCompletado(id, completado, actor) {
  const ev = await validarAccesoEvento(id, actor);
  await ev.update({
    evento_completado:    completado ? 1 : 0,
    evento_completado_at: completado ? new Date() : null
  });
  // Hook: si era un SEGUIMIENTO automático y se acaba de completar, encadenar
  // el siguiente. No bloquear si falla — log silencioso.
  if (completado && ev.evento_tipo === 'SEGUIMIENTO' && ev.evento_empresa_id) {
    try {
      const seg = require('./seguimientosEmpresa.service');
      await seg.programarSiguiente(ev);
    } catch (e) {
      /* log silencioso */
    }
  }
  return ev;
}

async function eliminar(id, actor) {
  const ev = await validarAccesoEvento(id, actor);
  await ev.destroy();
  return true;
}

async function getOne(id, actor) {
  const ev = await validarAccesoEvento(id, actor);
  return SvEventoAgenda.findByPk(ev.evento_id, {
    include: [
      { model: SvUsuario,  as: 'asesor',    attributes: ['usr_id','usr_nombre','usr_apellido'] },
      { model: SvUsuario,  as: 'creadoPor', attributes: ['usr_id','usr_nombre','usr_apellido'] },
      { model: SvProspecto,as: 'prospecto', required: false },
      { model: SvEmpresa,  as: 'empresa',   required: false }
    ]
  });
}

module.exports = { crear, actualizar, marcarCompletado, eliminar, getOne, TIPOS_VALIDOS };
