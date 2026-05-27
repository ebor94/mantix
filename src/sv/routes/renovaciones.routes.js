/**
 * sv/routes/renovaciones.routes.js
 * Fase 8 — Renovaciones B2B.
 */
const router = require('express').Router();
const ctrl   = require('../controllers/renovaciones.controller');
const Joi    = require('joi');
const { validate } = require('../middleware/validate');

router.use(ctrl.requireAreaEmp);

const schemas = {
  marcarConvenio: Joi.object({
    fecha_inicio:      Joi.date().iso().required(),
    fecha_vencimiento: Joi.date().iso().allow(null)
  }),
  query: Joi.object({
    dias: Joi.number().integer().min(0).max(365)
  })
};

router.patch('/prospectos/:id/marcar-convenio', validate(schemas.marcarConvenio),  ctrl.marcarConvenio);
router.get  ('/proximas',                       validate(schemas.query, 'query'),  ctrl.renovacionesProximas);
router.get  ('/vencidos',                                                          ctrl.vencidosSinRenovar);
router.post ('/jobs/manual',                                                       ctrl.ejecutarJobManual);

module.exports = router;
