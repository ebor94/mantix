// ============================================
// src/routes/borrador.routes.js
// Montado en /api/afiliados/borradores
// ============================================
const { Router } = require('express');
const controller  = require('../controllers/borrador.controller');
const { auth }    = require('../middleware/auth');

const router = Router();

// GET    /afiliados/borradores        — listar borradores del asesor
router.get('/',      auth, controller.listar);

// GET    /afiliados/borradores/:id    — obtener borrador completo
router.get('/:id',   auth, controller.getOne);

// POST   /afiliados/borradores        — crear nuevo borrador
router.post('/',     auth, controller.crear);

// PUT    /afiliados/borradores/:id    — actualizar borrador existente
router.put('/:id',   auth, controller.actualizar);

// DELETE /afiliados/borradores/:id    — eliminar borrador
router.delete('/:id', auth, controller.eliminar);

module.exports = router;
