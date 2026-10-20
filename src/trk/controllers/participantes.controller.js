const svc = require('../services/participantes.service');
const { ok } = require('../utils/respuesta');
const { ctxDe } = require('../utils/ctx');

exports.listar = async (req, res) => ok(res, await svc.listar(req.query, req.usuario));
exports.obtener = async (req, res) => ok(res, await svc.obtener(req.params.id, req.usuario));


exports.crear = async (req, res) => ok(res, await svc.crearAltaRapida(req.body, ctxDe(req)), 201);
exports.editar = async (req, res) => ok(res, await svc.editar(req.params.id, req.body, ctxDe(req)));
exports.cambiarEstado = async (req, res) => ok(res, await svc.cambiarEstado(req.params.id, req.body.estado, ctxDe(req)));
