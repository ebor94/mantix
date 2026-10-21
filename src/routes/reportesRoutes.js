// Reportes routes
const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportesController');
const { auth } = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(auth);

// Generate maintenance report
router.get('/mantenimiento', reportesController.generateMaintenanceReport);

// Generate equipment report
router.get('/equipos', reportesController.generateEquipmentReport);

// Generate user report
router.get('/usuarios', reportesController.generateUserReport);

// R-25 Programa anual de mantenimientos (pivot categoría × actividad × 12 meses P/E)
router.get('/programa-anual', reportesController.generateProgramaAnualReport);

module.exports = router;