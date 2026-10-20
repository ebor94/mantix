// ============================================
// src/trk/routes/index.js — Router del módulo TRIKIPELUDOS (/api/trk/v1)
// Cada módulo exporta { prefijo, router }. Toda ruta lleva apiCodigo() primero.
// ============================================
const express = require('express');
const TrkError = require('../utils/TrkError');
const { trkErrorHandler } = require('../middleware/errorHandler');

const modulos = [
  require('./auth.routes'),
  require('./usuarios.routes'),
  require('./import.routes'),
  require('./categorias.routes'),
  require('./participantes.routes'),
  require('./pasarela.routes'),
  require('./evento.routes'),
];

const router = express.Router();
for (const { prefijo, router: sub } of modulos) router.use(prefijo, sub);
router.use((req, res, next) => next(new TrkError(404, 'NO_ENCONTRADO', 'Ruta no encontrada')));
router.use(trkErrorHandler);

module.exports = { router, modulos };
