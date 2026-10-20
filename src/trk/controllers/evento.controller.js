const svc = require('../services/evento.service');
const { ok } = require('../utils/respuesta');

exports.estado = async (req, res) => ok(res, await svc.estadoPublico());
