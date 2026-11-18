/**
 * sv/routes/personas.routes.js
 * Montado en /api/sv/personas detrás de svAuth + svAreaGuard (routes/index.js).
 * Las rutas con :id exigen relación con la persona (ctrl.exigirRelacion); el
 * historial cross-área además exige nivel ≤ 3, igual que la pantalla del
 * frontend. En PUT la relación se verifica antes de validar el cuerpo.
 */
const router = require('express').Router();
const ctrl = require('../controllers/personas.controller');
const v    = require('../validations/crm.validation');
const { validate } = require('../middleware/validate');
const { authorizeLevel } = require('../middleware/svAuthorize');
const { NIVELES } = require('../config/constants');

router.get ('/buscar',                 validate(v.personas.buscar, 'query'), ctrl.buscar);
router.get ('/:id',                    ctrl.exigirRelacion, ctrl.getOne);
router.get ('/:id/prospectos-activos', ctrl.exigirRelacion, ctrl.prospectosActivos);
router.get ('/:id/historial-completo', authorizeLevel(NIVELES.SUPERVISOR), ctrl.exigirRelacion, ctrl.historialCompleto);
router.post('/',                       validate(v.personas.create), ctrl.create);
router.put ('/:id',                    ctrl.exigirRelacion, validate(v.personas.update), ctrl.update);

module.exports = router;
