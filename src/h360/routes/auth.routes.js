const router                    = require('express').Router()
const { login, cambiarRol, me } = require('../controllers/auth.controller')
const { verifyToken }           = require('../middleware/auth')

router.post('/login', login)
// Cambiar de rol no pide contraseña: los roles permitidos vienen firmados en
// el token. Quien hace dos oficios alterna sin cerrar sesión.
router.post('/rol',   verifyToken, cambiarRol)
router.get ('/me',    verifyToken, me)

module.exports = router
