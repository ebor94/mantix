/**
 * sv/controllers/buscador.controller.js
 */
const buscador = require('../services/buscador.service');
const { ok } = require('../utils/response');

async function buscar(req, res) {
  const r = await buscador.buscar({
    q: req.query.q,
    scope: req.scope,
    limit: parseInt(req.query.limit) || 5
  });
  return ok(res, r);
}

module.exports = { buscar };
