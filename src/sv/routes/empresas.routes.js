const router = require('express').Router();
const ctrl = require('../controllers/empresas.controller');
const v    = require('../validations/empresas.validation');
const { validate } = require('../middleware/validate');

router.use(ctrl.requireAreaEmp);

router.get ('/',        validate(v.list, 'query'),   ctrl.list);
router.get ('/buscar',  validate(v.buscar, 'query'), ctrl.buscar);
router.get ('/:id',     ctrl.getOne);
router.post('/',        validate(v.create),          ctrl.create);
router.put ('/:id',     validate(v.update),          ctrl.update);

module.exports = router;
