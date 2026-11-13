const rateLimit = require('express-rate-limit');
const DueloError = require('../utils/DueloError');

const VENTANA = 15 * 60 * 1000;
const excedido = (req, res, next) => next(new DueloError(429, 'DEMASIADOS_INTENTOS',
  'Recibimos muchos intentos desde tu conexión. Espera unos minutos e inténtalo de nuevo.'));

/** Los limitadores se crean una vez, al construir el router (lo exige express-rate-limit). */
function crearLimites(obtenerConfig) {
  const comunes = { windowMs: VENTANA, standardHeaders: true, legacyHeaders: false, handler: excedido };
  return {
    inscripciones: rateLimit({ ...comunes, limit: () => obtenerConfig().limiteInscripciones }),
    login: rateLimit({ ...comunes, limit: 5 }),
  };
}

module.exports = { crearLimites };
