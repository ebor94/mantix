const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/vehiculos.controller')

router.get('/',        ctrl.listar)                                                // cualquier autenticado
router.get('/:id',     ctrl.obtener)
router.post('/',       requireRol('coordinador', 'admin'), ctrl.crear)
router.patch('/:id',   requireRol('coordinador', 'admin'), ctrl.actualizar)
router.delete('/:id',  requireRol('admin'),                ctrl.eliminar)

module.exports = router
