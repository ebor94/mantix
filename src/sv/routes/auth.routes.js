/**
 * sv/routes/auth.routes.js
 * Endpoints públicos (login, refresh) + protegidos (logout, me, password, preferencias).
 */
const router = require('express').Router();
const ctrl   = require('../controllers/auth.controller');
const v      = require('../validations/auth.validation');
const { validate } = require('../middleware/validate');
const { svAuth }   = require('../middleware/svAuth');

router.post('/login',   validate(v.login),   ctrl.login);
router.post('/refresh', validate(v.refresh), ctrl.refresh);
router.post('/logout',  ctrl.logout);

router.get('/me',                       svAuth, ctrl.me);
router.patch('/me/password',            svAuth, validate(v.changePassword), ctrl.changePassword);
router.patch('/me/preferencias',        svAuth, ctrl.updatePreferencias);

module.exports = router;
