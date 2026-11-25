// sv/validations/salas.validation.js — schemas Joi planos (validate llama schema.validate).
const Joi = require('joi');
const ventas = require('./ventas.validation');

const atender = Joi.object({
  nombre:   Joi.string().trim().max(100).allow('', null),
  telefono: Joi.string().trim().max(40).allow('', null)
});

const visita = Joi.object({
  gest_resultado_id:    Joi.number().integer().positive().required(),
  gest_estado_nuevo_id: Joi.number().integer().positive().allow(null),
  gest_comentario:      Joi.string().allow('', null),
  gest_prox_fecha:      Joi.date().iso().allow(null),
  gest_prox_hora:       Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).allow(null, ''),
  venta:                ventas.venta   // solo al cerrar el contrato; ver ventas.service
});

module.exports = { atender, visita };
