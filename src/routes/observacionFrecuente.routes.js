// ============================================
// src/routes/observacionFrecuente.routes.js
// Observaciones frecuentes (chips del campo de observaciones del registro).
// GET: cualquier autenticado. POST/PUT/DELETE: solo super_admin.
// ============================================
const { Router } = require('express');
const controller = require('../controllers/observacionFrecuente.controller');
const { auth, requireSuperAdmin } = require('../middleware/auth');

const router = Router();

router.get('/',        auth, controller.listar);
router.post('/',       auth, requireSuperAdmin, controller.crear);
router.put('/:id',     auth, requireSuperAdmin, controller.actualizar);
router.delete('/:id',  auth, requireSuperAdmin, controller.eliminar);

module.exports = router;
