// ============================================
// Router del módulo Duelo (/api/duelo/v1)
// ============================================
const express = require('express');
const axios = require('axios');
const logger = require('../../utils/logger');
const { leerEntorno } = require('../config/entorno');
const { crearBdPerezosa } = require('../db');
const { dueloErrorHandler } = require('../middleware/errorHandler');
const { crearRepositorioInscripciones } = require('../repositorios/inscripciones');
const { crearServicioFotos } = require('../services/fotos.service');
const { crearNotificador } = require('../services/notificador');
const { crearServicioInscripcion } = require('../services/inscribir.service');
const { crearDisponibilidad } = require('../services/disponibilidad');
const { crearRouterPublico } = require('./publico.routes');
const { crearRouterPanel } = require('./panel.routes');

/**
 * Fábrica inyectable (tests). `bd` = { ping(), obtener() }; `obtenerConfig()` devuelve leerEntorno().config;
 * `http` tiene la firma de axios. Lo demás se construye desde ahí.
 */
function crearRouterDuelo({
  bd, obtenerConfig, http = axios,
  repo = crearRepositorioInscripciones(bd),
  fotos = crearServicioFotos({ dir: () => obtenerConfig().fotosPath }),
  servicio = crearServicioInscripcion({
    repo, fotos, obtenerConfig,
    notificar: (correo, datos) => crearNotificador(correo, http).notificar(datos),
  }),
  disponibilidad = crearDisponibilidad({ repo, obtenerConfig }),
}) {
  const router = express.Router();

  router.use(crearRouterPublico({ obtenerConfig, servicio, http, disponibilidad }));
  router.use('/panel', crearRouterPanel({ obtenerConfig, repo, fotos }));

  router.use((req, res) => res.status(404).json({ success: false, motivo: 'NO_ENCONTRADO', message: 'Ruta no encontrada' }));
  router.use(dueloErrorHandler);
  return router;
}

// Producción: el router se construye UNA vez al cargar (express-rate-limit exige crear los limitadores aquí).
// Nada aquí toca la red ni lanza si faltan variables: el pool se crea al primer uso.
const bd = crearBdPerezosa(() => {
  const e = leerEntorno();
  if (!e.ok) throw new Error(`Duelo sin configuración válida: ${e.motivo}`);
  return e.config.db;
});
// obtenerConfig solo se llama detrás del guardián, cuando la configuración ya es válida.
const real = crearRouterDuelo({ bd, obtenerConfig: () => leerEntorno().config });

// Si la configuración no es válida responde 503 sin tumbar Mantix (se re-evalúa por petición, es barato).
let avisado = false;
function router(req, res, next) {
  const entorno = leerEntorno();
  if (!entorno.ok) {
    if (!avisado) {
      avisado = true;
      logger.error(`duelo deshabilitado: ${entorno.motivo}`);
    }
    return res.status(503).json({
      success: false,
      motivo: 'DUELO_DESHABILITADO',
      message: 'El formulario no está disponible en este momento. Inténtalo más tarde.',
    });
  }
  avisado = false;
  return real(req, res, next);
}

module.exports = { router, crearRouterDuelo, bd };
