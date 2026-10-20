const svc = require('../services/participantes.service');
const { ok } = require('../utils/respuesta');

exports.listar = async (req, res) => ok(res, await svc.listar(req.query, req.usuario));
exports.obtener = async (req, res) => ok(res, await svc.obtener(req.params.id, req.usuario));
