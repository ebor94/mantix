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

/**
 * Devuelve la lista de usr_id que el actor puede ver o gestionar.
 * Retorna null para SUPER_ADMIN (acceso total, no aplicar filtro).
 * Consulta la DB para expandir grupos/areas a usuarios concretos.
 */
async function usuariosAccesibles(actor) {
  const { Op } = require('sequelize');
  const { SvUsuario } = require('../models');
  const codigo = actor?.rol?.rol_codigo;

  if (codigo === 'SUPER_ADMIN') return null;
  if (codigo === 'ASESOR' || codigo === 'AGENTE_SVC') return [actor.usr_id];

  const rolesArea  = ['GERENTE_GENERAL', 'DIRECTOR_COMERCIAL', 'ADMIN_AREA'];
  const rolesGrupo = ['COORDINADOR_PREVISION', 'JEFE_PAP', 'SUPERVISOR'];

  if (rolesArea.includes(codigo)) {
    const areas = areaIdsAccesibles(actor); // ya devuelve number[] con principal + extras
    if (!areas?.length) return [actor.usr_id];
    const rows = await SvUsuario.findAll({
      where: { usr_area_id: { [Op.in]: areas }, usr_activo: 1 },
      attributes: ['usr_id']
    });
    return rows.map(r => r.usr_id);
  }

  if (rolesGrupo.includes(codigo)) {
    const grupos = grupoIdsAccesibles(actor);
    if (!grupos?.length) return [actor.usr_id];
    const rows = await SvUsuario.findAll({
      where: { usr_grupo_id: { [Op.in]: grupos }, usr_activo: 1 },
      attributes: ['usr_id']
    });
    return rows.map(r => r.usr_id);
  }

  // Rol desconocido: safe default
  return [actor.usr_id];
}

module.exports = { areasAccesibles, tieneAccesoArea, areaIdsAccesibles, grupoIdsAccesibles, usuariosAccesibles };
