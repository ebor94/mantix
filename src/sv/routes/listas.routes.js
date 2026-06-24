const router = require('express').Router();
const ctrl = require('../controllers/listas.controller');
const { authorize } = require('../middleware/svAuthorize');
const { ROLES_SUPERVISORES } = require('../config/constants');

const supervisorOMas = authorize(...ROLES_SUPERVISORES);

router.get ('/',                  ctrl.list);
router.post('/cargar',            supervisorOMas, ctrl.uploadMiddleware, ctrl.cargar);
router.get ('/:id/prospectos',    ctrl.prospectosDeLista);

module.exports = router;
