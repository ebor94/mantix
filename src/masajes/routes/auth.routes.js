// src/masajes/routes/auth.routes.js
// Login con el Directorio Activo y sesión actual (spec §9). Patrón de src/porteria/routes/auth.routes.js.
const express = require('express');
const rateLimit = require('express-rate-limit');
const apiCodigo = require('../middleware/apiCodigo');
const MasajesError = require('../utils/MasajesError');
const { E } = require('../utils/MasajesError');
const aw = require('../utils/aw');
const { ROLES, rolDesdeGrupos, firmarToken, normalizarUsuario } = require('../services/auth.service');

const CAMPOS_LOGIN = ['usuario', 'password'];
const textoValido = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max;
/** IPv4 tal cual; IPv6 por su /64 (un atacante con un bloque IPv6 tiene millones de direcciones). */
function claveIp(ip) {
  const s = String(ip || '');
  if (!s.includes(':') || /^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(s)) return s.replace(/^::ffff:/i, '');
  const [cabeza, cola = ''] = s.split('::');
  const a = cabeza ? cabeza.split(':') : [];
  const b = cola ? cola.split(':') : [];
  const grupos = [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b];
  return `${grupos.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/** Si alguien escribe su contraseña en el campo de usuario, no debe quedar en el log: solo nombres con forma de usuario. */
const usuarioParaLog = (raw) => {
  const u = normalizarUsuario(raw);
  return /^[a-z0-9._-]{1,64}$/.test(u) ? u : '[formato no válido]';
};

const auditoriaDe = (req) => ({ ip: req.ip, userAgent: req.get('user-agent'), requestId: req.msjApiCodigo });

function crearRouterAuth({ obtenerConfig, directorio, beneficiarios, autenticar, resolverBeneficiario }) {
  const router = express.Router();

  // Solo cuentan las respuestas 401 (credenciales malas): nunca los 503 del AD ni los 403 por no estar en el listado.
  const opcionesLimite = {
    windowMs: 15 * 60 * 1000,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (req, res) => res.statusCode !== 401,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next) => next(new MasajesError(
      429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.',
    )),
  };
  // A: 5 fallos por CUENTA en 15 min, desde cualquier IP. Queda por debajo del umbral de bloqueo típico del AD:
  //    un atacante no puede bloquear la cuenta de dominio de otra persona (como mucho, su acceso a Masajes 15 min).
  // B: techo de 200 fallos por IP (o por /64 en IPv6, para que rotar direcciones no lo evada). Es alto a propósito:
  //    en una sede todos salen por la misma IP. Los contadores viven en memoria de cada instancia de pm2.
  const limitadorCuenta = rateLimit({
    ...opcionesLimite,
    limit: 5,
    keyGenerator: (req) => `u:${normalizarUsuario(req.body && req.body.usuario)}`,
    validate: { ip: false },
  });
  const limitadorIp = rateLimit({ ...opcionesLimite, limit: 200, keyGenerator: (req) => claveIp(req.ip), validate: { ip: false } });

  router.post('/login', apiCodigo('MSJ-AUT-001'), limitadorIp, limitadorCuenta, aw(async (req, res) => {
    const cuerpo = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const extra = Object.keys(cuerpo).filter((k) => !CAMPOS_LOGIN.includes(k));
    const { usuario, password } = cuerpo;
    if (extra.length || !textoValido(usuario, 100) || !textoValido(password, 200)) {
      throw E.VALIDACION([{ campo: 'login', motivo: 'Usuario y contraseña son obligatorios' }]);
    }
    const registrar = (resultado, mas = {}) => req.msjLog.info('masajes login', { usuario: usuarioParaLog(usuario), ip: req.ip, resultado, ...mas });

    let datos;
    try {
      datos = await directorio.validarCredenciales(usuario, password);
    } catch (err) {
      if (err.codigo === 'CREDENCIALES_INVALIDAS') {
        registrar('credenciales_invalidas');
        // El mismo mensaje para usuario inexistente y clave mala: no revela qué usuarios existen.
        throw new MasajesError(401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos.');
      }
      if (err.codigo === 'AD_NO_DISPONIBLE') {
        registrar('directorio_no_disponible');
        throw new MasajesError(503, 'DIRECTORIO_NO_DISPONIBLE', 'No se pudo validar con el directorio activo. Intenta de nuevo.');
      }
      throw err; // un fallo inesperado es un 500 (lo registra el errorHandler), no "AD caído"
    }

    const config = obtenerConfig();
    const sam = normalizarUsuario(datos.usuario);
    const rol = rolDesdeGrupos(datos.memberOf, config.grupoAdminDn);
    const beneficiario = await beneficiarios.resolverParaLogin({
      usuario: sam, email: datos.email, nombreAd: datos.nombre, dominios: config.dominiosAutovinculo, auditoria: auditoriaDe(req),
    });
    if (rol !== ROLES.ADMIN && !beneficiario) {
      registrar('no_beneficiario');
      throw E.NO_BENEFICIARIO();
    }
    registrar('ok', { rol });

    const sesion = { usuario: sam, nombre: datos.nombre, rol };
    res.json({ success: true, data: { token: firmarToken(sesion, config), usuario: { ...sesion, beneficiario } } });
  }));

  router.get('/sesion', apiCodigo('MSJ-AUT-002'), autenticar, resolverBeneficiario, (req, res) => {
    const { usuario, nombre, rol } = req.msjUsuario;
    res.json({ success: true, data: { usuario, nombre, rol, beneficiario: req.msjBeneficiario } });
  });

  return router;
}

module.exports = { crearRouterAuth, claveIp, usuarioParaLog };
