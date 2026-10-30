// src/porteria/routes/auth.routes.js
// Login con el Directorio Activo, elección de sede de turno y sesión actual.
const express = require('express');
const rateLimit = require('express-rate-limit');
const apiCodigo = require('../middleware/apiCodigo');
const PorteriaError = require('../utils/PorteriaError');
const aw = require('../utils/aw');
const { rolDesdeGrupos, firmarToken, usuarioPublico } = require('../services/auth.service');

const textoValido = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max;

function crearRouterAuth({ obtenerConfig, directorio, h360, autenticar }) {
  const router = express.Router();

  // Las casetas de una sede comparten IP: solo cuentan los intentos fallidos.
  const limitadorLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next) => next(new PorteriaError(
      429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.',
    )),
  });

  router.post('/login', apiCodigo('POR-AUT-001'), limitadorLogin, aw(async (req, res) => {
    const { usuario, password } = req.body || {};
    if (!textoValido(usuario, 100) || !textoValido(password, 200)) {
      throw new PorteriaError(400, 'VALIDACION', 'Usuario y contraseña son obligatorios');
    }

    let datos;
    try {
      datos = await directorio.validarCredenciales(usuario, password);
    } catch (err) {
      if (err.codigo === 'CREDENCIALES_INVALIDAS') {
        // El mismo mensaje para usuario inexistente y clave mala: no revela qué usuarios existen.
        throw new PorteriaError(401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos');
      }
      req.porLog.warn('porteria: el directorio activo no respondió al login', { codigo: err.codigo || null });
      throw new PorteriaError(503, 'DIRECTORIO_NO_DISPONIBLE', 'No se pudo validar con el directorio activo. Intenta de nuevo.');
    }

    const config = obtenerConfig();
    const rol = rolDesdeGrupos(datos.memberOf, config.grupos);
    if (!rol) throw new PorteriaError(403, 'SIN_ROL_PORTERIA', 'Tu usuario no tiene acceso a Portería. Contacta a TI.');

    const sesion = { usuario: datos.usuario, nombre: datos.nombre, rol, sede: null };
    const sedes = await h360.listarSedes();
    res.json({
      success: true,
      data: { token: firmarToken(sesion, config), user: { ...sesion }, sedes },
    });
  }));

  router.post('/sede', apiCodigo('POR-AUT-002'), autenticar, aw(async (req, res) => {
    const sedeId = Number(req.body && req.body.sede_id);
    if (!Number.isInteger(sedeId) || sedeId <= 0) throw new PorteriaError(400, 'VALIDACION', 'Indica la sede');

    const sede = await h360.obtenerSede(sedeId);
    if (!sede) throw new PorteriaError(404, 'SEDE_NO_ENCONTRADA', 'La sede no existe o está inactiva');

    const { usuario, nombre, rol, exp } = req.porUsuario;
    const token = firmarToken({ usuario, nombre, rol, sede: { id: sede.id, nombre: sede.nombre } }, obtenerConfig(), { exp });
    res.json({
      success: true,
      data: { token, user: usuarioPublico({ usuario, nombre, rol, sede_id: sede.id, sede_nombre: sede.nombre }) },
    });
  }));

  router.get('/me', apiCodigo('POR-AUT-003'), autenticar, (req, res) => {
    res.json({ success: true, data: { user: usuarioPublico(req.porUsuario) } });
  });

  return router;
}

module.exports = { crearRouterAuth };
