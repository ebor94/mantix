const PorteriaError = require('../utils/PorteriaError');
const { verificarToken, ROLES } = require('../services/auth.service');

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

/**
 * Sede de una consulta. El guarda siempre consulta la de su turno. El admin puede pedir otra con ?sede_id=;
 * si no, usa la de su token; sin ninguna, `todasParaAdmin` devuelve null (todas) y si no es un 400.
 */
function sedeDeConsulta(req, { todasParaAdmin = false } = {}) {
  const usuario = req.porUsuario;
  if (usuario.rol !== ROLES.ADMIN) {
    if (!usuario.sede_id) throw new PorteriaError(403, 'SEDE_REQUERIDA', 'Elige la sede de tu turno para continuar');
    return usuario.sede_id;
  }
  const pedida = req.query && req.query.sede_id;
  if (pedida !== undefined && pedida !== '') {
    if (typeof pedida !== 'string' || !/^\d{1,9}$/.test(pedida) || Number(pedida) <= 0) {
      throw new PorteriaError(400, 'VALIDACION', 'Sede inválida');
    }
    return Number(pedida);
  }
  if (usuario.sede_id) return usuario.sede_id;
  if (todasParaAdmin) return null;
  throw new PorteriaError(400, 'VALIDACION', 'Indica la sede');
}

module.exports = { crearAutenticacion, requiereRol, requiereSede, sedeDeConsulta };
