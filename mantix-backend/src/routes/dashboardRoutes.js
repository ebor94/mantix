// Dashboard routes
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get dashboard statistics
router.get('/estadisticas', dashboardController.getStatistics);

// Get maintenance overview
router.get('/mantenimientos', dashboardController.getMaintenanceOverview);

// Get equipment status
router.get('/equipos', dashboardController.getEquipmentStatus);

module.exports = router;