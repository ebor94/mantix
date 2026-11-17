/**
 * identity/routes/index.js
 * Montado en /api/identidad por src/routes/index.js
 */
const router = require('express').Router();
const auth = require('../controllers/auth.controller');
const apps = require('../controllers/aplicaciones.controller');
const { verifyIdentidad } = require('../middleware/verifyIdentidad');
const { crearLimitadoresLogin } = require('../middleware/limitadoresLogin');

const { limitadorIp, limitadorUsuario } = crearLimitadoresLogin();

// Auth — públicas
router.post('/login',   limitadorIp, limitadorUsuario, auth.login);
router.post('/refresh', auth.refresh);
router.post('/logout',  auth.logout);

// Perfil identidad — requiere token de identidad
router.get ('/me',                verifyIdentidad, auth.me);

// Aplicaciones del ecosistema
router.get('/aplicaciones',       verifyIdentidad, apps.listarParaIdentidad);
router.get('/aplicaciones/admin', verifyIdentidad, apps.listarAdmin);
router.post  ('/aplicaciones',       verifyIdentidad, apps.crear);
router.put   ('/aplicaciones/:id',   verifyIdentidad, apps.actualizar);
router.delete('/aplicaciones/:id',   verifyIdentidad, apps.eliminar);

module.exports = router;
