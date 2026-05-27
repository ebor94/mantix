const router = require('express').Router();
const ctrl = require('../controllers/gestiones.controller');
const v    = require('../validations/crm.validation');
const { validate } = require('../middleware/validate');

router.post('/',            validate(v.gestiones.create),         ctrl.create);
router.get ('/',            validate(v.gestiones.list, 'query'),  ctrl.list);
router.get ('/resumen-dia', validate(v.gestiones.resumenDia, 'query'), ctrl.resumenDia);

module.exports = router;
