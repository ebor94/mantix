/**
 * sv/controllers/empresas.controller.js
 */
const empresas = require('../services/empresas.service');
const { ok, created, fail } = require('../utils/response');
const { ERROR_CODES, AREAS } = require('../config/constants');
const { tieneAccesoArea } = require('../utils/acceso');

// Middleware: requiere acceso (área principal o área extra) a PREV-EMP
function requireAreaEmp(req, res, next) {
  if (tieneAccesoArea(req.user, AREAS.PREV_EMP)) return next();
  return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Empresas solo disponibles para usuarios con acceso al área Previsión Empresariales');
}

async function list(req, res) {
  const r = await empresas.list({
    filtros: req.query, scope: req.scope, page: req.query.page, limit: req.query.limit
  });
  return ok(res, r);
}

async function buscar(req, res) {
  const empresa = await empresas.buscarPorNit(req.query.nit);
  if (!empresa) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Empresa no encontrada');
  return ok(res, empresa);
}

async function getOne(req, res) {
  const id = parseInt(req.params.id);
  const r = await empresas.obtenerConDetalle(id);
  if (!r) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Empresa no encontrada');
  // Fase 6: bandera para mostrar banner de Fidelización en la ficha
  try {
    const fideliz = require('../services/fidelizacion.service');
    r.tiene_convenio_firmado = await fideliz.empresaTieneConvenio(id);
  } catch (_e) {
    r.tiene_convenio_firmado = false;
  }
  return ok(res, r);
}

async function create(req, res) {
  try {
    const e = await empresas.crear(req.body);
    return created(res, e);
  } catch (err) {
    if (err.code === 'DUPLICATE_NIT') return fail(res, 409, ERROR_CODES.DUPLICATE_NIT, 'NIT ya registrado', { empresa: err.empresa });
    if (err.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, err.message);
    throw err;
  }
}

async function update(req, res) {
  try {
    const e = await empresas.actualizar(parseInt(req.params.id), req.body);
    return ok(res, e);
  } catch (err) {
    if (err.code === 'DUPLICATE_NIT')   return fail(res, 409, ERROR_CODES.DUPLICATE_NIT, 'NIT ya existe', { empresa: err.empresa });
    if (err.code === 'NOT_FOUND')        return fail(res, 404, ERROR_CODES.NOT_FOUND, err.message);
    if (err.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, err.message);
    throw err;
  }
}

module.exports = { list, buscar, getOne, create, update, requireAreaEmp };
