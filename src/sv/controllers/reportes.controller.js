/**
 * sv/controllers/reportes.controller.js
 */
const reportes = require('../services/reportes.service');
const { ok, fail } = require('../utils/response');
const { ERROR_CODES, ROLES } = require('../config/constants');

async function dashboard(req, res) {
  const scope = { ...req.scope };
  // Permitir override si tiene scope global
  if (req.query.area_id && [ROLES.SUPER_ADMIN].includes(req.user.rol?.rol_codigo)) scope.areaId = parseInt(req.query.area_id);
  if (req.query.grupo_id) scope.grupoId = parseInt(req.query.grupo_id);
  if (req.query.asesor_id) scope.asesorId = parseInt(req.query.asesor_id);
  const r = await reportes.dashboardArea({ scope, fecha: req.query.fecha });
  return ok(res, r);
}

async function asesor(req, res) {
  const usrId = parseInt(req.params.id);
  // ASESOR solo ve su propio reporte
  if (req.user.rol?.rol_codigo === ROLES.ASESOR && usrId !== req.user.usr_id) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo puedes ver tu propio reporte');
  }
  const r = await reportes.reporteAsesor(usrId, {
    mes:   req.query.mes  && parseInt(req.query.mes),
    anio:  req.query.anio && parseInt(req.query.anio),
    desde: req.query.desde,
    hasta: req.query.hasta
  });
  return ok(res, r);
}

async function equipo(req, res) {
  const c = req.user.rol?.rol_codigo;
  if (![ROLES.SUPER_ADMIN, ROLES.ADMIN_AREA, ROLES.JEFE_PAP, ROLES.SUPERVISOR].includes(c)) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo SUPERVISOR+ pueden ver el equipo');
  }

  // Grupos accesibles por el supervisor: principal + extra
  const gruposAccesibles = new Set();
  if (req.user.usr_grupo_id) gruposAccesibles.add(req.user.usr_grupo_id);
  for (const g of (req.user.gruposExtra || [])) gruposAccesibles.add(g.grupo_id);

  // JEFE_PAP: fuerza grupo PAP (3), ignora override por query
  let grupoId;
  if (c === ROLES.JEFE_PAP) {
    grupoId = 3;
  } else {
    grupoId = req.query.grupo_id ? parseInt(req.query.grupo_id) : req.user.usr_grupo_id;
  }

  // SUPER_ADMIN puede ver cualquier grupo; ADMIN_AREA puede ver grupos de su área
  if (c === ROLES.SUPERVISOR && !gruposAccesibles.has(grupoId)) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Grupo fuera de tu alcance');
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
