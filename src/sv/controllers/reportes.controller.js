/**
 * sv/controllers/reportes.controller.js
 * Los reportes muestran el valor vendido: cada quien ve solo lo que está a su alcance.
 */
const reportes = require('../services/reportes.service');
const { SvGrupo } = require('../models');
const { ok, fail } = require('../utils/response');
const { ERROR_CODES, ROLES, ROLES_SUPERVISORES } = require('../config/constants');
const { areaIdsAccesibles, grupoIdsAccesibles, usuariosAccesibles } = require('../utils/acceso');

// Se limitan por grupo; JEFE_PAP, siempre al grupo PAP; los demás supervisores, por área.
const ROLES_POR_GRUPO = [ROLES.SUPERVISOR, ROLES.COORDINADOR_PREVISION];
const GRUPO_PAP_ID = 3;

const rolDe = (user) => user.rol?.rol_codigo;
const prohibido = (res, mensaje) => fail(res, 403, ERROR_CODES.FORBIDDEN, mensaje);

// null = sin límite. Como número: los ids pueden llegar como texto.
const incluye = (ids, id) => ids === null || ids.map(Number).includes(Number(id));

async function asesorAlAlcance(user, usrId) {
  return Number(usrId) === Number(user.usr_id) || incluye(await usuariosAccesibles(user), usrId);
}

// Un área completa es más de lo que ve quien se limita por grupo.
function areaAlAlcance(user, areaId) {
  return !ROLES_POR_GRUPO.includes(rolDe(user)) && incluye(areaIdsAccesibles(user), areaId);
}

// Los grupos que tiene asignados (los mismos que pide su panel) y, si se limita por área, los de
// sus áreas. Devuelve false si ya respondió 404 / 403.
async function grupoAlAlcance(req, res, grupoId) {
  const grupo = await SvGrupo.findByPk(grupoId, { attributes: ['grupo_area_id'] });
  if (!grupo) { fail(res, 404, ERROR_CODES.NOT_FOUND, 'Grupo no encontrado'); return false; }
  const alcanza = incluye(grupoIdsAccesibles(req.user), grupoId) || areaAlAlcance(req.user, grupo.grupo_area_id);
  if (!alcanza) prohibido(res, 'Grupo fuera de tu alcance');
  return alcanza;
}

async function dashboard(req, res) {
  const scope = { ...req.scope };
  const { asesor_id: asesorId, grupo_id: grupoId, area_id: areaId } = req.query;
  const rol = rolDe(req.user);

  if (!ROLES_SUPERVISORES.includes(rol)) {
    scope.asesorId = req.user.usr_id; // ASESOR y AGENTE_SVC ven lo suyo aunque pidan otro
  } else {
    if (asesorId) {
      if (!(await asesorAlAlcance(req.user, asesorId))) return prohibido(res, 'Fuera de tu alcance');
      scope.asesorId = asesorId;
    }
    if (grupoId && rol !== ROLES.JEFE_PAP) {
      if (!(await grupoAlAlcance(req, res, grupoId))) return;
      scope.grupoId = grupoId;
    }
    if (areaId && rol !== ROLES.JEFE_PAP) {
      if (!areaAlAlcance(req.user, areaId)) return prohibido(res, 'Área fuera de tu alcance');
      scope.areaId = areaId;
    }
  }
  const r = await reportes.dashboardArea({ scope, fecha: req.query.fecha });
  return ok(res, r);
}

async function asesor(req, res) {
  const usrId = parseInt(req.params.id);
  if (!(await asesorAlAlcance(req.user, usrId))) return prohibido(res, 'Fuera de tu alcance');
  const r = await reportes.reporteAsesor(usrId, {
    mes:   req.query.mes  && parseInt(req.query.mes),
    anio:  req.query.anio && parseInt(req.query.anio),
    desde: req.query.desde,
    hasta: req.query.hasta
  });
  return ok(res, r);
}

async function equipo(req, res) {
  const c = rolDe(req.user);
  if (!ROLES_SUPERVISORES.includes(c)) return prohibido(res, 'Solo SUPERVISOR+ pueden ver el equipo');

  // JEFE_PAP: fuerza grupo PAP (3), ignora override por query
  let grupoId;
  if (c === ROLES.JEFE_PAP) {
    grupoId = GRUPO_PAP_ID;
  } else {
    grupoId = req.query.grupo_id ? parseInt(req.query.grupo_id) : req.user.usr_grupo_id;
    if (!(await grupoAlAlcance(req, res, grupoId))) return;
  }

  const r = await reportes.reporteEquipo({
    grupoId,
    desde: req.query.desde,
    hasta: req.query.hasta,
    fecha: req.query.fecha  // compatibilidad con clientes antiguos
  });
  return ok(res, r);
}

module.exports = { dashboard, asesor, equipo };
