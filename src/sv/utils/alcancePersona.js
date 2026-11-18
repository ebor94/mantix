/**
 * sv/utils/alcancePersona.js
 * Relación de un usuario con una persona: la tiene si es cross-área o si al
 * menos uno de los prospectos de la persona está en su alcance según la regla
 * única de utils/alcanceProspecto. Función pura: no consulta la base.
 *
 * fueraDeAlcancePersona(user, scope, prospectos) → null si hay relación, o el
 * mensaje para responder 403. Una lista vacía sin crossArea se niega (falla
 * cerrado): también cubre a la persona inexistente.
 */
const { fueraDeAlcance } = require('./alcanceProspecto');

const SIN_RELACION = 'Sin prospectos de esta persona en tu alcance';

function fueraDeAlcancePersona(user, scope, prospectos) {
  if (scope?.crossArea) return null;
  const alguno = (prospectos || []).some(p => fueraDeAlcance(user, scope, p) === null);
  return alguno ? null : SIN_RELACION;
}

module.exports = { fueraDeAlcancePersona, SIN_RELACION };
