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
  // A: 10 fallos por usuario e IP. B: techo de 100 fallos por IP.
  const limitadorUsuario = rateLimit({
    ...opcionesLimite,
    limit: 10,
    keyGenerator: (req) => `${req.ip}|${normalizarUsuario(req.body && req.body.usuario)}`,
  });
  const limitadorIp = rateLimit({ ...opcionesLimite, limit: 100, keyGenerator: (req) => req.ip });

  router.post('/login', apiCodigo('MSJ-AUT-001'), limitadorIp, limitadorUsuario, aw(async (req, res) => {
    const cuerpo = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const extra = Object.keys(cuerpo).filter((k) => !CAMPOS_LOGIN.includes(k));
    const { usuario, password } = cuerpo;
    if (extra.length || !textoValido(usuario, 100) || !textoValido(password, 200)) {
      throw E.VALIDACION([{ campo: 'login', motivo: 'Usuario y contraseña son obligatorios' }]);
    }
    const registrar = (resultado, mas = {}) => req.msjLog.info('masajes login', { usuario: normalizarUsuario(usuario), ip: req.ip, resultado, ...mas });

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

module.exports = { crearRouterAuth };
