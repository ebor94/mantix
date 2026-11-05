// =============================================================
// src/routes/rutinasRoutes.js — Rutas INTERNAS de rutinas (requieren auth)
// =============================================================
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const ctrl = require('../controllers/rutinasController');

router.use(auth);

router.get('/pre-ejecuciones', ctrl.listarRutinas);
router.get('/pendientes', ctrl.listarPendientesDePreEjecucion);
router.post('/tokens/lote', ctrl.generarTokensLote);
router.post('/:id/token', ctrl.generarTokenQR);
router.post('/pre-ejecuciones/:id/aprobar', ctrl.aprobarPreEjecucion);
router.post('/pre-ejecuciones/:id/rechazar', ctrl.rechazarPreEjecucion);

module.exports = router;
