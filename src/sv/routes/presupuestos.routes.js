const router = require('express').Router();
const ctrl = require('../controllers/presupuestos.controller');
const v    = require('../validations/presupuestos.validation');
const { validate } = require('../middleware/validate');

router.get('/', validate(v.consultar, 'query'), ctrl.consultar);

module.exports = router;
