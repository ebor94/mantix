// ============================================
// src/routes/notificaciones.routes.js
// ============================================
const express = require('express');
const router = express.Router();
const notificacionesController = require('../controllers/notificacionesController');
const { auth, requireSuperAdmin } = require('../middleware/auth');

// Rutas para usuarios autenticados
router.get('/mis-notificaciones', auth, notificacionesController.getMisNotificaciones);
router.get('/no-leidas', auth, notificacionesController.getNoLeidas);
router.get('/contador-no-leidas', auth, notificacionesController.getContadorNoLeidas);
router.get('/:id', auth, notificacionesController.getById);
router.put('/:id/marcar-leida', auth, notificacionesController.marcarComoLeida);
router.put('/marcar-todas-leidas', auth, notificacionesController.marcarTodasComoLeidas);
router.delete('/:id', auth, notificacionesController.eliminar);
router.delete('/limpiar/leidas', auth, notificacionesController.eliminarLeidas);

// Rutas admin
router.post('/', auth, requireSuperAdmin, notificacionesController.crear);

module.exports = router;