const rateLimit = require('express-rate-limit');

/**
 * Limiter estricto para endpoints sensibles a fuerza bruta (login, OTP).
 * El limiter global de src/app.js (1000 req/15min por IP) es inútil contra un
 * ataque dirigido a un solo endpoint; este es mucho más restrictivo.
 *
 * Reusado por Task 4 en GET /convenios/invitacion/:token.
 */
const strictRateLimit = rateLimit({
  windowMs: (process.env.STRICT_RATE_LIMIT_WINDOW || 15) * 60 * 1000,
  max: process.env.STRICT_RATE_LIMIT_MAX_REQUESTS || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos desde esta IP. Intenta de nuevo más tarde.'
  }
});

module.exports = strictRateLimit;
