const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/homenajes_residencia.controller')

router.get('/',                              requireRol('supervisora','coordinador','contabilidad','admin'), ctrl.listar)
router.get('/:id',                           requireRol('supervisora','coordinador','contabilidad','admin'), ctrl.obtener)
router.get('/:id/auditoria',                 requireRol('supervisora','coordinador','contabilidad','admin'), ctrl.obtenerAuditoria)
router.post('/',                             requireRol('supervisora','admin'),                              ctrl.crear)
router.patch('/:id/primera-llamada',         requireRol('supervisora','admin'),                              ctrl.guardarPrimeraLlamada)
router.patch('/:id/segunda-llamada',         requireRol('supervisora','admin'),                              ctrl.guardarSegundaLlamada)
router.patch('/:id/equipo-velacion',         requireRol('supervisora','admin'),                              ctrl.guardarEquipoVelacion)
router.post('/:id/novedades',                requireRol('supervisora','admin'),                              ctrl.agregarNovedad)
router.patch('/:id/novedades/:novedadId',    requireRol('supervisora','admin'),                              ctrl.actualizarNovedad)

// Tokens de confirmación por WhatsApp
router.post('/:id/tokens',                   requireRol('supervisora','admin'),                              ctrl.solicitarToken)
router.post('/:id/tokens/:tokenId/verificar',requireRol('supervisora','admin'),                              ctrl.verificarToken)
router.post('/:id/tokens/:tokenId/omitir',   requireRol('admin'),                                            ctrl.omitirToken)

module.exports = router
