/**
 * identity/routes/index.js
 * Montado en /api/identidad por src/routes/index.js
 */
const router = require('express').Router();
const auth = require('../controllers/auth.controller');
const apps = require('../controllers/aplicaciones.controller');
const { verifyIdentidad } = require('../middleware/verifyIdentidad');

// Auth — públicas
router.post('/login',   auth.login);
router.post('/refresh', auth.refresh);
router.post('/logout',  auth.logout);

// Perfil identidad — requiere token de identidad
router.get ('/me',                verifyIdentidad, auth.me);
router.post('/cambiar-password',  verifyIdentidad, auth.cambiarPassword);

// Aplicaciones del ecosistema
router.get('/aplicaciones',       verifyIdentidad, apps.listarParaIdentidad);
router.get('/aplicaciones/admin', verifyIdentidad, apps.listarAdmin);
router.post  ('/aplicaciones',       verifyIdentidad, apps.crear);
router.put   ('/aplicaciones/:id',   verifyIdentidad, apps.actualizar);
router.delete('/aplicaciones/:id',   verifyIdentidad, apps.eliminar);

module.exports = router;
