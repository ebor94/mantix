const svc = require('../services/matriz.service');
const { ok } = require('../utils/respuesta');
const { ctxDe } = require('../utils/ctx');

exports.matriz = async (req, res) => ok(res, await svc.obtenerMatriz(req.query.categoria, ctxDe(req)));
exports.guardarBorrador = async (req, res) => ok(res, await svc.guardarBorrador(req.params.participanteId, req.body.puntajes, ctxDe(req)));
