const router = require('express').Router();
const ctrl = require('../controllers/presupuestos.controller');
const v    = require('../validations/presupuestos.validation');
const { validate } = require('../middleware/validate');

router.get ('/',          validate(v.consultar, 'query'), ctrl.consultar);
router.get ('/plantilla', ctrl.soloQuienCarga, validate(v.plantilla, 'query'), ctrl.plantilla);
router.post('/revisar',   ctrl.soloQuienCarga, ctrl.recibirArchivo, validate(v.revisar), ctrl.revisar);
router.post('/',          ctrl.soloQuienCarga, validate(v.guardar), ctrl.guardar);

module.exports = router;
