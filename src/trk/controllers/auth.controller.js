const authPin = require('../services/authPin.service');
const { ok } = require('../utils/respuesta');

exports.loginPin = async (req, res) => ok(res, await authPin.loginConPin(req.body.usuario_id, req.body.pin));
exports.usuariosPin = async (req, res) => ok(res, await authPin.listarUsuariosPin());
exports.yo = async (req, res) => ok(res, authPin.perfilDe(req.usuario));
