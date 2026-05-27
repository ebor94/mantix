/**
 * sv/controllers/gestiones.controller.js
 */
const gestiones = require('../services/gestiones.service');
const { ok, created, fail } = require('../utils/response');
const { ERROR_CODES } = require('../config/constants');

async function create(req, res) {
  const g = await gestiones.crear(req.body, req.user.usr_id);
  return created(res, g);
}

async function list(req, res) {
  const r = await gestiones.historial(parseInt(req.query.prosp_id), { page: req.query.page, limit: req.query.limit });
  return ok(res, r);
}

async function resumenDia(req, res) {
  const asesorId = req.query.asesor_id ? parseInt(req.query.asesor_id) : req.user.usr_id;
  const r = await gestiones.resumenDia(asesorId, req.query.fecha);
  return ok(res, r);
}

module.exports = { create, list, resumenDia };
