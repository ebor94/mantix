const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/cofres.controller')

// Solo lectura por ahora (roles admin/coordinador). CRUD completo → sesión futura.
router.get('/',                    requireRol('admin', 'coordinador'), ctrl.listar)
router.get('/:consecutivo/usos',   requireRol('admin', 'coordinador'), ctrl.obtenerUsos)

module.exports = router
