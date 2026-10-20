const svc = require('../services/calificaciones.service');
const { ok } = require('../utils/respuesta');
const { ctxDe } = require('../utils/ctx');

exports.enviar = async (req, res) => ok(res, await svc.enviarCalificacion(req.params.participanteId, req.body.puntajes, ctxDe(req)));
