/**
 * sv/controllers/prospectos.controller.js
 */
const prospectos = require('../services/prospectos.service');
const { ok, created, fail } = require('../utils/response');
const { ERROR_CODES, ROLES } = require('../config/constants');

async function list(req, res) {
  const r = await prospectos.list({
    scope:   req.scope,
    filtros: req.query,
    page:    req.query.page,
    limit:   req.query.limit
  });
  return ok(res, r);
}

async function panelDia(req, res) {
  const scope = { ...req.scope };
  if (req.query.asesor_id && (req.user.rol?.rol_codigo === ROLES.SUPERVISOR || req.user.rol?.rol_codigo === ROLES.ADMIN_AREA || req.user.rol?.rol_codigo === ROLES.SUPER_ADMIN)) {
    scope.asesorId = parseInt(req.query.asesor_id);
  }
  const r = await prospectos.panelDia({
    scope,
    fecha:      req.query.fecha,
    areaId:     req.query.area_id,
    grupoId:    req.query.grupo_id,
    subproceso: req.query.subproceso
  });
  return ok(res, r);
}

async function agendaMes(req, res) {
  const r = await prospectos.agendaMes({
    scope: req.scope,
    anio: parseInt(req.query.anio),
    mes:  parseInt(req.query.mes)
  });
  return ok(res, r);
}

async function getOne(req, res) {
  const p = await prospectos.obtenerCompleto(parseInt(req.params.id));
  if (!p) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Prospecto no encontrado');

  // Verificar scope
  const s = req.scope;
  if (s.asesorId && p.prosp_asesor_id !== s.asesorId) return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Fuera de tu alcance');
  if (s.grupoId  && !s.asesorId && p.prosp_grupo_id !== s.grupoId) return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Fuera de tu grupo');
  if (s.areaId   && !s.grupoId  && p.prosp_area_id  !== s.areaId)  return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Fuera de tu área');

  return ok(res, p);
}

async function create(req, res) {
  // ASESOR solo puede crear para sí mismo
  if (req.user.rol?.rol_codigo === ROLES.ASESOR) {
    req.body.prosp_asesor_id = req.user.usr_id;
    req.body.prosp_area_id  = req.user.usr_area_id;
    req.body.prosp_grupo_id = req.user.usr_grupo_id;
  }
  const p = await prospectos.crear(req.body, req.user.usr_id);
  return created(res, p);
}

async function update(req, res) {
  // Verificar scope antes de actualizar
  const p = await prospectos.obtenerCompleto(parseInt(req.params.id));
  if (!p) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Prospecto no encontrado');
  const s = req.scope;
  if (s.asesorId && p.prosp_asesor_id !== s.asesorId) return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Fuera de tu alcance');

  const actualizado = await prospectos.actualizar(parseInt(req.params.id), req.body);
  return ok(res, actualizado);
}

// PUT /prospectos/:id/productos — reemplaza la lista de productos de interés
async function actualizarProductos(req, res) {
  try {
    // Verificar scope (asesor solo sus prospectos)
    const p = await prospectos.obtenerCompleto(parseInt(req.params.id));
    if (!p) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Prospecto no encontrado');
    const s = req.scope;
    if (s.asesorId && p.prosp_asesor_id !== s.asesorId) return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Fuera de tu alcance');

    const r = await prospectos.actualizarProductos(parseInt(req.params.id), req.body.productos || []);
    return ok(res, r);
  } catch (err) {
    if (err.code === 'NOT_FOUND')        return fail(res, 404, ERROR_CODES.NOT_FOUND, err.message);
    if (err.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, err.message);
    throw err;
  }
}

async function reasignar(req, res) {
  // Solo SUPERVISOR+ puede reasignar
  const c = req.user.rol?.rol_codigo;
  if (![ROLES.SUPER_ADMIN, ROLES.ADMIN_AREA, ROLES.JEFE_PAP, ROLES.SUPERVISOR].includes(c)) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo SUPERVISOR o superior pueden reasignar');
  }
  const r = await prospectos.reasignar(parseInt(req.params.id), parseInt(req.body.nuevo_asesor_id));
  return ok(res, r);
}

// GET /prospectos/por-asesor?area_id=&grupo_id= — conteo por asesor para vista reasignación
async function porAsesor(req, res) {
  const c = req.user.rol?.rol_codigo;
  if (![ROLES.SUPER_ADMIN, ROLES.ADMIN_AREA, ROLES.JEFE_PAP, ROLES.SUPERVISOR].includes(c)) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo SUPERVISOR o superior puede consultar');
  }
  const r = await prospectos.prospectosPorAsesor({
    areaId:  req.query.area_id,
    grupoId: req.query.grupo_id
  });
  return ok(res, r);
}

// POST /prospectos/reasignacion-masiva — reasigna todos los prospectos de un asesor (vacaciones, retiro)
async function reasignacionMasiva(req, res) {
  const c = req.user.rol?.rol_codigo;
  if (![ROLES.SUPER_ADMIN, ROLES.ADMIN_AREA, ROLES.JEFE_PAP, ROLES.SUPERVISOR].includes(c)) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo SUPERVISOR o superior puede reasignar masivamente');
  }
  try {
    const r = await prospectos.reasignacionMasiva(req.body, req.user.usr_id);
    return ok(res, r);
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, err.message);
    throw err;
  }
}

// GET /prospectos/sin-asignar?area_id=4&grupo_id=4 — cola del supervisor
async function sinAsignar(req, res) {
  const c = req.user.rol?.rol_codigo;
  if (![ROLES.SUPER_ADMIN, ROLES.ADMIN_AREA, ROLES.JEFE_PAP, ROLES.SUPERVISOR].includes(c)) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo SUPERVISOR o superior puede ver la cola sin asignar');
  }
  const r = await prospectos.sinAsignar({
    areaId:  req.query.area_id,
    grupoId: req.query.grupo_id,
    scope:   req.scope,
    page:    req.query.page,
    limit:   req.query.limit
  });
  return ok(res, r);
}

// GET /prospectos/sin-asignar/count?area_id=4 — badge count
async function sinAsignarCount(req, res) {
  const total = await prospectos.contadorSinAsignar(req.query.area_id);
  return ok(res, { total });
}

// PATCH /prospectos/:id/asignar — body { asesor_id } — asignar a agente (idem reasignar pero semánticamente para sin-asignar)
async function asignar(req, res) {
  const c = req.user.rol?.rol_codigo;
  if (![ROLES.SUPER_ADMIN, ROLES.ADMIN_AREA, ROLES.JEFE_PAP, ROLES.SUPERVISOR].includes(c)) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo SUPERVISOR o superior puede asignar');
  }
  const r = await prospectos.reasignar(parseInt(req.params.id), parseInt(req.body.asesor_id));
  return ok(res, r);
}

module.exports = {
  list, panelDia, agendaMes, getOne, create, update, actualizarProductos,
  reasignar, porAsesor, reasignacionMasiva,
  sinAsignar, sinAsignarCount, asignar
};
