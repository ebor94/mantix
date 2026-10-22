// ============================================
// src/trk/routes/index.js — Router del módulo TRIKIPELUDOS (/api/trk/v1)
// Cada módulo exporta { prefijo, router }. Toda ruta lleva apiCodigo() primero.
// ============================================
const express = require('express');
const TrkError = require('../utils/TrkError');
const { trkErrorHandler } = require('../middleware/errorHandler');
const { verificarEntorno } = require('../config/verificarEntorno');
const logger = require('../../utils/logger');

// I1: con un TRK_JWT_SECRET ausente o igual a un secreto de Mantix el módulo queda deshabilitado
// (503), sin tumbar Mantix. Se registra al cargar y se re-evalúa por request (comparación barata).
const entornoInicial = verificarEntorno();
if (!entornoInicial.ok) logger.error(`TRIKIPELUDOS deshabilitado: ${entornoInicial.motivo}`, { modulo: 'trk' });
else if (entornoInicial.advertencia) logger.warn(entornoInicial.advertencia, { modulo: 'trk' });

const modulos = [
  require('./auth.routes'),
  require('./usuarios.routes'),
  require('./import.routes'),
  require('./categorias.routes'),
  require('./participantes.routes'),
  require('./pasarela.routes'),
  require('./evento.routes'),
  require('./calificaciones.routes'),
  require('./jurado.routes'),
  require('./borradores.routes'),
  require('./rubricas.routes'),
  require('./ranking.routes'),
  require('./export.routes'),
];

const router = express.Router();
router.use((req, res, next) => {
  if (verificarEntorno().ok) return next();
  return next(new TrkError(503, 'TRK_DESHABILITADO', 'El módulo TRIKIPELUDOS no está disponible: configuración del servidor incompleta'));
});
for (const { prefijo, router: sub } of modulos) router.use(prefijo, sub);
router.use((req, res, next) => next(new TrkError(404, 'NO_ENCONTRADO', 'Ruta no encontrada')));
router.use(trkErrorHandler);

module.exports = { router, modulos };
