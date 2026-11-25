const router = require('express').Router();
const ctrl = require('../controllers/ventas.controller');
const v    = require('../validations/ventas.validation');
const { validate } = require('../middleware/validate');

router.put ('/:id',        validate(v.corregir), ctrl.corregir);
router.post('/:id/anular', validate(v.anular),   ctrl.anular);

module.exports = router;
