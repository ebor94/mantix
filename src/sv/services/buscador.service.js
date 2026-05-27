/**
 * sv/services/buscador.service.js
 * Búsqueda global cross-entidad (personas, prospectos) respetando scope.
 * Empresas y casos se sumarán en Fases 2 y 4.
 */
const { Op } = require('sequelize');
const { SvPersona, SvProspecto, SvEstado, SvUsuario } = require('../models');
const { normalizar } = require('../utils/telefono');
const { buildScopeWhere } = require('./prospectos.service');

async function buscar({ q, scope, limit = 5 }) {
  if (!q || q.length < 2) return { personas: [], prospectos: [], empresas: [], casos: [] };

  const term = `%${q}%`;
  const norm = normalizar(q) || q;
  const termNorm = `%${norm}%`;

  const [personas, prospectos] = await Promise.all([
    SvPersona.findAll({
      where: {
        [Op.or]: [
          { persona_nombre:        { [Op.like]: term } },
          { persona_apellido:      { [Op.like]: term } },
          { persona_telefono_norm: { [Op.like]: termNorm } },
          { persona_email:         { [Op.like]: term } },
          { persona_documento_num: { [Op.like]: term } }
        ]
      },
      limit
    }),

    SvProspecto.findAll({
      where: buildScopeWhere(scope),
      include: [
        {
          model: SvPersona, as: 'persona', required: true,
          where: {
            [Op.or]: [
              { persona_nombre:        { [Op.like]: term } },
              { persona_apellido:      { [Op.like]: term } },
              { persona_telefono_norm: { [Op.like]: termNorm } }
            ]
          }
        },
        { model: SvEstado, as: 'estado' },
        { model: SvUsuario, as: 'asesor', attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] }
      ],
      limit
    })
  ]);

  return { personas, prospectos, empresas: [], casos: [] };
}

module.exports = { buscar };
