/**
 * identity/middleware/limitadoresLogin.js
 * Cada fallo en el login suma al umbral de bloqueo de la cuenta en el
 * directorio activo; sin este límite, cualquiera podría bloquearle Windows a
 * otra persona probando claves en GenFlow. Solo cuentan las respuestas 401.
 */
const rateLimit = require('express-rate-limit');

const VENTANA_MS = 15 * 60 * 1000;

function claveUsuario(body) {
  let u = String((body && (body.usuario ?? body.email)) || '').trim().toLowerCase();
  if (u.includes('\\')) u = u.split('\\').pop();
  if (u.includes('@')) u = u.split('@')[0];
  return u;
}

function demasiados(req, res) {
  return res.status(429).json({
    success: false,
    error:   'DEMASIADOS_INTENTOS',
    message: 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.'
  });
}

const opciones = {
  windowMs: VENTANA_MS,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (req, res) => res.statusCode !== 401,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: demasiados
};

function crearLimitadoresLogin() {
  return {
    limitadorUsuario: rateLimit({ ...opciones, limit: 5,   keyGenerator: (req) => `u:${claveUsuario(req.body)}` }),
    limitadorIp:      rateLimit({ ...opciones, limit: 100, keyGenerator: (req) => `ip:${req.ip}` })
  };
}

module.exports = { crearLimitadoresLogin, claveUsuario };
