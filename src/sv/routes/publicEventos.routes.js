/**
 * sv/routes/publicEventos.routes.js — SIN svAuth.
 * Se monta bajo /api/sv/public en routes/index.js ANTES de svAuth.
 */
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { validate } = require('../middleware/validate');
const c = require('../controllers/publicEventos.controller');
const v = require('../validations/eventosMulti.validation');

const registroLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Demasiados intentos, espera un minuto' } }
});

router.get('/eventos/:hash',                                              c.landing);
router.post('/eventos/:hash/registro',
            registroLimiter, validate(v.registroPublico),                 c.registrar);

module.exports = router;
