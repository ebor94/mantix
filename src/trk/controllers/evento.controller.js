const svc = require('../services/evento.service');
const { ok } = require('../utils/respuesta');
const { ctxDe } = require('../utils/ctx');

exports.estado = async (req, res) => ok(res, await svc.estadoPublico());

exports.pantalla = async (req, res) => ok(res, await svc.cambiarPantalla(req.body, ctxDe(req)));
exports.tablero = async (req, res) => ok(res, await svc.tablero());
