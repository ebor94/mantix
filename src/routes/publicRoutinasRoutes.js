// =============================================================
// src/routes/publicRoutinasRoutes.js — Rutas PÚBLICAS de rutinas (sin auth)
// Rate limiting estricto. Se montan en /api/public/rutina.
// =============================================================
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const ctrl = require('../controllers/rutinasController');

// Lectura: 60 req/min por IP
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiadas solicitudes. Intente en un minuto.' }
});

// Escritura: 10 req/min por IP
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiadas solicitudes. Intente en un minuto.' }
});

router.get('/:token', readLimiter, ctrl.getRutinaPublica);
router.post('/:token', writeLimiter, ctrl.registrarPreEjecucion);

module.exports = router;
