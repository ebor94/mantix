const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/novedades_externas.controller')

router.get('/',                        requireRol('asistente_tanatologo', 'supervisora', 'admin'), ctrl.listar)
router.get('/:novedadId',              requireRol('asistente_tanatologo', 'supervisora', 'admin'), ctrl.obtener)
router.patch('/:novedadId/resolver',   requireRol('asistente_tanatologo', 'admin'),                ctrl.resolver)

module.exports = router
