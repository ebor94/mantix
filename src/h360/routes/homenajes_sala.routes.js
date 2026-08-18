const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/homenajes_sala.controller')

// Reporte de visitas cross-homenaje (por fecha) — antes de /:id para evitar colisión
router.get('/visitas',              requireRol('supervisora', 'coordinador', 'admin'), ctrl.listarVisitas)

router.get('/',                     requireRol('supervisora', 'coordinador', 'admin'), ctrl.listar)
router.get('/:id',                  requireRol('supervisora', 'coordinador', 'admin'), ctrl.obtener)
router.post('/',                    requireRol('supervisora', 'admin'),                ctrl.crear)
router.patch('/:id/ingreso',        requireRol('supervisora', 'admin'),                ctrl.guardarIngreso)
router.patch('/:id/salida',         requireRol('supervisora', 'admin'),                ctrl.guardarSalida)
router.post('/:id/visitas',         requireRol('supervisora', 'admin'),                ctrl.agregarVisita)

module.exports = router
