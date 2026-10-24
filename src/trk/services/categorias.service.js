const db = require('../../models');
const TrkError = require('../utils/TrkError');
const { registrarAuditoria } = require('./auditoria.service');
const { emitir } = require('../sockets/bus');

const vistaCategoria = (c) => ({
  id: c.id,
  codigo: c.codigo,
  nombre: c.nombre,
  color: c.color ?? null,
  orden: c.orden,
  abierta: Boolean(c.abierta),
  ranking_publicado: Boolean(c.ranking_publicado),
  puestos_premiados: c.puestos_premiados,
  rubrica_codigo: c.rubrica ? c.rubrica.codigo : null
});

async function listar() {
  const categorias = await db.TrkCategoria.findAll({ include: [{ model: db.TrkRubrica, as: 'rubrica' }], order: [['orden', 'ASC']] });
  return categorias.map(vistaCategoria);
}


async function modificar(id, cambios, accion, ctx) {
  const categoria = await db.sequelize.transaction(async (transaction) => {
    const c = await db.TrkCategoria.findByPk(id, { include: [{ model: db.TrkRubrica, as: 'rubrica' }], transaction, lock: transaction.LOCK.UPDATE });
    if (!c) throw new TrkError(404, 'NO_ENCONTRADO', 'Categoría no encontrada');
    const antes = vistaCategoria(c);
    await c.update(cambios, { transaction });
    await registrarAuditoria(ctx, { entidad: 'categoria', entidadId: c.id, accion, antes, despues: vistaCategoria(c) }, { transaction });
    return c;
  });
  return vistaCategoria(categoria);
}

const abrir = (id, ctx) => modificar(id, { abierta: true }, 'ABRIR', ctx);
const cerrar = (id, ctx) => modificar(id, { abierta: false }, 'CERRAR', ctx);
const actualizar = (id, { puestos_premiados: puestosPremiados }, ctx) => modificar(id, { puestos_premiados: puestosPremiados }, 'EDITAR', ctx);

async function publicar(id, ctx) {
  const { rankingEnVivo, paraPublicar } = require('./rankingDatos.service');
  const ranking = await rankingEnVivo(id);
  if (ranking.empates_sin_resolver.length) {
    throw new TrkError(409, 'EMPATE_SIN_RESOLVER', 'Hay empates sin resolver en los puestos premiados; define el desempate manual');
  }
  const publicado = paraPublicar({ ...ranking, categoria: { ...ranking.categoria, ranking_publicado: true } });
  await db.sequelize.transaction(async (transaction) => {
    await db.TrkRankingSnapshot.create({ categoria_id: Number(id), publicado_por: ctx.usuarioId, datos: publicado }, { transaction });
    await db.TrkCategoria.update({ ranking_publicado: true }, { where: { id }, transaction });
    await registrarAuditoria(ctx, { entidad: 'categoria', entidadId: id, accion: 'PUBLICAR_RANKING', despues: { filas: publicado.filas.length } }, { transaction });
  });
  emitir('ranking:publicado', { categoria_id: Number(id) });
  return publicado;
}

module.exports = { listar, vistaCategoria, abrir, cerrar, publicar, actualizar };
