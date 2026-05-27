const router = require('express').Router();
const ctrl = require('../controllers/listas.controller');
const { authorize } = require('../middleware/svAuthorize');

const supervisorOMas = authorize('SUPER_ADMIN', 'ADMIN_AREA', 'SUPERVISOR');

router.get ('/',                  ctrl.list);
router.post('/cargar',            supervisorOMas, ctrl.uploadMiddleware, ctrl.cargar);
router.get ('/:id/prospectos',    ctrl.prospectosDeLista);

module.exports = router;
