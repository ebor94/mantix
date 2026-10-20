const net = require('net');
const rateLimit = require('express-rate-limit');
const TrkError = require('../utils/TrkError');

// IPv4 tal cual; IPv6 agrupada por /64 (un cliente IPv6 suele controlar todo su /64).
function claveIp(ip) {
  const valor = String(ip || '');
  if (valor.startsWith('::ffff:') && net.isIPv4(valor.slice(7))) return valor.slice(7);
  if (!net.isIPv6(valor)) return valor || '-';
  const [cabeza, cola = ''] = valor.split('::');
  const izq = cabeza ? cabeza.split(':') : [];
  const der = valor.includes('::') && cola ? cola.split(':') : [];
  const grupos = valor.includes('::') ? [...izq, ...Array(8 - izq.length - der.length).fill('0'), ...der] : izq;
  return `${grupos.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(':')}::/64`;
}

// Mismo id que dejará Joi tras convertir ("01", " 1", "1.0", "1e0" → 1): una sola clave por usuario.
function idNormalizado(req) {
  const crudo = req.body && req.body.usuario_id;
  const n = typeof crudo === 'string' ? Number(crudo.trim()) : Number(crudo);
  return crudo !== undefined && crudo !== null && crudo !== '' && Number.isInteger(n) && n > 0 ? String(n) : '-';
}

const demasiados = (req, res, next) => next(new TrkError(429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos. Espera unos minutos e intenta de nuevo.'));

const base = { standardHeaders: true, legacyHeaders: false, handler: demasiados };

// 1) Tope grueso por IP (todos los intentos): frena el abuso de CPU (bcrypt) y la enumeración.
//    Todo el evento comparte IP pública: el valor por defecto deja margen para los ingresos legítimos.
const limitadorPinIp = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.TRK_PIN_MAX_POR_IP || 100),
  keyGenerator: (req) => `ip|${claveIp(req.ip)}`
});

// 2) IP + usuario (id normalizado), por minuto: el límite original (TRK_PIN_MAX_INTENTOS).
const limitadorPin = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: Number(process.env.TRK_PIN_MAX_INTENTOS || 5),
  keyGenerator: (req) => `${claveIp(req.ip)}|${idNormalizado(req)}`
});

// 3) Solo por usuario y solo fallos, 15 min: un atacante que rota IPs no puede recorrer los 10^6 PIN.
const limitadorPinUsuario = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.TRK_PIN_MAX_FALLOS_USUARIO || 10),
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `usuario|${idNormalizado(req)}`
});

module.exports = { limitadorPin, limitadorPinIp, limitadorPinUsuario, claveIp, idNormalizado };
