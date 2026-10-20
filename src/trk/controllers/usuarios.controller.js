const svc = require('../services/usuarios.service');
const { ok } = require('../utils/respuesta');
const { ctxDe } = require('../utils/ctx');

exports.listar = async (req, res) => ok(res, await svc.listarOperativos());
exports.crear = async (req, res) => ok(res, await svc.crearOperativo(req.body, ctxDe(req)), 201);
exports.actualizar = async (req, res) => ok(res, await svc.actualizarOperativo(req.params.id, req.body, ctxDe(req)));
exports.regenerarPin = async (req, res) => ok(res, await svc.regenerarPin(req.params.id, ctxDe(req)));
