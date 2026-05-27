/**
 * sv/controllers/renovaciones.controller.js
 * Fase 8 — endpoints de renovación B2B.
 */
const renov = require('../services/renovaciones.service');
const { ok, fail } = require('../utils/response');
const { ERROR_CODES, ROLES, AREAS } = require('../config/constants');
const { tieneAccesoArea } = require('../utils/acceso');

function requireAreaEmp(req, res, next) {
  if (tieneAccesoArea(req.user, AREAS.PREV_EMP)) return next();
  return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo accesible para usuarios del área Previsión Empresariales');
}

async function marcarConvenio(req, res) {
  try {
    const r = await renov.marcarConvenioFirmado(parseInt(req.params.id), req.body, req.user.usr_id);
    return ok(res, r);
  } catch (e) {
    if (e.code === 'NOT_FOUND')        return fail(res, 404, ERROR_CODES.NOT_FOUND, e.message);
    if (e.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, e.message);
    if (e.code === 'INTERNAL_ERROR')   return fail(res, 500, ERROR_CODES.INTERNAL_ERROR, e.message);
    throw e;
  }
}

async function renovacionesProximas(req, res) {
  // Scope: asesor ve solo lo suyo; supervisor/admin ven todo
  const scope = {};
  const nivel = req.user.rol?.rol_nivel ?? 99;
  if (nivel > 3) scope.asesorId = req.user.usr_id;
  const r = await renov.renovacionesProximas({
    dias:  req.query.dias ? parseInt(req.query.dias) : undefined,
    scope
  });
  return ok(res, r);
}

async function vencidosSinRenovar(req, res) {
  const scope = {};
  const nivel = req.user.rol?.rol_nivel ?? 99;
  if (nivel > 3) scope.asesorId = req.user.usr_id;
  const r = await renov.vencidosSinRenovar({ scope });
  return ok(res, r);
}

// Para debugging / pruebas manuales — solo SUPER_ADMIN
async function ejecutarJobManual(req, res) {
  if (req.user.rol?.rol_codigo !== ROLES.SUPER_ADMIN) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo SUPER_ADMIN');
  }
  const accion = req.query.accion; // 'crear' | 'vencer'
  if (accion === 'crear') {
    const r = await renov.procesarRenovacionesPendientes();
    return ok(res, r);
  }
  if (accion === 'vencer') {
    const r = await renov.procesarVencimientosSinRenovar();
    return ok(res, r);
  }
  return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, 'accion debe ser "crear" o "vencer"');
}

module.exports = {
  requireAreaEmp,
  marcarConvenio, renovacionesProximas, vencidosSinRenovar,
  ejecutarJobManual
};
