/**
 * sv/middleware/svAreaGuard.js
 * Inyecta filtros de visibilidad por rol en req.scope:
 *   - SUPER_ADMIN:           sin filtros
 *   - ADMIN_AREA:            { areaId }
 *   - JEFE_PAP:              { areaId, grupoId } — fijos a Previsión PAP / grupo PAP
 *   - SUPERVISOR:            { areaId, grupoId }
 *   - ASESOR / AGENTE_SVC:   { areaId, grupoId, asesorId }
 *
 * Los servicios y controllers consumen req.scope para limitar SELECTs.
 */
const { ROLES, NIVELES } = require('../config/constants');
const { fail } = require('../utils/response');

// IDs fijos del módulo PAP (coinciden con seed 001_cfg / 999_seed)
const AREA_PAP_ID  = 3; // sv_cfg_areas_negocio.area_codigo = 'PREV-PAP'
const GRUPO_PAP_ID = 3; // sv_cfg_grupos_trabajo.grupo_codigo = 'PAP'

function svAreaGuard(req, res, next) {
  if (!req.user) {
    return fail(res, 401, 'UNAUTHORIZED', 'No autenticado');
  }
  const codigo = req.user.rol?.rol_codigo;
  const nivel  = req.user.rol?.rol_nivel ?? NIVELES.ASESOR;

  const scope = {
    rol:       codigo,
    nivel,
    areaId:    null,
    grupoId:   null,
    asesorId:  null,
    crossArea: false
  };

  if (codigo === ROLES.SUPER_ADMIN) {
    scope.crossArea = true;
  } else if (codigo === ROLES.ADMIN_AREA) {
    scope.areaId = req.user.usr_area_id;
  } else if (codigo === ROLES.JEFE_PAP) {
    // JEFE_PAP siempre opera sobre Previsión PAP / grupo PAP, sin importar
    // qué tenga en usr_area_id / usr_grupo_id (es un rol fijo al dominio PAP).
    scope.areaId  = AREA_PAP_ID;
    scope.grupoId = GRUPO_PAP_ID;
  } else if (codigo === ROLES.SUPERVISOR) {
    scope.areaId  = req.user.usr_area_id;
    scope.grupoId = req.user.usr_grupo_id;
  } else if (codigo === ROLES.ASESOR || codigo === ROLES.AGENTE_SVC) {
    scope.areaId   = req.user.usr_area_id;
    scope.grupoId  = req.user.usr_grupo_id;
    scope.asesorId = req.user.usr_id;
  }

  req.scope = scope;
  next();
}

module.exports = { svAreaGuard };
