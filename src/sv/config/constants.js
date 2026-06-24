/**
 * sv/config/constants.js
 * Constantes del módulo SerVentas (roles, niveles, áreas, códigos de error).
 */

const ROLES = {
  SUPER_ADMIN:           'SUPER_ADMIN',
  GERENTE_GENERAL:       'GERENTE_GENERAL',
  ADMIN_AREA:            'ADMIN_AREA',
  DIRECTOR_COMERCIAL:    'DIRECTOR_COMERCIAL',
  JEFE_PAP:              'JEFE_PAP',
  SUPERVISOR:            'SUPERVISOR',
  COORDINADOR_PREVISION: 'COORDINADOR_PREVISION',
  ASESOR:                'ASESOR',
  AGENTE_SVC:            'AGENTE_SVC'
};

const NIVELES = {
  SUPER_ADMIN:           1,
  GERENTE_GENERAL:       2,
  ADMIN_AREA:            2,
  DIRECTOR_COMERCIAL:    2,
  JEFE_PAP:              2,
  SUPERVISOR:            3,
  COORDINADOR_PREVISION: 3,
  ASESOR:                4,
  AGENTE_SVC:            4
};

// Set canónico de roles con capacidades de supervisión (filtrar por asesor,
// reasignar prospectos, ver agenda del equipo, exportar reportes, etc.).
// Usar este array en lugar de listar uno por uno en cada controller para que
// agregar/quitar un rol jefe sea un solo cambio.
const ROLES_SUPERVISORES = [
  ROLES.SUPER_ADMIN,
  ROLES.GERENTE_GENERAL,
  ROLES.DIRECTOR_COMERCIAL,
  ROLES.ADMIN_AREA,
  ROLES.JEFE_PAP,
  ROLES.SUPERVISOR,
  ROLES.COORDINADOR_PREVISION
];

const AREAS = {
  PRENEC:   'PRENEC',
  PREV_EMP: 'PREV-EMP',
  PREV_PAP: 'PREV-PAP',
  SVC:      'SVC'
};

const ERROR_CODES = {
  UNAUTHORIZED:     'UNAUTHORIZED',
  FORBIDDEN:        'FORBIDDEN',
  NOT_FOUND:        'NOT_FOUND',
  DUPLICATE_PHONE:  'DUPLICATE_PHONE',
  DUPLICATE_NIT:    'DUPLICATE_NIT',
  DUPLICATE_EMAIL:  'DUPLICATE_EMAIL',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SAP_SYNC_FAILED:  'SAP_SYNC_FAILED',
  INTERNAL_ERROR:   'INTERNAL_ERROR',
  REFRESH_INVALID:  'REFRESH_INVALID'
};

const JWT = {
  ACCESS_SECRET:        process.env.SV_JWT_SECRET         || process.env.JWT_SECRET,
  REFRESH_SECRET:       process.env.SV_JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh',
  ACCESS_EXPIRES_IN:    process.env.SV_JWT_EXPIRES_IN         || '15m',
  REFRESH_EXPIRES_IN:   process.env.SV_JWT_REFRESH_EXPIRES_IN || '7d'
};

const BCRYPT_ROUNDS = parseInt(process.env.SV_BCRYPT_ROUNDS || '10');

module.exports = {
  ROLES,
  NIVELES,
  ROLES_SUPERVISORES,
  AREAS,
  ERROR_CODES,
  JWT,
  BCRYPT_ROUNDS
};
