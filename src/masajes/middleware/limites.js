// Límites de peticiones por USUARIO autenticado (spec §17.3). Van después de autenticar: la llave es el usuario,
// no la IP (en una sede muchas personas comparten IP). El login tiene sus propios límites (auth.routes.js).
const rateLimit = require('express-rate-limit');
const MasajesError = require('../utils/MasajesError');

const demasiadas = (req, res, next) => next(new MasajesError(
  429, 'DEMASIADAS_SOLICITUDES', 'Hiciste demasiadas solicitudes seguidas. Espera un momento e intenta de nuevo.',
));

/** Se crean UNA vez por router (express-rate-limit exige crearlos al construir, no por petición). */
function crearLimites({ lecturaPorMinuto = 120, escrituraPorMinuto = 20, importacionPorHora = 5 } = {}) {
  const base = {
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: demasiadas,
    keyGenerator: (req) => `u:${req.msjUsuario ? req.msjUsuario.usuario : 'anonimo'}`,
    validate: { ip: false }, // la llave no usa la IP
  };
  return {
    lectura: rateLimit({ ...base, windowMs: 60 * 1000, limit: lecturaPorMinuto }),
    escritura: rateLimit({ ...base, windowMs: 60 * 1000, limit: escrituraPorMinuto }),
    importacion: rateLimit({ ...base, windowMs: 60 * 60 * 1000, limit: importacionPorHora }),
  };
}

module.exports = { crearLimites };
