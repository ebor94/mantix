// Mantenimientos routes
const express = require('express');
const router = express.Router();
const mantenimientosController = require('../controllers/mantenimientosController');
const authMiddleware = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all mantenimientos
router.get('/', mantenimientosController.getAll);

// Get mantenimiento by ID
router.get('/:id', mantenimientosController.getById);

// Create mantenimiento
router.post('/', mantenimientosController.create);

// Update mantenimiento
router.put('/:id', mantenimientosController.update);

// Delete mantenimiento
router.delete('/:id', mantenimientosController.delete);

module.exports = router;