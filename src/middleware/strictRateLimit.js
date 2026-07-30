const rateLimit = require('express-rate-limit');

/**
 * Limiter estricto para endpoints sensibles a fuerza bruta (login, OTP,
 * búsqueda de empresa por NIT). El limiter global de src/app.js (1000
 * req/15min por IP) es inútil contra un ataque dirigido a un solo endpoint;
 * este es mucho más restrictivo — pensado para superficies de bajo volumen
 * POR USUARIO LEGÍTIMO (un login, un OTP, una búsqueda puntual de NIT).
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

/**
 * Limiter para el flujo público de invitaciones de autoafiliación por
 * convenio (Task 4): GET /convenios/invitacion/:token (resuelve el token) y
 * POST /afiliados/convenio/invitacion/:token (consume el token y crea el
 * afiliado).
 *
 * Fix de la ronda de revisión: estas dos rutas montaban `strictRateLimit`
 * (10 req/15min) — la MISMA instancia, y por lo tanto el MISMO budget
 * compartido, que login/OTP/búsqueda de NIT. Ese presupuesto compartido de
 * 10 peticiones por IP en 15 minutos es adecuado para "un usuario intenta
 * loguearse o pide un OTP", pero el flujo de invitaciones está diseñado
 * justamente para uso masivo desde una sola IP corporativa: muchos
 * empleados detrás del mismo NAT/router de oficina, autoafiliándose durante
 * la misma jornada laboral. Compartir el budget estricto significaba que,
 * tras solo un puñado de empleados registrándose, esa misma IP quedaba
 * bloqueada — tanto para nuevas autoafiliaciones como para logins/OTP de
 * otro empleado de la misma oficina que no tenía nada que ver.
 *
 * Por eso esta es una instancia SEPARADA (su propio MemoryStore, su propio
 * contador) con un máximo más permisivo, calibrado para "muchos empleados,
 * una IP de oficina, una ventana de 15 minutos durante el día" — sigue muy
 * por debajo del limiter global de app.js (1000/15min), y sigue siendo un
 * límite real, solo que no el mismo umbral que login/OTP.
 */
const invitacionRateLimit = rateLimit({
  windowMs: (process.env.INVITACION_RATE_LIMIT_WINDOW || 15) * 60 * 1000,
  max: process.env.INVITACION_RATE_LIMIT_MAX_REQUESTS || 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiadas solicitudes de invitación desde esta IP. Intenta de nuevo más tarde.'
  }
});

module.exports = { strictRateLimit, invitacionRateLimit };
