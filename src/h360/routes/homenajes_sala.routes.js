const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/homenajes_sala.controller')

// Reporte de visitas cross-homenaje (por fecha) — antes de /:id para evitar colisión
router.get('/visitas',              requireRol('asesor', 'supervisora', 'coordinador', 'admin'), ctrl.listarVisitas)

router.get('/',                            requireRol('asesor', 'supervisora', 'coordinador', 'admin'), ctrl.listar)
router.get('/:id',                         requireRol('asesor', 'supervisora', 'coordinador', 'admin'), ctrl.obtener)
router.get('/:id/auditoria',               requireRol('asesor', 'supervisora', 'coordinador', 'admin'), ctrl.obtenerAuditoria)
router.post('/',                           requireRol('asesor', 'supervisora', 'admin'),                ctrl.crear)
router.patch('/:id/ingreso',               requireRol('asesor', 'supervisora', 'admin'),                ctrl.guardarIngreso)
router.patch('/:id/salida',                requireRol('asesor', 'supervisora', 'admin'),                ctrl.guardarSalida)
router.post('/:id/visitas',                requireRol('asesor', 'supervisora', 'admin'),                ctrl.agregarVisita)
router.patch('/:id/visitas/:visitaId',     requireRol('asesor', 'supervisora', 'admin'),                ctrl.actualizarVisita)

module.exports = router
