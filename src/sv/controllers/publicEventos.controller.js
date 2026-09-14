/**
 * sv/controllers/publicEventos.controller.js
 * Handlers de rutas públicas de eventos (sin svAuth).
 */
const svc = require('../services/publicEventos.service');
const { ok, created, fail } = require('../utils/response');
const { ERROR_CODES } = require('../config/constants');

async function landing(req, res) {
  const ev = await svc.obtenerPorHash(req.params.hash);
  if (!ev) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Evento no encontrado o registro cerrado');
  if (ev.fecha_fin && new Date(ev.fecha_fin) < new Date()) {
    return fail(res, 410, ERROR_CODES.CONFLICT, 'Evento ya cerrado');
  }
  return ok(res, {
    evento_id:      ev.evento_id,
    titulo:         ev.titulo,
    descripcion:    ev.descripcion,
    fecha_inicio:   ev.fecha_inicio,
    fecha_fin:      ev.fecha_fin,
    empresa_nombre: ev.empresa_nombre || null
  });
}

async function registrar(req, res) {
  try {
    const r = await svc.registrar(req.params.hash, req.body, {
      ip:        req.ip,
      userAgent: req.headers['user-agent']
    });
    if (r.dedup) return ok(res, { ok: true, dedup: true, poolId: r.poolId });
    return created(res, { ok: true, dedup: false, poolId: r.poolId });
  } catch (e) {
    if (e.code === 'NOT_FOUND')       return fail(res, 404, ERROR_CODES.NOT_FOUND, e.message);
    if (e.code === 'EVENTO_CERRADO')  return fail(res, 410, ERROR_CODES.CONFLICT, e.message);
    throw e;
  }
}

module.exports = { landing, registrar };
