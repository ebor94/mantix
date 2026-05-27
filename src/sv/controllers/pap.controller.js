/**
 * sv/controllers/pap.controller.js
 */
const pap = require('../services/pap.service');
const { ok, created, fail } = require('../utils/response');
const { ERROR_CODES, ROLES, AREAS } = require('../config/constants');
const { tieneAccesoArea } = require('../utils/acceso');

function requireAreaPap(req, res, next) {
  if (tieneAccesoArea(req.user, AREAS.PREV_PAP)) return next();
  return fail(res, 403, ERROR_CODES.FORBIDDEN, 'PAP solo disponible para usuarios con acceso al área Previsión PAP');
}

async function registroRapido(req, res) {
  try {
    const r = await pap.registroRapido(req.body, req.user.usr_id);
    return created(res, r);
  } catch (e) {
    if (e.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, e.message);
    if (e.code === 'INTERNAL_ERROR')   return fail(res, 500, ERROR_CODES.INTERNAL_ERROR, e.message);
    throw e;
  }
}

/**
 * Helper: determina el asesor a consultar.
 *  - ASESOR: siempre fuerza su propio usr_id (no puede ver otros).
 *  - SUPERVISOR / ADMIN_AREA / SUPER_ADMIN: si pasa asesor_id explícito → ese asesor;
 *    si no pasa nada → null (significa "todo el equipo", el service usa scope amplio).
 */
function asesorEfectivo(req) {
  const c = req.user.rol?.rol_codigo;
  if (c === ROLES.ASESOR || c === ROLES.AGENTE_SVC) {
    return req.user.usr_id;
  }
  return req.query.asesor_id ? parseInt(req.query.asesor_id) : null;
}

async function zonas(req, res) {
  const asesorId = asesorEfectivo(req);
  const r = await pap.zonasDelAsesor(asesorId, req.query.fecha, req.scope);
  return ok(res, r);
}

async function mapa(req, res) {
  const asesorId = asesorEfectivo(req);
  const r = await pap.mapaDelDia({
    asesorId,
    fecha: req.query.fecha,
    desde: req.query.desde,
    hasta: req.query.hasta,
    scope: req.scope
  });
  return ok(res, r);
}

async function metricas(req, res) {
  const asesorId = asesorEfectivo(req);
  // El service ya respeta el scope cuando asesorId es null
  const r = await pap.metricasAsesor(asesorId, {
    desde: req.query.desde,
    hasta: req.query.hasta,
    scope: req.scope
  });
  return ok(res, r);
}

module.exports = { registroRapido, zonas, mapa, metricas, requireAreaPap };
