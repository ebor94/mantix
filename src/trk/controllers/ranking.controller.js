const svc = require('../services/rankingDatos.service');
const { ok } = require('../utils/respuesta');
const { ctxDe } = require('../utils/ctx');
const { tienePermiso } = require('../utils/permisos');

// Admin: en vivo (o ?vista=publicado). Resto/público: solo lo publicado (R8).
exports.obtener = async (req, res) => {
  const enVivo = tienePermiso(req.usuario, 'administrar') && req.query.vista !== 'publicado';
  ok(res, enVivo ? await svc.rankingEnVivo(req.params.categoriaId) : await svc.rankingPublicado(req.params.categoriaId));
};
exports.desempate = async (req, res) => ok(res, await svc.fijarDesempate(req.params.categoriaId, req.body.orden, ctxDe(req)));
