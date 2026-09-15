const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/gestion_servicios.controller')

router.get('/',      requireRol('coordinador', 'supervisora', 'contabilidad', 'admin'), ctrl.listar)
router.patch('/:id', requireRol('coordinador', 'admin'),                                ctrl.actualizar)

module.exports = router
