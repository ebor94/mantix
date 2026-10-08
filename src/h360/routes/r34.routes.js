const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/r34.controller')

// El R-34 lo emiten coordinación y administración. En la hoja que esto
// reemplaza, la columna "Autoriza" la firmaban ellos.
const ROLES_R34 = ['coordinador', 'admin']

// Literales antes del comodín, que si no capturan "contrato" como id.
router.get('/contrato/:contrato', requireRol(...ROLES_R34), ctrl.porContrato)
router.get('/',                   requireRol(...ROLES_R34), ctrl.listar)
router.post('/',                  requireRol(...ROLES_R34), ctrl.crear)
router.get('/:id/pdf',            requireRol(...ROLES_R34), ctrl.pdf)
router.post('/:id/enviar',        requireRol(...ROLES_R34), ctrl.enviar)

module.exports = router
