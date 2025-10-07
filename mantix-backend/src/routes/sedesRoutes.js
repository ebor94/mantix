// Sedes routes
const express = require('express');
const router = express.Router();
const sedesController = require('../controllers/sedesController');
const authMiddleware = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all sedes
router.get('/', sedesController.getAll);

// Get sede by ID
router.get('/:id', sedesController.getById);

// Create sede
router.post('/', sedesController.create);

// Update sede
router.put('/:id', sedesController.update);

// Delete sede
router.delete('/:id', sedesController.delete);

module.exports = router;