const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/exequias.controller')

router.get('/',                       ctrl.listar)
router.get('/:id',                    ctrl.obtener)
router.post('/',                      requireRol('asesor', 'coordinador', 'admin'),               ctrl.crear)
router.patch('/:id',                  requireRol('asesor', 'coordinador', 'admin'),               ctrl.actualizar)
router.post('/:id/confirmar',         requireRol('recepcion', 'asesor', 'admin'),                 ctrl.confirmar)
router.post('/:id/asignar-vehiculo',  requireRol('coordinador', 'admin'),                         ctrl.asignarVehiculo)
router.post('/:id/marcar-realizada',  requireRol('coordinador', 'admin'),                         ctrl.marcarRealizada)
router.post('/:id/cancelar',          requireRol('asesor', 'coordinador', 'admin'),               ctrl.cancelar)
router.delete('/:id',                 requireRol('coordinador', 'admin'),                         ctrl.eliminar)

module.exports = router
