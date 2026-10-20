const rateLimit = require('express-rate-limit');
const TrkError = require('../utils/TrkError');

// Login con PIN: clave IP + usuario (todo el evento comparte IP pública).
const limitadorPin = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.TRK_PIN_MAX_INTENTOS || 5),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${(req.body && req.body.usuario_id) || '-'}`,
  handler: (req, res, next) => next(new TrkError(429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos. Espera un minuto e intenta de nuevo.'))
});

module.exports = { limitadorPin };
