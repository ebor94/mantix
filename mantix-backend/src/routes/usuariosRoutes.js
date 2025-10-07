// Usuarios routes
const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuariosController');
const authMiddleware = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all users
router.get('/', usuariosController.getAll);

// Get user by ID
router.get('/:id', usuariosController.getById);

// Create user
router.post('/', usuariosController.create);

// Update user
router.put('/:id', usuariosController.update);

// Delete user
router.delete('/:id', usuariosController.delete);

module.exports = router;