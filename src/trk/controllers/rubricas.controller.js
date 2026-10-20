const svc = require('../services/calificaciones.service');
const { ok } = require('../utils/respuesta');

exports.deCategoria = async (req, res) => ok(res, await svc.rubricaDeCategoria(req.params.categoriaId));
