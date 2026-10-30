// ============================================
// Router del módulo Portería (/api/porteria/v1)
// ============================================
const express = require('express');
const logger = require('../../utils/logger');
const ldapService = require('../../h360/services/ldap.service');
const { leerEntorno } = require('../config/entorno');
const { crearBdPerezosa } = require('../db');
const apiCodigo = require('../middleware/apiCodigo');
const { porteriaErrorHandler } = require('../middleware/errorHandler');
const { crearAutenticacion } = require('../middleware/autenticacion');
const { errorParaLog } = require('../utils/errorSeguro');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearConductores } = require('../services/conductores.service');
const { crearRepositorioMotivos } = require('../repositorios/motivos');
const { crearRouterAuth } = require('./auth.routes');

/**
 * Fábrica inyectable (tests). `bd` = { ping(), obtener() }; `obtenerConfig()` devuelve leerEntorno().config;
 * `directorio` = { validarCredenciales }; `conductores` = { listar(), existe() }.
 */
function crearRouterPorteria({
  bd, obtenerConfig, directorio, conductores, h360 = crearH360Lectura(bd), motivos = crearRepositorioMotivos(bd),
}) {
  const router = express.Router();
  const autenticar = crearAutenticacion(obtenerConfig);

  router.get('/health', apiCodigo('POR-SIS-001'), async (req, res) => {
    try {
      await bd.ping();
      res.json({ success: true, data: { estado: 'ok', bd: 'ok' } });
    } catch (err) {
      req.porLog.error('porteria: falló el ping a la BD', errorParaLog(err));
      res.status(503).json({ success: false, message: 'La base de datos no responde' });
    }
  });

  router.use('/auth', crearRouterAuth({ obtenerConfig, directorio, h360, autenticar }));

  router.use(apiCodigo('POR-SIS-002'), (req, res) => res.status(404).json({ success: false, message: 'Ruta no encontrada' }));

  router.use(porteriaErrorHandler);
  return router;
}

// Producción: el router se construye UNA vez al cargar (express-rate-limit exige crear los limitadores aquí).
// Nada aquí toca la red ni lanza si faltan variables: el pool se crea al primer uso.
const bd = crearBdPerezosa(() => {
  const e = leerEntorno();
  if (!e.ok) throw new Error(`Portería sin configuración válida: ${e.motivo}`);
  return e.config.db;
});
const real = crearRouterPorteria({
  bd,
  // Solo se llama detrás del guardián, cuando la configuración ya es válida.
  obtenerConfig: () => leerEntorno().config,
  directorio: ldapService,
  conductores: crearConductores({
    listarMiembrosGrupo: ldapService.listarMiembrosGrupo,
    grupos: () => [process.env.LDAP_GROUP_ASIST_TANATOLOGO, process.env.LDAP_GROUP_ASISTENTE],
    log: logger,
  }),
});

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
