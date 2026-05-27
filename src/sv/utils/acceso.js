/**
 * sv/utils/acceso.js
 * Helpers de visibilidad multi-área / multi-grupo.
 */
const { ROLES } = require('../config/constants');

/**
 * Devuelve el set de area_codigo accesibles por el usuario.
 *   - SUPER_ADMIN: ['*'] (todas)
 *   - Otros: area principal + areasExtra
 */
function areasAccesibles(user) {
  if (!user) return new Set();
  if (user.rol?.rol_codigo === ROLES.SUPER_ADMIN) return new Set(['*']);
  const set = new Set();
  if (user.area?.area_codigo) set.add(user.area.area_codigo);
  for (const a of (user.areasExtra || [])) set.add(a.area_codigo);
  return set;
}

/**
 * tieneAccesoArea(user, codigo) → boolean
 */
function tieneAccesoArea(user, codigo) {
  const set = areasAccesibles(user);
  return set.has('*') || set.has(codigo);
}

/**
 * Devuelve el set de area_id accesibles (útil para queries).
 */
function areaIdsAccesibles(user) {
  if (!user) return [];
  if (user.rol?.rol_codigo === ROLES.SUPER_ADMIN) return null; // null = sin filtro
  const set = new Set();
  if (user.usr_area_id) set.add(user.usr_area_id);
  for (const a of (user.areasExtra || [])) set.add(a.area_id);
  return [...set];
}

/**
 * Devuelve el set de grupo_id accesibles (para supervisores multi-grupo).
 */
function grupoIdsAccesibles(user) {
  if (!user) return [];
  if (user.rol?.rol_codigo === ROLES.SUPER_ADMIN) return null;
  const set = new Set();
  if (user.usr_grupo_id) set.add(user.usr_grupo_id);
  for (const g of (user.gruposExtra || [])) set.add(g.grupo_id);
  return [...set];
}

module.exports = { areasAccesibles, tieneAccesoArea, areaIdsAccesibles, grupoIdsAccesibles };
