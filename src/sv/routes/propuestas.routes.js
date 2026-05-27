const router = require('express').Router();
const ctrl = require('../controllers/propuestas.controller');
const v    = require('../validations/propuestas.validation');
const { validate } = require('../middleware/validate');
const { requireAreaEmp } = require('../controllers/empresas.controller');

router.use(requireAreaEmp);

router.get   ('/',                 validate(v.list, 'query'), ctrl.list);
router.get   ('/:id',              ctrl.getOne);
router.get   ('/:id/preview',      ctrl.previewPdf);
router.post  ('/:id/generar-pdf', ctrl.generarPdf);
router.post  ('/',                 validate(v.create),        ctrl.create);
router.put   ('/:id',              validate(v.update),        ctrl.update);
router.post  ('/:id/enviar',       validate(v.enviar),        ctrl.enviar);
router.delete('/:id',              ctrl.eliminar);

module.exports = router;
