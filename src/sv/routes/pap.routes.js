const router = require('express').Router();
const ctrl = require('../controllers/pap.controller');
const v    = require('../validations/pap.validation');
const { validate } = require('../middleware/validate');

router.use(ctrl.requireAreaPap);

router.post('/registro-rapido', validate(v.registroRapido),       ctrl.registroRapido);
router.get ('/zonas',           validate(v.zonas, 'query'),       ctrl.zonas);
router.get ('/mapa',            validate(v.mapa, 'query'),        ctrl.mapa);
router.get ('/metricas',        validate(v.metricas, 'query'),    ctrl.metricas);

module.exports = router;
