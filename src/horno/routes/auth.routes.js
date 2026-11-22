// Login con el Directorio Activo (grupo HORNO_GRUPO_AD) y sesión actual.
const express = require('express');
const rateLimit = require('express-rate-limit');
const apiCodigo = require('../middleware/apiCodigo');
const HornoError = require('../utils/HornoError');
const aw = require('../utils/aw');
const { perteneceAlGrupo, firmarToken, usuarioPublico } = require('../services/auth.service');

// Misma regla que H360 y Portería: lo que va antes de '@' o después de '\\', en minúsculas.
function normalizarUsuario(raw) {
  const u = String(raw ?? '').trim().toLowerCase();
  if (u.includes('@')) return u.split('@')[0];
  if (u.includes('\\')) return u.split('\\')[1];
  return u;
}

const textoValido = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max;

function crearRouterAuth({ obtenerConfig, directorio, autenticar }) {
  const router = express.Router();

  // Solo cuentan los 401 (clave mala): un AD caído (503) o la falta de grupo (403) no bloquean a nadie.
  const demasiados = (req, res, next) => next(new HornoError(
    429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.',
  ));
  const opcionesLimite = {
    windowMs: 15 * 60 * 1000,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (req, res) => res.statusCode !== 401,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: demasiados,
  };
  const limitadorUsuario = rateLimit({
    ...opcionesLimite,
    limit: 10,
    keyGenerator: (req) => `${req.ip}|${normalizarUsuario(req.body && req.body.usuario)}`,
  });
  const limitadorIp = rateLimit({ ...opcionesLimite, limit: 100, keyGenerator: (req) => req.ip });

  router.post('/login', apiCodigo('HOR-AUT-001'), limitadorIp, limitadorUsuario, aw(async (req, res) => {
    const { usuario, password } = req.body || {};
    if (!textoValido(usuario, 100) || !textoValido(password, 200)) {
      throw new HornoError(400, 'VALIDACION', 'Usuario y contraseña son obligatorios');
    }
    const registrar = (resultado) => req.hornoLog.info('horno login', { usuario: normalizarUsuario(usuario), ip: req.ip, resultado });

    let datos;
    try {
      datos = await directorio.validarCredenciales(usuario, password);
    } catch (err) {
      if (err.codigo === 'CREDENCIALES_INVALIDAS') {
        registrar('credenciales_invalidas');
        throw new HornoError(401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos');
      }
      if (err.codigo === 'AD_NO_DISPONIBLE') {
        registrar('directorio_no_disponible');
        throw new HornoError(503, 'AD_NO_DISPONIBLE', 'No se pudo validar con el directorio activo. Intenta de nuevo.');
      }
      throw err;
    }

    const config = obtenerConfig();
    if (!perteneceAlGrupo(datos.memberOf, config.grupo)) {
      registrar('sin_grupo');
      throw new HornoError(403, 'SIN_ACCESO', `Tu usuario de red no pertenece al grupo ${config.grupo}. Solicita acceso a TI.`);
    }
    registrar('ok');

    const user = usuarioPublico(datos);
    res.json({ success: true, data: { token: firmarToken(user, config), user } });
  }));

  router.get('/me', apiCodigo('HOR-AUT-002'), autenticar, (req, res) => {
    res.json({ success: true, data: { user: usuarioPublico(req.hornoUsuario) } });
  });

  return router;
}

module.exports = { crearRouterAuth };
