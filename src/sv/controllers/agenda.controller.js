/**
 * sv/controllers/agenda.controller.js
 * Endpoints de agenda transversal + CRUD eventos (migración 018).
 */
const agenda = require('../services/agenda.service');
const eventos = require('../services/eventosAgenda.service');
const { ok, created, fail, noContent } = require('../utils/response');
const { ERROR_CODES } = require('../config/constants');

function manejarError(res, e) {
  if (e.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, e.message);
  if (e.code === 'FORBIDDEN')        return fail(res, 403, ERROR_CODES.FORBIDDEN,        e.message);
  if (e.code === 'NOT_FOUND')        return fail(res, 404, ERROR_CODES.NOT_FOUND,        e.message);
  throw e;
}

// ─── Agenda unificada ────────────────────────────────────────────────────────

async function listarDia(req, res) {
  if (!req.query.fecha) return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, 'Parámetro fecha (YYYY-MM-DD) es requerido');
  try {
    const r = await agenda.listarDia({
      asesorId: req.query.asesor_id || null,
      fecha:    String(req.query.fecha),
      actor:    req.user
    });
    return ok(res, r);
  } catch (e) { return manejarError(res, e); }
}

async function listarMes(req, res) {
  if (!req.query.anio || !req.query.mes) {
    return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, 'Parámetros anio y mes son requeridos');
  }
  try {
    const r = await agenda.listarMes({
      asesorId: req.query.asesor_id || null,
      anio:     parseInt(req.query.anio),
      mes:      parseInt(req.query.mes),
      actor:    req.user
    });
    return ok(res, r);
  } catch (e) { return manejarError(res, e); }
}

// ─── CRUD eventos ────────────────────────────────────────────────────────────

async function crearEvento(req, res) {
  try {
    const r = await eventos.crear(req.body, req.user);
    return created(res, r);
  } catch (e) { return manejarError(res, e); }
}

async function obtenerEvento(req, res) {
  try {
    const r = await eventos.getOne(parseInt(req.params.id), req.user);
    return ok(res, r);
  } catch (e) { return manejarError(res, e); }
}

async function actualizarEvento(req, res) {
  try {
    const r = await eventos.actualizar(parseInt(req.params.id), req.body, req.user);
    return ok(res, r);
  } catch (e) { return manejarError(res, e); }
}

async function marcarCompletadoEvento(req, res) {
  try {
    const r = await eventos.marcarCompletado(parseInt(req.params.id), !!req.body.completado, req.user);
    return ok(res, r);
  } catch (e) { return manejarError(res, e); }
}

async function eliminarEvento(req, res) {
  try {
    await eventos.eliminar(parseInt(req.params.id), req.user);
    return noContent(res);
  } catch (e) { return manejarError(res, e); }
}

module.exports = {
  listarDia, listarMes,
  crearEvento, obtenerEvento, actualizarEvento, marcarCompletadoEvento, eliminarEvento
};
