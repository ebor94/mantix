/**
 * sv/controllers/personas.controller.js
 */
const personas = require('../services/personas.service');
const { ok, created, fail } = require('../utils/response');
const { ERROR_CODES } = require('../config/constants');

async function buscar(req, res) {
  const { telefono } = req.query;
  const persona = await personas.buscarPorTelefono(telefono);
  if (!persona) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Persona no encontrada');
  // Cross-área: incluir prospectos activos del cliente para que el frontend muestre el warning
  const prospectos = await personas.prospectosActivos(persona.persona_id);
  return ok(res, { persona, prospectos_activos: prospectos });
}

async function getOne(req, res) {
  const persona = await personas.obtener(parseInt(req.params.id));
  if (!persona) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Persona no encontrada');
  return ok(res, persona);
}

async function prospectosActivos(req, res) {
  const p = await personas.prospectosActivos(parseInt(req.params.id));
  return ok(res, p);
}

async function historialCompleto(req, res) {
  const r = await personas.historialCompleto(parseInt(req.params.id));
  if (!r) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Persona no encontrada');
  return ok(res, r);
}

async function create(req, res) {
  try {
    const persona = await personas.crear(req.body);
    return created(res, persona);
  } catch (e) {
    if (e.code === 'DUPLICATE_PHONE') {
      return fail(res, 409, ERROR_CODES.DUPLICATE_PHONE, 'Teléfono ya existe', {
        persona: e.persona,
        prospectos_activos: e.prospectos_activos || []
      });
    }
    if (e.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, e.message);
    throw e;
  }
}

async function update(req, res) {
  try {
    const persona = await personas.actualizar(parseInt(req.params.id), req.body);
    return ok(res, persona);
  } catch (e) {
    if (e.code === 'DUPLICATE_PHONE') return fail(res, 409, ERROR_CODES.DUPLICATE_PHONE, 'Teléfono ya existe', {
      persona: e.persona,
      prospectos_activos: e.prospectos_activos || []
    });
    if (e.code === 'NOT_FOUND')        return fail(res, 404, ERROR_CODES.NOT_FOUND, e.message);
    if (e.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, e.message);
    throw e;
  }
}

module.exports = { buscar, getOne, prospectosActivos, historialCompleto, create, update };
