const db = require('../../models');
const { serializarParticipante } = require('../utils/serializar');
const { INCLUIR_CATEGORIA } = require('./participantes.service');

const vistaCategoriaCorta = (c) => (c ? { id: c.id, codigo: c.codigo, nombre: c.nombre } : null);

// Lo que ve la pantalla pública (sin login) y lo que usan todos como respaldo de polling.
async function estadoPublico() {
  const estado = await db.TrkEventoEstado.findByPk(1, {
    include: [
      { model: db.TrkParticipante, as: 'enPasarela', include: INCLUIR_CATEGORIA },
      { model: db.TrkCategoria, as: 'categoriaPantalla' }
    ]
  });
  return {
    modo_pantalla: estado.modo_pantalla,
    categoria_pantalla: vistaCategoriaCorta(estado.categoriaPantalla),
    en_pasarela: estado.enPasarela ? serializarParticipante(estado.enPasarela, 'PUBLICO') : null,
    ranking: null
  };
}

module.exports = { estadoPublico, vistaCategoriaCorta };
