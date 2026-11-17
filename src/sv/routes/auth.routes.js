/**
 * sv/routes/auth.routes.js
 * Perfil del usuario de ventas. El login lo hace el SSO (/api/identidad/login).
 */
const router = require('express').Router();
const ctrl   = require('../controllers/auth.controller');
const { svAuth } = require('../middleware/svAuth');

router.get('/me',               svAuth, ctrl.me);
router.patch('/me/preferencias', svAuth, ctrl.updatePreferencias);

module.exports = router;
