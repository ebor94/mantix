// ============================================
// Router del módulo Agenda de Masajes (/api/masajes/v1)
// Patrón de src/porteria/routes/index.js: fábrica inyectable + guardián de configuración.
// ============================================
const express = require('express');
const logger = require('../../utils/logger');
const { leerEntorno } = require('../config/entorno');
const { crearBdPerezosa } = require('../db');
const apiCodigo = require('../middleware/apiCodigo');
const { masajesErrorHandler } = require('../middleware/errorHandler');
const { errorParaLog } = require('../utils/errorSeguro');
const { crearAutenticacion, crearResolverBeneficiario } = require('../middleware/autenticacion');
const { crearServicioBeneficiarios } = require('../services/beneficiarios.service');
const { crearRouterAuth } = require('./auth.routes');

/**
 * Fábrica inyectable (tests). `bd` = { ping(), obtener() }; `obtenerConfig()` devuelve leerEntorno().config;
 * `directorio` = { validarCredenciales } (AD). Las rutas de empleado y admin se agregan en la Tarea 11.
 */
function crearRouterMasajes({ bd, obtenerConfig, directorio, beneficiarios = crearServicioBeneficiarios({ bd }) }) {
  const router = express.Router();
  const autenticar = crearAutenticacion(obtenerConfig);
  const resolverBeneficiario = crearResolverBeneficiario({ beneficiarios });

  router.get('/health', apiCodigo('MSJ-SIS-001'), async (req, res) => {
    try {
      await bd.ping();
      res.json({ success: true, data: { estado: 'ok', bd: 'ok' } });
    } catch (err) {
      req.msjLog.error('masajes: falló el ping a la BD', errorParaLog(err));
      res.status(503).json({ success: false, message: 'La base de datos no responde' });
    }
  });

  router.use('/auth', crearRouterAuth({ obtenerConfig, directorio, beneficiarios, autenticar, resolverBeneficiario }));

  router.use(apiCodigo('MSJ-SIS-002'), (req, res) => res.status(404).json({ success: false, message: 'Ruta no encontrada' }));

  router.use(masajesErrorHandler);
  return router;
}

/**
 * Si la configuración no es válida responde 503 sin tumbar Mantix (se re-evalúa por request: es barato).
 * El motivo real va solo al log, nunca a la respuesta (podría nombrar variables o secretos faltantes).
 */
function crearGuardian({ leer = leerEntorno, real, log = logger }) {
  let avisado = false;
  let advertido = false;
  return function guardianMasajes(req, res, next) {
    const entorno = leer();
    if (!entorno.ok) {
      if (!avisado) {
        avisado = true;
        log.error(`masajes deshabilitado: ${entorno.motivo}`);
      }
      res.setHeader('X-MSJ-API', 'MSJ-SIS-000');
      return res.status(503).json({
        success: false,
        error: 'MSJ-SIS-000',
        motivo: 'NO_DISPONIBLE',
        message: 'La agenda de masajes no está disponible: configuración del servidor incompleta',
      });
    }
    avisado = false;
    if (entorno.advertencia && !advertido) {
      advertido = true;
      log.warn(`masajes: ${entorno.advertencia}`);
    }
    return real(req, res, next);
  };
}

// Producción: el router se construye UNA vez al cargar. Nada aquí toca la red ni lanza si faltan variables:
// el pool se crea al primer uso.
const bd = crearBdPerezosa(() => {
  const e = leerEntorno();
  if (!e.ok) throw new Error(`Masajes sin configuración válida: ${e.motivo}`);
  return e.config.db;
});
const real = crearRouterMasajes({
  bd,
  // Solo se llama detrás del guardián, cuando la configuración ya es válida.
  obtenerConfig: () => leerEntorno().config,
  // El login reutiliza la conexión al AD de H360 (LDAP_URL, LDAP_BASE_DN, LDAP_BIND_USER, LDAP_BIND_PASS).
  directorio: require('../../h360/services/ldap.service'),
});
const router = crearGuardian({ real });

module.exports = { router, crearRouterMasajes, crearGuardian, bd };
