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

// ─────────────────────────────────────────────────────────
// SP-1a · Multi-asesor + pool público
// ─────────────────────────────────────────────────────────
const eventoPool = require('../services/eventoPool.service');

async function actualizarEventoV2(req, res) {
  try {
    const r = await eventos.actualizar(parseInt(req.params.id), req.body, req.user);
    return ok(res, r);
  } catch (e) {
    return manejarError(res, e);
  }
}

async function listarPool(req, res) {
  try {
    const r = await eventoPool.listar(parseInt(req.params.id), req.query, req.user);
    return ok(res, r);
  } catch (e) {
    return manejarError(res, e);
  }
}

async function asignarPool(req, res) {
  try {
    const r = await eventoPool.asignar(
      parseInt(req.params.id), parseInt(req.params.pool_id),
      req.body, req.user
    );
    return ok(res, r);
  } catch (e) {
    if (e.code === 'YA_ASIGNADO') return fail(res, 409, ERROR_CODES.CONFLICT, e.message);
    return manejarError(res, e);
  }
}

async function actualizarMetricas(req, res) {
  try {
    const r = await eventos.actualizarMetricasAsistente(
      parseInt(req.params.eva_id), req.body, req.user
    );
    return ok(res, r);
  } catch (e) {
    return manejarError(res, e);
  }
}

async function resumenEvento(req, res) {
  try {
    const r = await eventos.resumen(parseInt(req.params.id), req.user);
    return ok(res, r);
  } catch (e) {
    return manejarError(res, e);
  }
}

// ─────────────────────────────────────────────────────────
// SP-2 · Agenda de seguimiento (supervisores)
// ─────────────────────────────────────────────────────────

async function semanaSeguimiento(req, res) {
  const anio = parseInt(req.query.anio);
  const semana = parseInt(req.query.semana);
  if (!anio || !semana || semana < 1 || semana > 53) {
    return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, 'Parámetros anio y semana requeridos (semana 1-53)');
  }
  try {
    const asesoresIds = req.query.asesores_ids
      ? String(req.query.asesores_ids).split(',').map(s => parseInt(s.trim())).filter(Boolean)
      : [];
    const r = await agenda.listarSemana({ anio, semanaISO: semana, asesoresIds, actor: req.user });
    return ok(res, r);
  } catch (e) {
    return manejarError(res, e);
  }
}

async function listadoEventos(req, res) {
  try {
    const r = await eventos.listado({ filtros: req.query, actor: req.user });
    return ok(res, r);
  } catch (e) {
    return manejarError(res, e);
  }
}

// ─────────────────────────────────────────────────────────
// SP-3 · OTP para edición del dueño
// ─────────────────────────────────────────────────────────
const eventoOtp = require('../services/eventoOtp.service');

async function solicitarOtpEvento(req, res) {
  try {
    const r = await eventoOtp.solicitar({
      eventoId: parseInt(req.params.id),
      cambios:  req.body.cambios,
      actor:    req.user
    });
    return ok(res, r);
  } catch (e) {
    if (e.code === 'RATE_LIMIT')  return fail(res, 429, ERROR_CODES.RATE_LIMIT || 'RATE_LIMIT', e.message);
    if (e.code === 'GCHAT_FAIL')  return fail(res, 503, 'GCHAT_FAIL',  e.message);
    return manejarError(res, e);
  }
}

async function confirmarOtpEvento(req, res) {
  try {
    const r = await eventoOtp.confirmar({
      eventoId: parseInt(req.params.id),
      otpId:    parseInt(req.body.otp_id),
      otp:      String(req.body.otp),
      actor:    req.user
    });
    return ok(res, r);
  } catch (e) {
    if (e.code === 'OTP_EXPIRED')  return fail(res, 410, 'OTP_EXPIRED',  e.message);
    if (e.code === 'OTP_CONSUMED') return fail(res, 409, 'OTP_CONSUMED', e.message);
    if (e.code === 'OTP_INVALID')  return fail(res, 401, 'OTP_INVALID',  e.message);
    return manejarError(res, e);
  }
}

module.exports = {
  listarDia, listarMes,
  crearEvento, obtenerEvento, marcarCompletadoEvento, eliminarEvento,
  actualizarEventoV2, listarPool, asignarPool, actualizarMetricas, resumenEvento,
  semanaSeguimiento, listadoEventos,
  solicitarOtpEvento, confirmarOtpEvento
};
