/**
 * sv/utils/alcanceProspecto.js
 * Regla única de alcance sobre un prospecto, a partir de req.user y del
 * req.scope que arma middleware/svAreaGuard. Función pura: no consulta la base.
 *
 * fueraDeAlcance(user, scope, prospecto) → null si hay acceso, o el mensaje
 * para responder 403. Orden:
 *   1. crossArea (SUPER_ADMIN, GERENTE_GENERAL, DIRECTOR_COMERCIAL) → acceso
 *   2. asesorId  (ASESOR, AGENTE_SVC) → solo sus prospectos
 *   3. grupoId   (SUPERVISOR, COORDINADOR_PREVISION, JEFE_PAP) → sus grupos
 *   4. areaId    (ADMIN_AREA) → sus áreas
 *   5. sin alcance definido → se niega (falla cerrado)
 */
const { grupoIdsAccesibles, areaIdsAccesibles } = require('./acceso');

// ¿valor está en lista ∪ {extra}? Compara como número (Sequelize o el token
// pueden entregar texto).
function contiene(lista, extra, valor) {
  if (valor == null) return false;
  const ids = new Set([...(lista || []), extra].filter(v => v != null).map(Number));
  return ids.has(Number(valor));
}

function fueraDeAlcance(user, scope, prospecto) {
  const s = scope || {};
  if (s.crossArea) return null;

  if (s.asesorId) {
    return prospecto.prosp_asesor_id != null && Number(prospecto.prosp_asesor_id) === Number(s.asesorId)
      ? null
      : 'Fuera de tu alcance';
  }

  if (s.grupoId) {
    // La unión con scope.grupoId cubre al JEFE_PAP, que svAreaGuard fija al
    // grupo PAP sin importar su usr_grupo_id.
    return contiene(grupoIdsAccesibles(user), s.grupoId, prospecto.prosp_grupo_id)
      ? null
      : 'Fuera de tu grupo';
  }

  if (s.areaId) {
    return contiene(areaIdsAccesibles(user), s.areaId, prospecto.prosp_area_id)
      ? null
      : 'Fuera de tu área';
  }

  return 'Sin alcance definido';
}

/**
 * Alcance sobre las ventas de un prospecto: la misma regla, pero los roles cross-área solo
 * llegan a sus áreas asignadas (SUPER_ADMIN, a todas).
 */
function fueraDeAlcanceVentas(user, scope, prospecto) {
  const motivo = fueraDeAlcance(user, scope, prospecto);
  if (motivo || !scope?.crossArea) return motivo;
  const areas = areaIdsAccesibles(user); // null = todas
  return areas === null || contiene(areas, null, prospecto.prosp_area_id) ? null : 'Fuera de tu área';
}

module.exports = { fueraDeAlcance, fueraDeAlcanceVentas };
