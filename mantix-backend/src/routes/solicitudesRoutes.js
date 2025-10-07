// Solicitudes routes
const express = require('express');
const router = express.Router();
const solicitudesController = require('../controllers/solicitudesController');
const authMiddleware = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all solicitudes
router.get('/', solicitudesController.getAll);

// Get solicitud by ID
router.get('/:id', solicitudesController.getById);

// Create solicitud
router.post('/', solicitudesController.create);

// Update solicitud
router.put('/:id', solicitudesController.update);

// Delete solicitud
router.delete('/:id', solicitudesController.delete);

module.exports = router;