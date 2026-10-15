const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/licencias.controller')

// La licencia la tramita quien atiende a la familia y quien coordina.
const ROLES_LICENCIA = ['asesor', 'coordinador', 'admin']

// Literales antes del comodín, que si no capturan "contrato" como id.
router.get('/contrato/:contrato', requireRol(...ROLES_LICENCIA), ctrl.porContrato)
router.get('/',                   requireRol(...ROLES_LICENCIA), ctrl.listar)
router.post('/',                  requireRol(...ROLES_LICENCIA), ctrl.crear)
router.get('/:id',                requireRol(...ROLES_LICENCIA), ctrl.obtener)

module.exports = router
