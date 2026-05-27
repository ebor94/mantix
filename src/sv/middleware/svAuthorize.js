/**
 * sv/middleware/svAuthorize.js
 * Control de acceso por rol o por nivel jerárquico.
 *   - authorize('SUPER_ADMIN','ADMIN_AREA')  → exige uno de esos rol_codigo
 *   - authorizeLevel(2)                       → exige rol_nivel <= 2
 * SUPER_ADMIN siempre pasa.
 */
const { fail } = require('../utils/response');
const { ERROR_CODES, ROLES } = require('../config/constants');

function authorize(...rolCodigos) {
  return (req, res, next) => {
    if (!req.user) {
      return fail(res, 401, ERROR_CODES.UNAUTHORIZED, 'No autenticado');
    }
    const codigo = req.user.rol?.rol_codigo;
    if (codigo === ROLES.SUPER_ADMIN) return next();
    if (rolCodigos.includes(codigo)) return next();
    return fail(res, 403, ERROR_CODES.FORBIDDEN,
      `Rol no autorizado (requerido: ${rolCodigos.join(', ')})`);
  };
}

function authorizeLevel(nivelMaximo) {
  return (req, res, next) => {
    if (!req.user) {
      return fail(res, 401, ERROR_CODES.UNAUTHORIZED, 'No autenticado');
    }
    const nivel = req.user.rol?.rol_nivel ?? 99;
    if (nivel <= nivelMaximo) return next();
    return fail(res, 403, ERROR_CODES.FORBIDDEN,
      `Nivel insuficiente (requerido: <= ${nivelMaximo})`);
  };
}

function authorizePermiso(modulo, accion) {
  return (req, res, next) => {
    if (!req.user) {
      return fail(res, 401, ERROR_CODES.UNAUTHORIZED, 'No autenticado');
    }
    if (req.user.rol?.rol_codigo === ROLES.SUPER_ADMIN) return next();
    let permisos = req.user.rol?.rol_permisos;
    if (typeof permisos === 'string') {
      try { permisos = JSON.parse(permisos); } catch { permisos = {}; }
    }
    const acciones = permisos?.[modulo];
    if (Array.isArray(acciones) && acciones.includes(accion)) return next();
    return fail(res, 403, ERROR_CODES.FORBIDDEN,
      `Sin permiso para ${modulo}.${accion}`);
  };
}

module.exports = { authorize, authorizeLevel, authorizePermiso };
