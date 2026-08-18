const router = require('express').Router()
const ctrl = require('../controllers/sedes.controller')

router.get('/', ctrl.listar)

module.exports = router
