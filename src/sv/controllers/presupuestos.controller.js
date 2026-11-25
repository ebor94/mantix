/**
 * sv/controllers/presupuestos.controller.js — presupuesto contra realizado de un mes.
 * El alcance lo decide el servicio; sus errores los responde svErrorHandler.
 */
const presupuestos = require('../services/presupuestos.service');
const { ok } = require('../utils/response');

async function consultar(req, res) {
  const { area_id: areaId, anio, mes } = req.query;
  return ok(res, await presupuestos.consultar({ user: req.user, areaId, anio, mes }));
}

module.exports = { consultar };
