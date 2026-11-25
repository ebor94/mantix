/**
 * sv/validations/presupuestos.validation.js — consulta del presupuesto de un mes.
 */
const Joi = require('joi');

const periodo = {
  area_id: Joi.number().integer().positive().required(),
  anio:    Joi.number().integer().min(2025).max(2099).required(),
  mes:     Joi.number().integer().min(1).max(12).required()
};

module.exports = {
  consultar: Joi.object(periodo)
};
