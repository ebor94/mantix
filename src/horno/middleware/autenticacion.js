const HornoError = require('../utils/HornoError');
const { verificarToken } = require('../services/auth.service');

/** `obtenerConfig()` se llama en cada request: el secreto es el del entorno vigente. */
function crearAutenticacion(obtenerConfig) {
  return (req, res, next) => {
    const encontrado = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
    if (!encontrado) return next(new HornoError(401, 'NO_AUTENTICADO', 'Sesión inválida o vencida'));
    try {
      req.hornoUsuario = verificarToken(encontrado[1], obtenerConfig().jwtSecret);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { crearAutenticacion };
