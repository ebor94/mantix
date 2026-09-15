/**
 * sv/services/agenda.service.js
 * Migración 018 — Agenda unificada del asesor.
 * Migración 020 (SP-1a) — soporte multi-asesor: un evento aparece en la
 *   agenda de cada asistente activo (no sólo del dueño creador) y los
 *   eventos que abarcan varios días aparecen en cada día del rango.
 *
 *   listarDia({ asesorId, fecha, scope, actor }):
 *     Combina en una sola respuesta cronológica:
 *       - Prospectos con prosp_prox_gestion_fecha = fecha
 *       - Eventos de sv_org_eventos_agenda donde el asesor es dueño O
 *         asistente activo (sv_org_eventos_asistentes con eva_activo=1),
 *         y el rango [evento_fecha_hora, evento_fecha_fin] cubre la fecha.
 *
 *   listarMes({ asesorId, anio, mes, ... }):
 *     Agregado por día → { 'YYYY-MM-DD': { gestiones, eventos, total } }
 *     Cuenta un evento cada día que cae dentro del rango.
 *
 *   Permisos:
 *     - asesor: solo ve su propia agenda (asesorId forzado a su usr_id).
 *     - supervisor+ : puede pasar asesorId de cualquier miembro accesible.
 */
const { Op, fn, col } = require('sequelize');
const {
  SvProspecto, SvEstado, SvEmpresa, SvPersona, SvEventoAgenda,
  SvEventoAsistente, SvUsuario
} = require('../models');
const { grupoIdsAccesibles, usuariosAccesibles } = require('../utils/acceso');
const { ROLES } = require('../config/constants');

function esAsesor(actor) {
  const c = actor?.rol?.rol_codigo;
  return c === ROLES.ASESOR || c === ROLES.AGENTE_SVC;
}

async function resolverAsesor(actor, asesorIdQuery) {
  if (esAsesor(actor)) return { asesorId: actor.usr_id, restringirGrupo: false };
  if (!asesorIdQuery) return { asesorId: null, restringirGrupo: true };
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

async function usrIdsDelScope(actor) {
  const grupos = grupoIdsAccesibles(actor);
  if (grupos === null) return null; // SUPER_ADMIN — sin filtro
  const rows = await SvUsuario.findAll({
    where: { usr_grupo_id: { [Op.in]: grupos } },
    attributes: ['usr_id']
  });
  return rows.map(u => u.usr_id);
}

async function listarDia({ asesorId, fecha, actor }) {
  const { asesorId: usrId } = await resolverAsesor(actor, asesorId);
  const dia = fecha; // YYYY-MM-DD

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

/**
 * Ventana de fecha: el evento cubre el día si su fecha_hora es <= fin del día
 * Y (evento_fecha_fin >= inicio del día, o si es null → fecha_hora >= inicio).
 * Esto soporta eventos de rango (fecha_fin != null) y eventos puntuales.
 */
function ventanaFecha(inicio, fin) {
  return {
    [Op.and]: [
      { evento_fecha_hora: { [Op.lte]: fin } },
      { [Op.or]: [
        { evento_fecha_fin: { [Op.gte]: inicio } },
        { [Op.and]: [
          { evento_fecha_fin: null },
          { evento_fecha_hora: { [Op.gte]: inicio } }
        ]}
      ]}
    ]
  };
}

async function listarEventosDia({ asesorId, fecha, actor }) {
  const inicio = `${fecha} 00:00:00`;
  const fin    = `${fecha} 23:59:59`;

  let scopeOr;
  if (asesorId) {
    // Eventos donde el asesor es dueño O asistente activo
    const asisRows = await SvEventoAsistente.findAll({
      where: { eva_usr_id: asesorId, eva_activo: 1 },
      attributes: ['eva_evento_id']
    });
    const evIdsAsis = asisRows.map(a => a.eva_evento_id);
    scopeOr = {
      [Op.or]: [
        { evento_asesor_id: asesorId },
        ...(evIdsAsis.length ? [{ evento_id: { [Op.in]: evIdsAsis } }] : [])
      ]
    };
  } else {
    // Supervisor+ sin asesorId: todos los del scope
    const usrIds = await usrIdsDelScope(actor);
    if (usrIds === null) {
      scopeOr = null; // sin filtro
    } else {
      const asisRows = await SvEventoAsistente.findAll({
        where: { eva_usr_id: { [Op.in]: usrIds }, eva_activo: 1 },
        attributes: ['eva_evento_id']
      });
      const evIdsAsis = [...new Set(asisRows.map(a => a.eva_evento_id))];
      scopeOr = {
        [Op.or]: [
          { evento_asesor_id: { [Op.in]: usrIds } },
          ...(evIdsAsis.length ? [{ evento_id: { [Op.in]: evIdsAsis } }] : [])
        ]
      };
    }
  }

  const where = scopeOr
    ? { [Op.and]: [ventanaFecha(inicio, fin), scopeOr] }
    : ventanaFecha(inicio, fin);

  return SvEventoAgenda.findAll({
    where,
    include: [
      { model: SvUsuario, as: 'asesor',    attributes: ['usr_id','usr_nombre','usr_apellido'] },
      { model: SvUsuario, as: 'creadoPor', attributes: ['usr_id','usr_nombre','usr_apellido'] },
      { model: SvUsuario, as: 'apoyo',     attributes: ['usr_id','usr_nombre','usr_apellido'], required: false },
      { model: SvEmpresa, as: 'empresa',   attributes: ['empresa_id','empresa_razon_social'], required: false },
      { model: SvEventoAsistente, as: 'asistentes',
        where: { eva_activo: 1 }, required: false,
        include: [{ model: SvUsuario, as: 'usuario', attributes: ['usr_id','usr_nombre','usr_apellido'] }]
      }
    ],
    order: [['evento_fecha_hora', 'ASC']]
  });
}

/**
 * Resumen por día en un mes (para colorear dots en el calendario).
 * Un evento cuenta en cada día que cubre (soporta rango de días).
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

  // Para eventos: traemos las filas [fecha_hora, fecha_fin] del mes y expandimos por día en JS.
  const inicioTs = `${inicio} 00:00:00`;
  const finTs    = `${fin} 23:59:59`;

  let scopeOr;
  if (usrId) {
    const asisRows = await SvEventoAsistente.findAll({
      where: { eva_usr_id: usrId, eva_activo: 1 },
      attributes: ['eva_evento_id']
    });
    const evIdsAsis = asisRows.map(a => a.eva_evento_id);
    scopeOr = {
      [Op.or]: [
        { evento_asesor_id: usrId },
        ...(evIdsAsis.length ? [{ evento_id: { [Op.in]: evIdsAsis } }] : [])
      ]
    };
  } else {
    const usrIds = await usrIdsDelScope(actor);
    if (usrIds !== null) {
      const asisRows = await SvEventoAsistente.findAll({
        where: { eva_usr_id: { [Op.in]: usrIds }, eva_activo: 1 },
        attributes: ['eva_evento_id']
      });
      const evIdsAsis = [...new Set(asisRows.map(a => a.eva_evento_id))];
      scopeOr = {
        [Op.or]: [
          { evento_asesor_id: { [Op.in]: usrIds } },
          ...(evIdsAsis.length ? [{ evento_id: { [Op.in]: evIdsAsis } }] : [])
        ]
      };
    }
  }

  const whereEv = scopeOr
    ? { [Op.and]: [ventanaFecha(inicioTs, finTs), scopeOr] }
    : ventanaFecha(inicioTs, finTs);

  const [gestiones, eventosRaw] = await Promise.all([
    SvProspecto.findAll({
      where: whereProsp,
      attributes: [
        [col('prosp_prox_gestion_fecha'), 'fecha'],
        [fn('COUNT', col('prosp_id')), 'total']
      ],
      group: ['prosp_prox_gestion_fecha'], raw: true
    }),
    // Trae SOLO fechas para expandir cada evento por cada día que cubre
    SvEventoAgenda.findAll({
      where: whereEv,
      attributes: ['evento_id', 'evento_fecha_hora', 'evento_fecha_fin'],
      raw: true
    })
  ]);

  const mapa = {};
  for (const g of gestiones) {
    const k = g.fecha instanceof Date ? g.fecha.toISOString().slice(0,10) : String(g.fecha).slice(0,10);
    mapa[k] = mapa[k] || { gestiones: 0, eventos: 0, total: 0 };
    mapa[k].gestiones += parseInt(g.total);
    mapa[k].total     += parseInt(g.total);
  }

  // Expandir cada evento a los días que cubre dentro del mes consultado
  const mesInicio = new Date(`${inicio}T00:00:00`);
  const mesFin    = new Date(`${fin}T23:59:59`);
  for (const ev of eventosRaw) {
    const ini = new Date(ev.evento_fecha_hora);
    const fn2 = ev.evento_fecha_fin ? new Date(ev.evento_fecha_fin) : ini;
    // Recorta al rango del mes
    const desde = ini < mesInicio ? mesInicio : ini;
    const hasta = fn2 > mesFin    ? mesFin    : fn2;
    // Itera día por día
    const cursor = new Date(desde);
    cursor.setHours(0, 0, 0, 0);
    const stop = new Date(hasta);
    stop.setHours(0, 0, 0, 0);
    while (cursor <= stop) {
      const k = cursor.toISOString().slice(0, 10);
      mapa[k] = mapa[k] || { gestiones: 0, eventos: 0, total: 0 };
      mapa[k].eventos += 1;
      mapa[k].total   += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return mapa;
}

/**
 * Rango lunes-domingo de una semana ISO 8601.
 * ISO week: lunes es día 1; primera semana del año contiene el 4 de enero.
 */
function rangoSemanaISO(anio, semana) {
  const jan4 = new Date(Date.UTC(anio, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1..7 (dom=7)
  const lunesW1 = new Date(jan4);
  lunesW1.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const lunes = new Date(lunesW1);
  lunes.setUTCDate(lunesW1.getUTCDate() + (semana - 1) * 7);
  const domingo = new Date(lunes);
  domingo.setUTCDate(lunes.getUTCDate() + 6);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { lunes: fmt(lunes), domingo: fmt(domingo) };
}

/**
 * Agenda semanal agregada (SP-2): eventos + gestiones por día de una semana
 * ISO 8601, con soporte multi-asesor y ventana de fecha para eventos
 * multi-día (reusa ventanaFecha()).
 *
 * listarSemana({ anio, semanaISO, asesoresIds, actor }):
 *   - Si asesoresIds trae ids, deben estar todos dentro de usuariosAccesibles(actor)
 *     (si no, FORBIDDEN); si viene vacío/null, usa todo el scope del actor.
 *   - Retorna { lunes, domingo, por_dia: {[fecha]: {eventos, gestiones}} }.
 */
async function listarSemana({ anio, semanaISO, asesoresIds, actor }) {
  const scope = await usuariosAccesibles(actor); // null = super_admin, number[] = resto
  const idsPedidos = Array.isArray(asesoresIds) ? asesoresIds.map(n => parseInt(n)).filter(Boolean) : [];

  // Validar scope
  let idsFinal;
  if (idsPedidos.length === 0) {
    idsFinal = scope; // null o [ids]
  } else {
    if (scope !== null) {
      const fuera = idsPedidos.filter(id => !scope.includes(id));
      if (fuera.length) { const e = new Error(`Asesor(es) fuera de tu alcance: ${fuera.join(',')}`); e.code = 'FORBIDDEN'; throw e; }
    }
    idsFinal = idsPedidos;
  }

  const { lunes, domingo } = rangoSemanaISO(parseInt(anio), parseInt(semanaISO));

  const inicioTs = `${lunes} 00:00:00`;
  const finTs    = `${domingo} 23:59:59`;

  // Construir where (dueño OR asistente activo, dentro de idsFinal)
  let scopeOr = null;
  if (Array.isArray(idsFinal)) {
    const asisRows = await SvEventoAsistente.findAll({
      where: { eva_usr_id: { [Op.in]: idsFinal }, eva_activo: 1 },
      attributes: ['eva_evento_id']
    });
    const evIdsAsis = [...new Set(asisRows.map(a => a.eva_evento_id))];
    scopeOr = {
      [Op.or]: [
        { evento_asesor_id: { [Op.in]: idsFinal } },
        ...(evIdsAsis.length ? [{ evento_id: { [Op.in]: evIdsAsis } }] : [])
      ]
    };
  }

  const whereEv = scopeOr
    ? { [Op.and]: [ventanaFecha(inicioTs, finTs), scopeOr] }
    : ventanaFecha(inicioTs, finTs);

  const eventos = await SvEventoAgenda.findAll({
    where: whereEv,
    include: [
      { model: SvUsuario, as: 'asesor', attributes: ['usr_id','usr_nombre','usr_apellido'] },
      { model: SvUsuario, as: 'apoyo',  attributes: ['usr_id','usr_nombre','usr_apellido'], required: false },
      { model: SvEmpresa, as: 'empresa', attributes: ['empresa_id','empresa_razon_social'], required: false },
      { model: SvEventoAsistente, as: 'asistentes',
        where: { eva_activo: 1 }, required: false,
        include: [{ model: SvUsuario, as: 'usuario', attributes: ['usr_id','usr_nombre','usr_apellido'] }] }
    ],
    order: [['evento_fecha_hora', 'ASC']]
  });

  // Distribuir eventos por día que cubren
  const por_dia = {};
  const lunesDate = new Date(`${lunes}T00:00:00`);
  const domingoFinDate = new Date(`${domingo}T23:59:59`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunesDate); d.setDate(lunesDate.getDate() + i);
    const k = d.toISOString().slice(0, 10);
    por_dia[k] = { eventos: [], gestiones: [] };
  }
  for (const ev of eventos) {
    const ini = new Date(ev.evento_fecha_hora);
    const fin = ev.evento_fecha_fin ? new Date(ev.evento_fecha_fin) : ini;
    const desde = ini < lunesDate ? lunesDate : ini;
    const hasta = fin > domingoFinDate ? domingoFinDate : fin;
    const cursor = new Date(desde); cursor.setHours(0, 0, 0, 0);
    const stop = new Date(hasta); stop.setHours(0, 0, 0, 0);
    while (cursor <= stop) {
      const k = cursor.toISOString().slice(0, 10);
      if (por_dia[k]) por_dia[k].eventos.push(ev.toJSON ? ev.toJSON() : ev);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // Gestiones próximas por día (mismo criterio que listarDia, en rango completo)
  const whereProsp = {
    prosp_prox_gestion_fecha: { [Op.between]: [lunes, domingo] },
    prosp_activo: 1
  };
  if (Array.isArray(idsFinal)) whereProsp.prosp_asesor_id = { [Op.in]: idsFinal };
  const gestiones = await SvProspecto.findAll({
    where: whereProsp,
    attributes: ['prosp_id','prosp_asesor_id','prosp_prox_gestion_fecha','prosp_prox_gestion_hora','prosp_prioridad'],
    include: [
      { model: SvEstado,  as: 'estado',  attributes: ['estado_id','estado_codigo','estado_nombre','estado_color_hex'] },
      { model: SvPersona, as: 'persona', attributes: ['persona_id','persona_nombre','persona_apellido','persona_telefono_principal'] },
      { model: SvUsuario, as: 'asesor',  attributes: ['usr_id','usr_nombre','usr_apellido'] }
    ]
  });
  for (const g of gestiones) {
    const k = g.prosp_prox_gestion_fecha instanceof Date
      ? g.prosp_prox_gestion_fecha.toISOString().slice(0, 10)
      : String(g.prosp_prox_gestion_fecha).slice(0, 10);
    if (por_dia[k]) por_dia[k].gestiones.push(g.toJSON ? g.toJSON() : g);
  }

  return { lunes, domingo, por_dia };
}

module.exports = { listarDia, listarMes, listarSemana };
