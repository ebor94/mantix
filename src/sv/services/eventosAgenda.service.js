/**
 * sv/services/eventosAgenda.service.js
 * Migración 018 — CRUD de eventos personales de agenda.
 * Migración 020 (SP-1a) — soporte multi-asesor + slots + apoyo + pool público.
 */
const crypto = require('crypto');
const { Op, fn, col, literal } = require('sequelize');
const {
  SvEventoAgenda, SvEventoAsistente, SvEventoSlot, SvEventoPoolRegistro,
  SvUsuario, SvProspecto, SvEmpresa, SvGrupo, SvArea
} = require('../models');
const { usuariosAccesibles } = require('../utils/acceso');
const { ROLES } = require('../config/constants');

const TIPOS_VALIDOS = new Set(['REUNION','VISITA','CAPACITACION','LLAMADA','FERIA','PERSONAL','OTRO','SEGUIMIENTO']);
const MODOS_VALIDOS = new Set(['UNICO','DIA_COMPLETO_MULTI','SLOTS']);
const ESTADOS_ASIS  = new Set(['CONFIRMADO','ASISTIO','NO_ASISTIO','JUSTIFICADO']);

function esAsesor(actor) {
  const c = actor?.rol?.rol_codigo;
  return c === ROLES.ASESOR || c === ROLES.AGENTE_SVC;
}

function err(msg, code) { const e = new Error(msg); e.code = code; return e; }

async function validarAsistentesEnScope(actor, asistentesIds) {
  const scope = await usuariosAccesibles(actor);
  if (scope === null) return; // SUPER_ADMIN sin filtro
  const fuera = asistentesIds.filter(id => !scope.includes(id));
  if (fuera.length) throw err(`Asistente(s) fuera de tu alcance: ${fuera.join(',')}`, 'FORBIDDEN');
}

async function validarAccesoEvento(eventoId, actor) {
  const ev = await SvEventoAgenda.findByPk(eventoId);
  if (!ev) throw err('Evento no encontrado', 'NOT_FOUND');
  if (esAsesor(actor)) {
    // asesor puede ver evento donde figure como asistente activo o sea el dueño
    if (ev.evento_asesor_id === actor.usr_id) return ev;
    const asis = await SvEventoAsistente.findOne({
      where: { eva_evento_id: eventoId, eva_usr_id: actor.usr_id, eva_activo: 1 }
    });
    if (!asis) throw err('Evento fuera de tu alcance', 'FORBIDDEN');
    return ev;
  }
  const scope = await usuariosAccesibles(actor);
  if (scope !== null && !scope.includes(ev.evento_asesor_id)) {
    throw err('Evento fuera de tu alcance', 'FORBIDDEN');
  }
  return ev;
}

async function crear(payload, actor) {
  const titulo = String(payload.titulo || '').trim();
  if (!titulo) throw err('Título requerido', 'VALIDATION_ERROR');
  const tipo = String(payload.tipo || 'OTRO').toUpperCase();
  if (!TIPOS_VALIDOS.has(tipo)) throw err(`Tipo inválido: ${tipo}`, 'VALIDATION_ERROR');
  const modo = String(payload.modo_fechas || 'UNICO').toUpperCase();
  if (!MODOS_VALIDOS.has(modo)) throw err(`modo_fechas inválido: ${modo}`, 'VALIDATION_ERROR');
  if (!payload.fecha_inicio) throw err('fecha_inicio requerida', 'VALIDATION_ERROR');

  const asistentesIds = Array.from(new Set((payload.asistentes_ids || []).map(n => parseInt(n)).filter(Boolean)));
  if (!asistentesIds.length) throw err('asistentes_ids requerido', 'VALIDATION_ERROR');

  // Asesor solo puede agregarse a sí mismo
  if (esAsesor(actor)) {
    if (asistentesIds.length !== 1 || asistentesIds[0] !== actor.usr_id) {
      throw err('Como asesor sólo puedes crear eventos para ti mismo', 'FORBIDDEN');
    }
  } else {
    await validarAsistentesEnScope(actor, asistentesIds);
    if (payload.apoyo_usr_id) {
      await validarAsistentesEnScope(actor, [parseInt(payload.apoyo_usr_id)]);
    }
  }

  // Cargar area/grupo del primer asistente para poblar los campos de scope
  const primerAsis = await SvUsuario.findByPk(asistentesIds[0], { attributes: ['usr_area_id', 'usr_grupo_id'] });

  const linkHash = payload.registros_publicos_habilitado
    ? crypto.randomBytes(16).toString('hex')
    : null;

  const evento = await SvEventoAgenda.create({
    evento_asesor_id:   asistentesIds[0],   // dueño = primer asistente
    evento_creado_por:  actor.usr_id,
    evento_titulo:      titulo,
    evento_descripcion: payload.descripcion || null,
    evento_tipo:        tipo,
    evento_fecha_hora:  payload.fecha_inicio,
    evento_fecha_fin:   payload.fecha_fin || null,
    evento_modo_fechas: modo,
    evento_prosp_id:    payload.prosp_id ? parseInt(payload.prosp_id) : null,
    evento_empresa_id:  payload.empresa_id ? parseInt(payload.empresa_id) : null,
    evento_apoyo_usr_id: payload.apoyo_usr_id ? parseInt(payload.apoyo_usr_id) : null,
    evento_link_hash:   linkHash,
    evento_registros_publicos_habilitado: payload.registros_publicos_habilitado ? 1 : 0,
    evento_meta_leads:  payload.meta_leads ? parseInt(payload.meta_leads) : null,
    evento_grupo_id:    primerAsis?.usr_grupo_id || null,
    evento_area_id:     primerAsis?.usr_area_id || null,
    evento_completado:  0
  });

  await SvEventoAsistente.bulkCreate(
    asistentesIds.map(id => ({ eva_evento_id: evento.evento_id, eva_usr_id: id }))
  );

  if (modo === 'SLOTS' && Array.isArray(payload.slots) && payload.slots.length) {
    await SvEventoSlot.bulkCreate(
      payload.slots.map(s => ({
        slot_evento_id:   evento.evento_id,
        slot_fecha:       s.fecha,
        slot_hora_inicio: s.hora_inicio,
        slot_hora_fin:    s.hora_fin
      }))
    );
  }

  return evento;
}

async function actualizar(id, payload, actor) {
  const ev = await validarAccesoEvento(id, actor);
  // Sólo jefes pueden actualizar; el dueño usará OTP (SP-3)
  if (esAsesor(actor)) throw err('El asesor edita su evento vía OTP (SP-3)', 'FORBIDDEN');

  const patch = {};
  if (payload.titulo !== undefined)      patch.evento_titulo = String(payload.titulo).trim();
  if (payload.descripcion !== undefined) patch.evento_descripcion = payload.descripcion || null;
  if (payload.tipo !== undefined) {
    const t = String(payload.tipo).toUpperCase();
    if (!TIPOS_VALIDOS.has(t)) throw err(`Tipo inválido: ${t}`, 'VALIDATION_ERROR');
    patch.evento_tipo = t;
  }
  if (payload.modo_fechas !== undefined) {
    const m = String(payload.modo_fechas).toUpperCase();
    if (!MODOS_VALIDOS.has(m)) throw err(`modo_fechas inválido: ${m}`, 'VALIDATION_ERROR');
    patch.evento_modo_fechas = m;
  }
  if (payload.fecha_inicio !== undefined) patch.evento_fecha_hora = payload.fecha_inicio;
  if (payload.fecha_fin !== undefined)    patch.evento_fecha_fin = payload.fecha_fin || null;
  if (payload.apoyo_usr_id !== undefined) {
    if (payload.apoyo_usr_id) await validarAsistentesEnScope(actor, [parseInt(payload.apoyo_usr_id)]);
    patch.evento_apoyo_usr_id = payload.apoyo_usr_id ? parseInt(payload.apoyo_usr_id) : null;
  }
  if (payload.meta_leads !== undefined) patch.evento_meta_leads = payload.meta_leads ? parseInt(payload.meta_leads) : null;
  if (payload.registros_publicos_habilitado !== undefined) {
    patch.evento_registros_publicos_habilitado = payload.registros_publicos_habilitado ? 1 : 0;
    // Si se habilita por primera vez y no había hash, generarlo
    if (payload.registros_publicos_habilitado && !ev.evento_link_hash) {
      patch.evento_link_hash = crypto.randomBytes(16).toString('hex');
    }
  }

  await ev.update(patch);

  // Reconciliar asistentes si vinieron
  if (Array.isArray(payload.asistentes_ids)) {
    const nuevos = Array.from(new Set(payload.asistentes_ids.map(n => parseInt(n)).filter(Boolean)));
    if (!nuevos.length) throw err('asistentes_ids no puede quedar vacío', 'VALIDATION_ERROR');
    await validarAsistentesEnScope(actor, nuevos);
    const actuales = await SvEventoAsistente.findAll({
      where: { eva_evento_id: id, eva_activo: 1 }
    });
    const actualesIds = actuales.map(a => a.eva_usr_id);
    const salen = actualesIds.filter(x => !nuevos.includes(x));
    const entran = nuevos.filter(x => !actualesIds.includes(x));
    if (salen.length) {
      await SvEventoAsistente.update({ eva_activo: 0 },
        { where: { eva_evento_id: id, eva_usr_id: { [Op.in]: salen } } });
    }
    if (entran.length) {
      await SvEventoAsistente.bulkCreate(
        entran.map(uid => ({ eva_evento_id: id, eva_usr_id: uid })),
        { ignoreDuplicates: true }
      );
      // Reactivar los que estaban con eva_activo=0
      await SvEventoAsistente.update({ eva_activo: 1 },
        { where: { eva_evento_id: id, eva_usr_id: { [Op.in]: entran } } });
    }
  }

  // Reemplazar slots si vinieron
  if (Array.isArray(payload.slots)) {
    await SvEventoSlot.destroy({ where: { slot_evento_id: id } });
    if (payload.slots.length) {
      await SvEventoSlot.bulkCreate(payload.slots.map(s => ({
        slot_evento_id:   id,
        slot_fecha:       s.fecha,
        slot_hora_inicio: s.hora_inicio,
        slot_hora_fin:    s.hora_fin
      })));
    }
  }

  return ev;
}

async function marcarCompletado(id, completado, actor) {
  const ev = await validarAccesoEvento(id, actor);
  await ev.update({
    evento_completado:    completado ? 1 : 0,
    evento_completado_at: completado ? new Date() : null
  });
  if (completado && ev.evento_tipo === 'SEGUIMIENTO' && ev.evento_empresa_id) {
    try {
      const seg = require('./seguimientosEmpresa.service');
      await seg.programarSiguiente(ev);
    } catch (e) { /* log silencioso */ }
  }
  return ev;
}

async function eliminar(id, actor) {
  await validarAccesoEvento(id, actor);
  if (esAsesor(actor)) throw err('Sólo jefes pueden eliminar eventos', 'FORBIDDEN');
  await SvEventoAgenda.destroy({ where: { evento_id: id } });
  return true;
}

async function getOne(id, actor) {
  const ev = await validarAccesoEvento(id, actor);
  const [poolTotal, poolPendientes] = await Promise.all([
    SvEventoPoolRegistro.count({ where: { pool_evento_id: id } }),
    SvEventoPoolRegistro.count({ where: { pool_evento_id: id, pool_prosp_id: null } })
  ]);
  const full = await SvEventoAgenda.findByPk(ev.evento_id, {
    include: [
      { model: SvUsuario, as: 'asesor',    attributes: ['usr_id','usr_nombre','usr_apellido'] },
      { model: SvUsuario, as: 'creadoPor', attributes: ['usr_id','usr_nombre','usr_apellido'] },
      { model: SvUsuario, as: 'apoyo',     attributes: ['usr_id','usr_nombre','usr_apellido'], required: false },
      { model: SvEventoAsistente, as: 'asistentes', where: { eva_activo: 1 }, required: false,
        include: [{ model: SvUsuario, as: 'usuario', attributes: ['usr_id','usr_nombre','usr_apellido'] }] },
      { model: SvEventoSlot, as: 'slots', required: false },
      { model: SvProspecto,  as: 'prospecto', required: false },
      { model: SvEmpresa,    as: 'empresa',   required: false },
      { model: SvGrupo,      as: 'grupo',     required: false },
      { model: SvArea,       as: 'area',      required: false }
    ]
  });
  return { ...full.toJSON(), pool_total: poolTotal, pool_pendientes: poolPendientes };
}

async function actualizarMetricasAsistente(evaId, payload, actor) {
  const asis = await SvEventoAsistente.findByPk(evaId);
  if (!asis) throw err('Asistente no encontrado', 'NOT_FOUND');
  // Asesor sólo puede tocar sus propias métricas
  if (esAsesor(actor) && asis.eva_usr_id !== actor.usr_id) {
    throw err('Fuera de tu alcance', 'FORBIDDEN');
  }
  if (!esAsesor(actor)) {
    const scope = await usuariosAccesibles(actor);
    if (scope !== null && !scope.includes(asis.eva_usr_id)) {
      throw err('Asistente fuera de tu alcance', 'FORBIDDEN');
    }
  }
  const patch = {};
  if (payload.estado !== undefined) {
    if (!ESTADOS_ASIS.has(payload.estado)) throw err(`estado inválido: ${payload.estado}`, 'VALIDATION_ERROR');
    patch.eva_estado = payload.estado;
  }
  if (payload.leads_captados !== undefined)     patch.eva_leads_captados     = payload.leads_captados;
  if (payload.prospectos_creados !== undefined) patch.eva_prospectos_creados = payload.prospectos_creados;
  if (payload.ventas_cerradas !== undefined)    patch.eva_ventas_cerradas    = payload.ventas_cerradas;
  await asis.update(patch);
  return asis;
}

async function resumen(eventoId, actor) {
  const ev = await SvEventoAgenda.findByPk(eventoId);
  if (!ev) throw err('Evento no encontrado', 'NOT_FOUND');
  if (esAsesor(actor)) {
    if (ev.evento_asesor_id !== actor.usr_id) {
      const asis = await SvEventoAsistente.findOne({
        where: { eva_evento_id: eventoId, eva_usr_id: actor.usr_id, eva_activo: 1 }
      });
      if (!asis) throw err('Evento fuera de tu alcance', 'FORBIDDEN');
    }
  } else {
    const scope = await usuariosAccesibles(actor);
    if (scope !== null && !scope.includes(ev.evento_asesor_id)) {
      throw err('Evento fuera de tu alcance', 'FORBIDDEN');
    }
  }
  const [totalReg, asignados, asistentes] = await Promise.all([
    SvEventoPoolRegistro.count({ where: { pool_evento_id: eventoId } }),
    SvEventoPoolRegistro.count({ where: { pool_evento_id: eventoId, pool_prosp_id: { [Op.not]: null } } }),
    SvEventoAsistente.findAll({
      where: { eva_evento_id: eventoId, eva_activo: 1 },
      include: [{ model: SvUsuario, as: 'usuario', attributes: ['usr_id','usr_nombre','usr_apellido'] }]
    })
  ]);
  return {
    total_registros:  totalReg,
    total_asignados:  asignados,
    total_pendientes: totalReg - asignados,
    por_asesor: asistentes.map(a => ({
      usr_id:     a.eva_usr_id,
      nombre:     `${a.usuario?.usr_nombre || ''} ${a.usuario?.usr_apellido || ''}`.trim(),
      estado:     a.eva_estado,
      leads:      a.eva_leads_captados     || 0,
      prospectos: a.eva_prospectos_creados || 0,
      ventas:     a.eva_ventas_cerradas    || 0
    }))
  };
}

async function listado({ filtros = {}, actor }) {
  const scope = await usuariosAccesibles(actor);
  const whereAnd = [];

  // Scope: dueño OR asistente activo, dentro del scope del actor
  if (scope !== null) {
    const asisRows = await SvEventoAsistente.findAll({
      where: { eva_usr_id: { [Op.in]: scope }, eva_activo: 1 },
      attributes: ['eva_evento_id']
    });
    const evIdsAsis = [...new Set(asisRows.map(a => a.eva_evento_id))];
    whereAnd.push({
      [Op.or]: [
        { evento_asesor_id: { [Op.in]: scope } },
        ...(evIdsAsis.length ? [{ evento_id: { [Op.in]: evIdsAsis } }] : [])
      ]
    });
  }

  if (filtros.desde) whereAnd.push({ evento_fecha_hora: { [Op.gte]: `${filtros.desde} 00:00:00` } });
  if (filtros.hasta) whereAnd.push({ evento_fecha_hora: { [Op.lte]: `${filtros.hasta} 23:59:59` } });
  if (filtros.tipo)  whereAnd.push({ evento_tipo: String(filtros.tipo).toUpperCase() });
  if (filtros.asesor_id) whereAnd.push({ evento_asesor_id: parseInt(filtros.asesor_id) });
  if (filtros.link_publico === '1' || filtros.link_publico === 1 || filtros.link_publico === true) {
    whereAnd.push({ evento_registros_publicos_habilitado: 1 });
  }
  if (filtros.q) {
    whereAnd.push({ evento_titulo: { [Op.like]: `%${String(filtros.q).trim()}%` } });
  }

  const where = whereAnd.length ? { [Op.and]: whereAnd } : {};

  const eventos = await SvEventoAgenda.findAll({
    where,
    include: [
      { model: SvUsuario, as: 'asesor', attributes: ['usr_id','usr_nombre','usr_apellido'] },
      { model: SvEventoAsistente, as: 'asistentes',
        where: { eva_activo: 1 }, required: false,
        attributes: ['eva_id'] }
    ],
    order: [['evento_fecha_hora', 'DESC']],
    limit: 500
  });

  // Batch: 1 sola query para todos los pool counts (evita N+1)
  const eventosJson = eventos.map(e => e.toJSON ? e.toJSON() : e);
  const eventosConLink = eventosJson.filter(e => e.evento_registros_publicos_habilitado);

  const poolCountsMap = new Map(); // evento_id → { total, pendientes }
  if (eventosConLink.length) {
    const poolStats = await SvEventoPoolRegistro.findAll({
      attributes: [
        'pool_evento_id',
        [fn('COUNT', col('pool_id')), 'total'],
        [fn('SUM', literal('CASE WHEN pool_prosp_id IS NULL THEN 1 ELSE 0 END')), 'pendientes']
      ],
      where: { pool_evento_id: { [Op.in]: eventosConLink.map(e => e.evento_id) } },
      group: ['pool_evento_id'],
      raw: true
    });
    for (const s of poolStats) {
      poolCountsMap.set(s.pool_evento_id, {
        total:      parseInt(s.total) || 0,
        pendientes: parseInt(s.pendientes) || 0
      });
    }
  }

  const rows = [];
  for (const evJson of eventosJson) {
    const counts = poolCountsMap.get(evJson.evento_id) || { total: 0, pendientes: 0 };
    const pool_total = counts.total;
    const pool_pendientes = counts.pendientes;
    rows.push({
      evento_id:                            evJson.evento_id,
      evento_titulo:                        evJson.evento_titulo,
      evento_tipo:                          evJson.evento_tipo,
      evento_fecha_hora:                    evJson.evento_fecha_hora,
      evento_fecha_fin:                     evJson.evento_fecha_fin,
      evento_modo_fechas:                   evJson.evento_modo_fechas,
      evento_registros_publicos_habilitado: !!evJson.evento_registros_publicos_habilitado,
      evento_link_hash:                     evJson.evento_link_hash,
      evento_meta_leads:                    evJson.evento_meta_leads,
      dueño:                                evJson.asesor,
      count_asistentes:                     (evJson.asistentes || []).length,
      pool_total,
      pool_pendientes
    });
  }
  return rows;
}

module.exports = {
  crear, actualizar, marcarCompletado, eliminar, getOne,
  actualizarMetricasAsistente, resumen, listado,
  TIPOS_VALIDOS
};
