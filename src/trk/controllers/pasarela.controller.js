const svc = require('../services/pasarela.service');
const { ok } = require('../utils/respuesta');
const { ctxDe } = require('../utils/ctx');

exports.llamar = async (req, res) => ok(res, await svc.llamarAPasarela(req.params.id, ctxDe(req)));
exports.reordenar = async (req, res) => ok(res, await svc.reordenarCola(req.body, ctxDe(req)));
