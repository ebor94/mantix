/**
 * sv/validations/presupuestos.validation.js — consulta, plantilla, revisión y guardado.
 */
const Joi = require('joi');

const VALOR_MAXIMO = 999999999999; // pre_valor es DECIMAL(14,2)
const MAX_FILAS = 300;

const periodo = {
  area_id: Joi.number().integer().positive().required(),
  anio:    Joi.number().integer().min(2025).max(2099).required(),
  mes:     Joi.number().integer().min(1).max(12).required()
};

const valores = Joi.object()
  .pattern(Joi.string().trim().min(1).max(50), Joi.number().integer().min(0).max(VALOR_MAXIMO))
  .min(1).required();

module.exports = {
  VALOR_MAXIMO,
  MAX_FILAS,
  consultar: Joi.object(periodo),
  plantilla: Joi.object(periodo),
  revisar:   Joi.object(periodo),
  guardar: Joi.object({
    ...periodo,
    filas: Joi.array().items(Joi.object({
      usr_id: Joi.number().integer().positive().required(),
      valores
    })).min(1).max(MAX_FILAS).required()
  })
};
