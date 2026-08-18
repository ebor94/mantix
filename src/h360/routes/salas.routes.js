const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/salas.controller')

router.get('/',        ctrl.listar)
router.post('/',       requireRol('admin'),               ctrl.crear)
router.patch('/:id',   requireRol('admin'),               ctrl.actualizar)

module.exports = router
