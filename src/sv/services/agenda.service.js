/**
 * sv/services/agenda.service.js
 * Migración 018 — Agenda unificada del asesor.
 *
 *   listarDia({ asesorId, fecha, scope, actor }):
 *     Combina en una sola respuesta cronológica:
 *       - Prospectos con prosp_prox_gestion_fecha = fecha   (EMP + PAP, sin importar grupo)
 *       - Eventos manuales del asesor (sv_org_eventos_agenda) en ese día.
 *
 *   listarMes({ asesorId, anio, mes, ... }):
 *     Agregado por día → { 'YYYY-MM-DD': { gestiones, eventos, total } } para
 *     que el frontend pinte dots en MiniCalendar.
 *
 *   Permisos:
 *     - asesor: solo ve su propia agenda (asesorId forzado a su usr_id).
 *     - supervisor+ : puede pasar asesorId de cualquier miembro de su grupo.
 */
const { Op, fn, col } = require('sequelize');
const {
  SvProspecto, SvEstado, SvEmpresa, SvPersona, SvEventoAgenda, SvUsuario
} = require('../models');
const { grupoIdsAccesibles } = require('../utils/acceso');
const { ROLES } = require('../config/constants');

function esAsesor(actor) {
  const c = actor?.rol?.rol_codigo;
  return c === ROLES.ASESOR || c === ROLES.AGENTE_SVC;
}

/**
 * Resuelve a qué asesor consultar según el rol del actor.
 *  - Si actor es asesor → siempre su propio usr_id (ignora cualquier query).
 *  - Si actor es supervisor+ → respeta asesorId del query (puede ser null = todo el grupo).
 *  Lanza error si el supervisor intenta consultar un asesor fuera de su grupo.
 */
async function resolverAsesor(actor, asesorIdQuery) {
  if (esAsesor(actor)) return { asesorId: actor.usr_id, restringirGrupo: false };

  if (!asesorIdQuery) {
    // null = todo el equipo accesible por el actor (lista plana)
    return { asesorId: null, restringirGrupo: true };
  }
  const asesorId = parseInt(asesorIdQuery);
  const grupos = grupoIdsAccesibles(actor);
  if (grupos !== null) {
    const target = await SvUsuario.findByPk(asesorId, { attributes: ['usr_id', 'usr_grupo_id'] });
    if (!target || !grupos.includes(target.usr_grupo_id)) {
      const e = new Error('Asesor fuera de tu grupo'); e.code = 'FORBIDDEN'; throw e;
    }
  }
  return { asesorId, restringirGrupo: false };
}

async function listarDia({ asesorId, fecha, actor }) {
  const { asesorId: usrId } = await resolverAsesor(actor, asesorId);
  const dia = fecha; // YYYY-MM-DD

  // 1) Gestiones próximas en el día (prospectos con prosp_prox_gestion_fecha = dia)
  const whereProsp = {
    prosp_prox_gestion_fecha: dia,
    prosp_activo: 1
  };
  if (usrId) whereProsp.prosp_asesor_id = usrId;
  else {
    const grupos = grupoIdsAccesibles(actor);
    if (grupos !== null) whereProsp.prosp_grupo_id = { [Op.in]: grupos };
  }

  const [gestionesProx, eventos] = await Promise.all([
    SvProspecto.findAll({
      where: whereProsp,
      attributes: [
        'prosp_id','prosp_asesor_id','prosp_grupo_id','prosp_area_id',
        'prosp_prox_gestion_fecha','prosp_prox_gestion_hora',
        'prosp_prioridad'
      ],
      include: [
        { model: SvEstado,  as: 'estado',   attributes: ['estado_id','estado_codigo','estado_nombre','estado_color_hex'] },
        { model: SvPersona, as: 'persona',  attributes: ['persona_id','persona_nombre','persona_apellido','persona_telefono_principal'] },
        { model: SvEmpresa, as: 'empresa',  attributes: ['empresa_id','empresa_razon_social','empresa_nombre_comercial'] },
        { model: SvUsuario, as: 'asesor',   attributes: ['usr_id','usr_nombre','usr_apellido'] }
      ],
      order: [['prosp_prox_gestion_hora', 'ASC']]
    }),
    listarEventosDia({ asesorId: usrId, fecha, actor })
  ]);

  return {
    fecha: dia,
    gestiones: gestionesProx,
    eventos
  };
}

async function listarEventosDia({ asesorId, fecha, actor }) {
  const inicio = `${fecha} 00:00:00`;
  const fin    = `${fecha} 23:59:59`;
  const where = { evento_fecha_hora: { [Op.between]: [inicio, fin] } };
  if (asesorId) where.evento_asesor_id = asesorId;
  else {
    const grupos = grupoIdsAccesibles(actor);
    if (grupos !== null) {
      const ids = await SvUsuario.findAll({
        where: { usr_grupo_id: { [Op.in]: grupos } },
        attributes: ['usr_id']
      });
      where.evento_asesor_id = { [Op.in]: ids.map(u => u.usr_id) };
    }
  }
  return SvEventoAgenda.findAll({
    where,
    include: [
      { model: SvUsuario, as: 'asesor',    attributes: ['usr_id','usr_nombre','usr_apellido'] },
      { model: SvUsuario, as: 'creadoPor', attributes: ['usr_id','usr_nombre','usr_apellido'] },
      { model: SvEmpresa, as: 'empresa',   attributes: ['empresa_id','empresa_razon_social'], required: false }
    ],
    order: [['evento_fecha_hora', 'ASC']]
  });
}

/**
 * Resumen por día en un mes (para colorear dots en el calendario).
 *   { 'YYYY-MM-DD': { gestiones: 3, eventos: 1, total: 4 } }
 */
async function listarMes({ asesorId, anio, mes, actor }) {
  const { asesorId: usrId } = await resolverAsesor(actor, asesorId);

  const inicio = `${anio}-${String(mes).padStart(2, '0')}-01`;
  const finDate = new Date(parseInt(anio), parseInt(mes), 0);
  const fin = `${anio}-${String(mes).padStart(2,'0')}-${String(finDate.getDate()).padStart(2,'0')}`;

  const whereProsp = {
    prosp_prox_gestion_fecha: { [Op.between]: [inicio, fin] },
    prosp_activo: 1
  };
  if (usrId) whereProsp.prosp_asesor_id = usrId;
  else {
    const grupos = grupoIdsAccesibles(actor);
    if (grupos !== null) whereProsp.prosp_grupo_id = { [Op.in]: grupos };
  }

  const whereEv = {
    evento_fecha_hora: { [Op.between]: [`${inicio} 00:00:00`, `${fin} 23:59:59`] }
  };
  if (usrId) whereEv.evento_asesor_id = usrId;
  else {
    const grupos = grupoIdsAccesibles(actor);
    if (grupos !== null) {
      const ids = await SvUsuario.findAll({
        where: { usr_grupo_id: { [Op.in]: grupos } },
        attributes: ['usr_id']
      });
      whereEv.evento_asesor_id = { [Op.in]: ids.map(u => u.usr_id) };
    }
  }

  const [gestiones, eventos] = await Promise.all([
    SvProspecto.findAll({
      where: whereProsp,
      attributes: [
        [col('prosp_prox_gestion_fecha'), 'fecha'],
        [fn('COUNT', col('prosp_id')), 'total']
      ],
      group: ['prosp_prox_gestion_fecha'], raw: true
    }),
    SvEventoAgenda.findAll({
      where: whereEv,
      attributes: [
        [fn('DATE', col('evento_fecha_hora')), 'fecha'],
        [fn('COUNT', col('evento_id')), 'total']
      ],
      group: [fn('DATE', col('evento_fecha_hora'))], raw: true
    })
  ]);

  const mapa = {};
  for (const g of gestiones) {
    const k = g.fecha instanceof Date ? g.fecha.toISOString().slice(0,10) : String(g.fecha).slice(0,10);
    mapa[k] = mapa[k] || { gestiones: 0, eventos: 0, total: 0 };
    mapa[k].gestiones += parseInt(g.total);
    mapa[k].total     += parseInt(g.total);
  }
  for (const e of eventos) {
    const k = e.fecha instanceof Date ? e.fecha.toISOString().slice(0,10) : String(e.fecha).slice(0,10);
    mapa[k] = mapa[k] || { gestiones: 0, eventos: 0, total: 0 };
    mapa[k].eventos += parseInt(e.total);
    mapa[k].total   += parseInt(e.total);
  }
  return mapa;
}

module.exports = { listarDia, listarMes };
