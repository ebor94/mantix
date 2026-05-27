const router = require('express').Router();
const ctrl = require('../controllers/reportes.controller');
const v    = require('../validations/crm.validation');
const { validate } = require('../middleware/validate');

router.get('/dashboard',  validate(v.reportes.dashboard, 'query'), ctrl.dashboard);
router.get('/equipo',     validate(v.reportes.equipo, 'query'),    ctrl.equipo);
router.get('/asesor/:id', validate(v.reportes.asesor, 'query'),    ctrl.asesor);

module.exports = router;
