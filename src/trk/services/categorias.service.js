const db = require('../../models');

const vistaCategoria = (c) => ({
  id: c.id,
  codigo: c.codigo,
  nombre: c.nombre,
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

module.exports = { listar, vistaCategoria };
