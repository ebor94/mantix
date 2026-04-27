const router       = require('express').Router()
const ctrl         = require('../controllers/asistencias.controller')
const { requireRol } = require('../middleware/auth')

const ROLES_CAMPO  = ['asistente', 'tanatologo', 'asistente_tanatologo', 'supervisora', 'admin']
const ROLES_AVANCE = ['asistente', 'tanatologo', 'asistente_tanatologo', 'supervisora', 'coordinador', 'contabilidad', 'admin']

router.get ('/',                   ctrl.listar)
router.get ('/:id',                ctrl.obtener)
router.get ('/:id/historial',      ctrl.obtenerHistorial)
router.get ('/:id/etapa/:etapa',   ctrl.obtenerEtapa)
router.post('/',                 requireRol('asesor', 'admin'),          ctrl.crear)
router.post('/:id/actores',      requireRol('admin'),                    ctrl.asignarActores)
router.patch('/:id/estado',      requireRol(...ROLES_AVANCE),            ctrl.cambiarEstado)
router.post('/:id/etapa',        requireRol(...ROLES_CAMPO),             ctrl.guardarEtapa)
router.post('/:id/aprobar',      requireRol('coordinador', 'contabilidad', 'admin'), ctrl.aprobar)

module.exports = router
