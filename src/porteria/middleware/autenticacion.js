const PorteriaError = require('../utils/PorteriaError');
const { verificarToken } = require('../services/auth.service');

/** `obtenerConfig()` se llama en cada request: el secreto es el del entorno vigente. */
function crearAutenticacion(obtenerConfig) {
  return (req, res, next) => {
    const encontrado = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
    if (!encontrado) return next(new PorteriaError(401, 'NO_AUTENTICADO', 'Sesión inválida o vencida'));
    try {
      req.porUsuario = verificarToken(encontrado[1], obtenerConfig().jwtSecret);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function requiereRol(...roles) {
  return (req, res, next) => (roles.includes(req.porUsuario && req.porUsuario.rol)
    ? next()
    : next(new PorteriaError(403, 'SIN_PERMISO', 'No tienes permiso para esta acción')));
}

/** Las rutas que registran o consultan la operación de una sede exigen haberla elegido. */
function requiereSede(req, res, next) {
  return req.porUsuario && req.porUsuario.sede_id
    ? next()
    : next(new PorteriaError(403, 'SEDE_REQUERIDA', 'Elige la sede de tu turno para continuar'));
}

module.exports = { crearAutenticacion, requiereRol, requiereSede };
