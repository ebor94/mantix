const svc = require('../services/participantes.service');
const { ok } = require('../utils/respuesta');
const { ctxDe } = require('../utils/ctx');
const TrkError = require('../utils/TrkError');

exports.listar = async (req, res) => ok(res, await svc.listar(req.query, req.usuario));
exports.obtener = async (req, res) => ok(res, await svc.obtener(req.params.id, req.usuario));


exports.crear = async (req, res) => ok(res, await svc.crearAltaRapida(req.body, ctxDe(req)), 201);
exports.editar = async (req, res) => ok(res, await svc.editar(req.params.id, req.body, ctxDe(req)));
exports.cambiarEstado = async (req, res) => ok(res, await svc.cambiarEstado(req.params.id, req.body.estado, ctxDe(req)));

exports.subirFoto = async (req, res) => {
  if (!req.file) throw new TrkError(400, 'VALIDACION', 'Adjunta la foto en el campo "foto"');
  ok(res, await svc.guardarFotoOficial(req.params.id, req.file.buffer, ctxDe(req)));
};
