const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/novedades_externas.controller')

// El asistente entra porque las novedades se le asignan a él —incluidos los
// externos de las funerarias aliadas—. Ver el menú no le muestra nada ajeno:
// `listar` ya recorta a lo asignado a cada quien, salvo admin.
const ROLES_NOVEDAD = ['asistente', 'asistente_tanatologo', 'supervisora', 'admin']
// Resolver es el trabajo en sitio: lo hace a quien se le asignó.
const ROLES_RESOLVER = ['asistente', 'asistente_tanatologo', 'admin']

router.get('/',                        requireRol(...ROLES_NOVEDAD),  ctrl.listar)
router.get('/:novedadId',              requireRol(...ROLES_NOVEDAD),  ctrl.obtener)
router.patch('/:novedadId/resolver',   requireRol(...ROLES_RESOLVER), ctrl.resolver)

module.exports = router
