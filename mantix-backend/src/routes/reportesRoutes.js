// Reportes routes
const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportesController');
const authMiddleware = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Generate maintenance report
router.get('/mantenimiento', reportesController.generateMaintenanceReport);

// Generate equipment report
router.get('/equipos', reportesController.generateEquipmentReport);

// Generate user report
router.get('/usuarios', reportesController.generateUserReport);

module.exports = router;