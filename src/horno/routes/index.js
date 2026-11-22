// ============================================
// Router del módulo Horno INCOL (/api/horno/v1)
// ============================================
const express = require('express');
const logger = require('../../utils/logger');
const ldapService = require('../../h360/services/ldap.service');
const { leerEntorno } = require('../config/entorno');
const { crearBdPerezosa } = require('../db');
const apiCodigo = require('../middleware/apiCodigo');
const { hornoErrorHandler } = require('../middleware/errorHandler');
const { crearAutenticacion } = require('../middleware/autenticacion');
const { errorParaLog } = require('../../porteria/utils/errorSeguro');
const { crearRouterAuth } = require('./auth.routes');

/** Fábrica inyectable (tests). `bd` = { ping(), obtener() }; `directorio` = { validarCredenciales }. */
function crearRouterHorno({ bd, obtenerConfig, directorio }) {
  const router = express.Router();
  const autenticar = crearAutenticacion(obtenerConfig);

  router.get('/health', apiCodigo('HOR-SIS-001'), async (req, res) => {
    try {
      await bd.ping();
      res.json({ success: true, data: { estado: 'ok', bd: 'ok' } });
    } catch (err) {
      req.hornoLog.error('horno: falló el ping a la BD', errorParaLog(err));
      res.status(503).json({ success: false, message: 'La base de datos del horno no responde' });
    }
  });

  router.use('/auth', crearRouterAuth({ obtenerConfig, directorio, autenticar }));

  router.use(apiCodigo('HOR-SIS-002'), (req, res) => res.status(404).json({ success: false, message: 'Ruta no encontrada' }));
  router.use(hornoErrorHandler);
  return router;
}

// Producción: se construye UNA vez (express-rate-limit exige crear los limitadores al cargar).
// Nada aquí toca la red ni lanza si faltan variables: el pool se crea al primer uso.
const bd = crearBdPerezosa(() => {
  const e = leerEntorno();
  if (!e.ok) throw new Error(`Horno sin configuración válida: ${e.motivo}`);
  return e.config.db;
});
const real = crearRouterHorno({
  bd,
  obtenerConfig: () => leerEntorno().config, // solo se llama detrás del guardián
  directorio: ldapService,
});

// Si la configuración no es válida responde 503 sin tumbar Mantix (se re-evalúa por request, es barato).
let avisado = false;
function router(req, res, next) {
  const entorno = leerEntorno();
  if (!entorno.ok) {
    if (!avisado) {
      avisado = true;
      logger.error(`horno deshabilitado: ${entorno.motivo}`);
    }
    res.setHeader('X-HOR-API', 'HOR-SIS-000');
    return res.status(503).json({
      success: false,
      error: 'HOR-SIS-000',
      motivo: 'HORNO_DESHABILITADO',
      message: 'El módulo del horno no está disponible: configuración del servidor incompleta',
    });
  }
  avisado = false;
  return real(req, res, next);
}

module.exports = { router, crearRouterHorno, bd };
