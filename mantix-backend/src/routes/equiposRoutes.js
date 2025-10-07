// Equipos routes
const express = require('express');
const router = express.Router();
const equiposController = require('../controllers/equiposController');
const authMiddleware = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all equipos
router.get('/', equiposController.getAll);

// Get equipo by ID
router.get('/:id', equiposController.getById);

// Create equipo
router.post('/', equiposController.create);

// Update equipo
router.put('/:id', equiposController.update);

// Delete equipo
router.delete('/:id', equiposController.delete);

module.exports = router;