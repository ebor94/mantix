const router = require('express').Router();
const ctrl = require('../controllers/salas.controller');
const v    = require('../validations/salas.validation');
const { validate } = require('../middleware/validate');

router.get ('/homenajes',             ctrl.listar);
router.get ('/homenajes/:id',         ctrl.obtener);
router.post('/homenajes/:id/atender', validate(v.atender), ctrl.atender);
router.post('/homenajes/:id/visitas', validate(v.visita),  ctrl.registrarVisita);

module.exports = router;
