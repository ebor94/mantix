// Middlewares de identidad de Masajes (spec §9.6–§9.7). Patrón de src/porteria/middleware/autenticacion.js.
const { E } = require('../utils/MasajesError');
const { verificarToken } = require('../services/auth.service');
const aw = require('../utils/aw');

/** Bearer en la cabecera (nunca en la URL). `obtenerConfig()` se llama en cada request: el secreto vigente. */
function crearAutenticacion(obtenerConfig) {
  return (req, res, next) => {
    const encontrado = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
    if (!encontrado) return next(E.NO_AUTENTICADO());
    try {
      req.msjUsuario = verificarToken(encontrado[1], obtenerConfig().jwtSecret);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function requiereRol(rol) {
  return (req, res, next) => (req.msjUsuario && req.msjUsuario.rol === rol ? next() : next(E.NO_ADMIN()));
}

/**
 * Vuelve a leer el beneficiario en CADA petición (activo = 1): desactivarlo surte efecto de inmediato, sin
 * esperar a que venza el token. El token nunca lleva el id del beneficiario.
 */
function crearResolverBeneficiario({ beneficiarios }) {
  return aw(async (req, res, next) => {
    req.msjBeneficiario = await beneficiarios.obtenerActivoPorUsuario(req.msjUsuario.usuario);
    next();
  });
}

/** Rutas de empleado: exigen un beneficiario activo vinculado (un admin que no es beneficiario no entra). */
function requiereBeneficiario(req, res, next) {
  return req.msjBeneficiario ? next() : next(E.NO_BENEFICIARIO());
}

module.exports = { crearAutenticacion, requiereRol, crearResolverBeneficiario, requiereBeneficiario };
