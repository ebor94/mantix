const svc = require('../services/categorias.service');
const { ok } = require('../utils/respuesta');
const { ctxDe } = require('../utils/ctx');

exports.listar = async (req, res) => ok(res, await svc.listar());

exports.abrir = async (req, res) => ok(res, await svc.abrir(req.params.id, ctxDe(req)));
exports.cerrar = async (req, res) => ok(res, await svc.cerrar(req.params.id, ctxDe(req)));
exports.publicar = async (req, res) => ok(res, await svc.publicar(req.params.id, ctxDe(req)));
exports.actualizar = async (req, res) => ok(res, await svc.actualizar(req.params.id, req.body, ctxDe(req)));
