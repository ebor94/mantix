const svc = require('../services/categorias.service');
const { ok } = require('../utils/respuesta');

exports.listar = async (req, res) => ok(res, await svc.listar());
