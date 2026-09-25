const router       = require('express').Router()
const ctrl         = require('../controllers/asistencias.controller')
const reaperturaCtrl = require('../controllers/reapertura.controller')
const { requireRol } = require('../middleware/auth')

const ROLES_CAMPO  = ['asistente', 'tanatologo', 'asistente_tanatologo', 'supervisora', 'asesor', 'coordinador', 'admin']
const ROLES_AVANCE = ['asistente', 'tanatologo', 'asistente_tanatologo', 'supervisora', 'coordinador', 'contabilidad', 'admin']

// Antes de /:id, que si no captura "resumen" como identificador
router.get ('/resumen',            ctrl.resumen)
router.get ('/',                   ctrl.listar)
router.get ('/:id',                ctrl.obtener)
router.get ('/:id/historial',      ctrl.obtenerHistorial)
router.get ('/:id/etapa/:etapa',   ctrl.obtenerEtapa)
router.post('/',                 requireRol('asesor', 'coordinador', 'admin'), ctrl.crear)
router.post('/:id/actores',      requireRol('asesor', 'coordinador', 'admin'), ctrl.asignarActores)
router.patch('/:id/estado',      requireRol(...ROLES_AVANCE),            ctrl.cambiarEstado)
router.post('/:id/etapa',        requireRol(...ROLES_CAMPO),             ctrl.guardarEtapa)
router.post('/:id/aprobar',      requireRol('coordinador', 'contabilidad', 'admin'), ctrl.aprobar)
router.post('/:id/nota',         requireRol('contabilidad', 'coordinador', 'supervisora', 'admin'), ctrl.agregarNota)
router.post('/:id/desistir',     requireRol('asesor', 'coordinador', 'admin'), ctrl.desistir)

// Reapertura de sección con token vía Google Chat (F-01..F-07)
router.post('/:id/reapertura/solicitar', requireRol(...ROLES_CAMPO), reaperturaCtrl.solicitar)
router.post('/:id/reapertura/validar',   requireRol(...ROLES_CAMPO), reaperturaCtrl.validar)
router.patch('/:id/f01',                 requireRol(...ROLES_CAMPO), reaperturaCtrl.actualizarF01)

module.exports = router
