const router = require('express').Router();
const ctrl = require('../controllers/buscador.controller');
const v    = require('../validations/crm.validation');
const { validate } = require('../middleware/validate');

router.get('/', validate(v.buscador.buscar, 'query'), ctrl.buscar);

module.exports = router;
