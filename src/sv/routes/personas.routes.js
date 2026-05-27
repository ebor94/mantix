const router = require('express').Router();
const ctrl = require('../controllers/personas.controller');
const v    = require('../validations/crm.validation');
const { validate } = require('../middleware/validate');

router.get ('/buscar',                       validate(v.personas.buscar, 'query'), ctrl.buscar);
router.get ('/:id',                          ctrl.getOne);
router.get ('/:id/prospectos-activos',       ctrl.prospectosActivos);
router.get ('/:id/historial-completo',       ctrl.historialCompleto);  // cross-área
router.post('/',                             validate(v.personas.create), ctrl.create);
router.put ('/:id',                          validate(v.personas.update), ctrl.update);

module.exports = router;
