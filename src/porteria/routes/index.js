// ============================================
// Router del módulo Portería (/api/porteria/v1)
// ============================================
const express = require('express');
const logger = require('../../utils/logger');
const { leerEntorno } = require('../config/entorno');
const { crearBdPerezosa } = require('../db');
const apiCodigo = require('../middleware/apiCodigo');
const { porteriaErrorHandler } = require('../middleware/errorHandler');
const { errorParaLog } = require('../../trk/utils/errorSeguro');

/** Fábrica inyectable (tests): `bd` = { ping(), obtener() }. */
function crearRouterPorteria({ bd }) {
  const router = express.Router();

  router.get('/health', apiCodigo('POR-SIS-001'), async (req, res) => {
    try {
      await bd.ping();
      res.json({ success: true, data: { estado: 'ok', bd: 'ok' } });
    } catch (err) {
      req.porLog.error('porteria: falló el ping a la BD', errorParaLog(err));
      res.status(503).json({ success: false, message: 'La base de datos no responde' });
    }
  });

  router.use(porteriaErrorHandler);
  return router;
}

// Producción: el router se construye UNA vez al cargar (los limitadores de fases siguientes lo exigen).
// Nada aquí toca la red ni lanza si faltan variables: el pool se crea al primer uso.
const bd = crearBdPerezosa(() => leerEntorno().config.db);
const real = crearRouterPorteria({ bd });

// Si la configuración no es válida responde 503 sin tumbar Mantix (se re-evalúa por request, es barato).
let avisado = false;
function router(req, res, next) {
  const entorno = leerEntorno();
  if (!entorno.ok) {
    if (!avisado) {
      avisado = true;
      logger.error(`porteria deshabilitado: ${entorno.motivo}`);
    }
    res.setHeader('X-POR-API', 'POR-SIS-000');
    return res.status(503).json({
      success: false,
      error: 'POR-SIS-000',
      motivo: 'PORTERIA_DESHABILITADO',
      message: 'El módulo de Portería no está disponible: configuración del servidor incompleta',
    });
  }
  avisado = false;
  return real(req, res, next);
}

module.exports = { router, crearRouterPorteria, bd };
