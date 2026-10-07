const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/exequias.controller')
const seg  = require('../controllers/exequias_seguimiento.controller')

// Recepción hace el seguimiento; el coordinador y el asesor lo ven y lo pueden
// completar porque también confirman exequias.
const ROLES_SEGUIMIENTO = ['recepcion', 'asesor', 'coordinador', 'admin']
// El tramitador va a pagar. Recepción también puede dejar el pago registrado
// cuando lo hizo otra persona.
const ROLES_PAGO        = ['tramitador', 'recepcion', 'coordinador', 'admin']

router.get('/',                       ctrl.listar)
// Antes de /:id, que si no captura "pendientes" como identificador
router.get('/pendientes',             ctrl.pendientes)
// Igual que arriba: literales antes del comodín
router.get('/pagos/pendientes',       requireRol(...ROLES_PAGO),         seg.pagosPendientes)
router.get('/pagos',                  requireRol(...ROLES_PAGO),         seg.pagosConfirmados)
router.get('/:id',                    ctrl.obtener)
router.get('/:id/formato-r13',        ctrl.formatoR13)

// ── Seguimiento y pago ────────────────────────────────────────────────────
// Cada escritura es su propia acción con POST, como el resto del módulo
// (confirmar, cancelar, asignar-vehiculo). Además de ser el estilo de la casa,
// el extractor del catálogo de permisos deriva la clave del último segmento:
// un PUT y un GET sobre la misma ruta quedarían con el mismo permiso.
router.get('/:id/seguimiento',           requireRol(...ROLES_SEGUIMIENTO, 'tramitador'), seg.obtener)
router.post('/:id/seguimiento/guardar',  requireRol(...ROLES_SEGUIMIENTO),   seg.guardar)
router.post('/:id/seguimiento/cerrar',   requireRol(...ROLES_SEGUIMIENTO),   seg.cerrar)
router.post('/:id/seguimiento/reabrir',  requireRol('coordinador', 'admin'), seg.reabrir)
router.get('/:id/pago/foto',             requireRol(...ROLES_SEGUIMIENTO, 'tramitador'), seg.fotoPago)
router.post('/:id/pago/confirmar',       requireRol(...ROLES_PAGO),          seg.confirmarPago)
router.delete('/:id/pago',               requireRol('coordinador', 'admin'), seg.anularPago)
router.post('/',                      requireRol('asesor', 'coordinador', 'admin'),               ctrl.crear)
// Recepción confirma, y al confirmar suele tener que completar lo que faltaba
// —la hora, sobre todo, que es obligatoria para asignar vehículo—.
router.patch('/:id',                  requireRol('asesor', 'recepcion', 'coordinador', 'admin'),  ctrl.actualizar)
router.post('/:id/confirmar',         requireRol('recepcion', 'asesor', 'admin'),                 ctrl.confirmar)
router.post('/:id/asignar-vehiculo',  requireRol('coordinador', 'admin'),                         ctrl.asignarVehiculo)
router.post('/:id/marcar-realizada',  requireRol('coordinador', 'admin'),                         ctrl.marcarRealizada)
router.post('/:id/cancelar',          requireRol('asesor', 'coordinador', 'admin'),               ctrl.cancelar)
router.delete('/:id',                 requireRol('coordinador', 'admin'),                         ctrl.eliminar)

module.exports = router
