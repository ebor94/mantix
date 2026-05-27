const router = require('express').Router();
const ctrl = require('../controllers/prospectos.controller');
const v    = require('../validations/crm.validation');
const { validate } = require('../middleware/validate');

router.get  ('/',                  validate(v.prospectos.list, 'query'),       ctrl.list);
router.get  ('/panel-dia',         validate(v.prospectos.panelDia, 'query'),   ctrl.panelDia);
router.get  ('/agenda-mes',        validate(v.prospectos.agendaMes, 'query'),  ctrl.agendaMes);
router.get  ('/sin-asignar',         ctrl.sinAsignar);                            // cola supervisor
router.get  ('/sin-asignar/count',   ctrl.sinAsignarCount);                       // badge
router.get  ('/por-asesor',          ctrl.porAsesor);                              // conteo por asesor (reasignación)
router.post ('/reasignacion-masiva', ctrl.reasignacionMasiva);                     // mover todos de un asesor a otros
router.get  ('/:id',                 ctrl.getOne);
router.post ('/',                  validate(v.prospectos.create),              ctrl.create);
router.put  ('/:id',                 validate(v.prospectos.update),              ctrl.update);
router.put  ('/:id/productos',                                                   ctrl.actualizarProductos);
router.patch('/:id/reasignar',       validate(v.prospectos.reasignar),           ctrl.reasignar);
router.patch('/:id/asignar',       ctrl.asignar);                               // sin-asignar → asesor

module.exports = router;
