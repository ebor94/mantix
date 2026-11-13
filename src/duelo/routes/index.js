// ============================================
// Router del módulo Duelo (/api/duelo/v1)
// ============================================
const express = require('express');
const axios = require('axios');
const { dueloErrorHandler } = require('../middleware/errorHandler');
const { crearRepositorioInscripciones } = require('../repositorios/inscripciones');
const { crearServicioFotos } = require('../services/fotos.service');
const { crearNotificador } = require('../services/notificador');
const { crearServicioInscripcion } = require('../services/inscribir.service');
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
}) {
  const router = express.Router();

  router.use(crearRouterPublico({ obtenerConfig, servicio, http }));
  router.use('/panel', crearRouterPanel({ obtenerConfig, repo, fotos }));

  router.use((req, res) => res.status(404).json({ success: false, motivo: 'NO_ENCONTRADO', message: 'Ruta no encontrada' }));
  router.use(dueloErrorHandler);
  return router;
}

module.exports = { crearRouterDuelo };
