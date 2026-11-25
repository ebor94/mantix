const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/homenajes_sala.controller')

// El asistente de tanatólogo registra el homenaje en sala: es quien está en la
// sede cuando llega la familia, y hace el encuentro (F-05) del que la velación
// es la continuación. Crear el homenaje (POST /) sigue siendo de asesor y
// supervisora: eso se abre cuando se vende la sala, no cuando se atiende.

// Reporte de visitas cross-homenaje (por fecha) — antes de /:id para evitar colisión
router.get('/visitas',              requireRol('asistente_tanatologo', 'asesor', 'supervisora', 'coordinador', 'admin'), ctrl.listarVisitas)

router.get('/',                            requireRol('asistente_tanatologo', 'asesor', 'supervisora', 'coordinador', 'admin'), ctrl.listar)
router.get('/:id',                         requireRol('asistente_tanatologo', 'asesor', 'supervisora', 'coordinador', 'admin'), ctrl.obtener)
router.get('/:id/auditoria',               requireRol('asistente_tanatologo', 'asesor', 'supervisora', 'coordinador', 'admin'), ctrl.obtenerAuditoria)
router.post('/',                           requireRol('asesor', 'supervisora', 'admin'),                ctrl.crear)
router.patch('/:id/ingreso',               requireRol('asistente_tanatologo', 'asesor', 'supervisora', 'admin'),                ctrl.guardarIngreso)
router.patch('/:id/salida',                requireRol('asistente_tanatologo', 'asesor', 'supervisora', 'admin'),                ctrl.guardarSalida)
router.post('/:id/visitas',                requireRol('asistente_tanatologo', 'asesor', 'supervisora', 'admin'),                ctrl.agregarVisita)
router.patch('/:id/visitas/:visitaId',     requireRol('asistente_tanatologo', 'asesor', 'supervisora', 'admin'),                ctrl.actualizarVisita)

// Novedades con el ser querido. Mismos roles que escriben el resto del
// homenaje, más coordinador, que es quien las registra en residencia.
router.post('/:id/novedades',              requireRol('asistente_tanatologo', 'asesor', 'supervisora', 'coordinador', 'admin'), ctrl.agregarNovedad)
router.patch('/:id/novedades/:novedadId',  requireRol('asistente_tanatologo', 'asesor', 'supervisora', 'coordinador', 'admin'), ctrl.actualizarNovedad)

module.exports = router
