/**
 * sv/controllers/personas.controller.js
 * Leer o modificar una persona exige relación con ella: ser cross-área o
 * tener al menos un prospecto suyo en el alcance (utils/alcancePersona). El
 * historial cross-área además exige nivel ≤ 3 (authorizeLevel en la ruta).
 * buscar y create no exigen relación: son el anti-duplicado del alta.
 *
 * Los errores se reenvían con next(e): en Express 4 una promesa rechazada en
 * un handler async no llega al middleware de errores y server.js termina el
 * proceso ante un unhandledRejection.
 */
const personas = require('../services/personas.service');
const { ok, created, fail } = require('../utils/response');
const { ERROR_CODES } = require('../config/constants');
const { fueraDeAlcancePersona } = require('../utils/alcancePersona');

/**
 * Middleware de ruta para /:id. Valida el id, verifica la relación del usuario
 * con la persona y deja el id numérico en req.personaId. Para quien no es
 * cross-área, una persona inexistente responde 403 (no tiene prospectos) y no
 * 404: el código no revela qué ids existen. Todo el cuerpo va dentro del try:
 * en un handler async de Express 4 un throw sin atrapar tumba el proceso.
 */
async function exigirRelacion(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Persona no encontrada');
    }
    req.personaId = id;
    if (req.scope?.crossArea) return next();

    const prospectos = await personas.alcancesDePersona(id);
    const motivo = fueraDeAlcancePersona(req.user, req.scope, prospectos);
    if (motivo) return fail(res, 403, ERROR_CODES.FORBIDDEN, motivo);
    return next();
  } catch (e) {
    return next(e);
  }
}

async function buscar(req, res, next) {
  try {
    const { telefono } = req.query;
    const persona = await personas.buscarPorTelefono(telefono);
    if (!persona) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Persona no encontrada');
    // Cross-área: prospectos activos del cliente (campos recortados) para que
    // el frontend muestre el aviso antes de crear otro.
    const prospectos = await personas.prospectosActivos(persona.persona_id);
    return ok(res, { persona, prospectos_activos: prospectos });
  } catch (e) {
    return next(e);
  }
}

async function getOne(req, res, next) {
  try {
    const persona = await personas.obtener(req.personaId);
    if (!persona) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Persona no encontrada');
    return ok(res, persona);
  } catch (e) {
    return next(e);
  }
}

async function prospectosActivos(req, res, next) {
  try {
    const p = await personas.prospectosActivos(req.personaId);
    return ok(res, p);
  } catch (e) {
    return next(e);
  }
}

async function historialCompleto(req, res, next) {
  try {
    const r = await personas.historialCompleto(req.personaId);
    if (!r) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Persona no encontrada');
    return ok(res, r);
  } catch (e) {
    return next(e);
  }
}

async function create(req, res, next) {
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
    return next(e);
  }
}

async function update(req, res, next) {
  try {
    const persona = await personas.actualizar(req.personaId, req.body);
    return ok(res, persona);
  } catch (e) {
    if (e.code === 'DUPLICATE_PHONE') {
      return fail(res, 409, ERROR_CODES.DUPLICATE_PHONE, 'Teléfono ya existe', {
        persona: e.persona,
        prospectos_activos: e.prospectos_activos || []
      });
    }
    if (e.code === 'NOT_FOUND')        return fail(res, 404, ERROR_CODES.NOT_FOUND, e.message);
    if (e.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, e.message);
    return next(e);
  }
}

module.exports = { exigirRelacion, buscar, getOne, prospectosActivos, historialCompleto, create, update };
