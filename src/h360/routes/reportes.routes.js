const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/reportes.controller')

// Reportes de gerencia: miran todas las sedes, no solo la propia.
const ROLES_REPORTE = ['coordinador', 'admin']

router.get('/salas-velacion', requireRol(...ROLES_REPORTE), ctrl.salasVelacion)

module.exports = router
