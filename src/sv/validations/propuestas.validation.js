const Joi = require('joi');

const itemSchema = Joi.object({
  pi_prod_id:         Joi.number().integer().allow(null),
  pi_descripcion:     Joi.string().max(200).required(),
  pi_cantidad:        Joi.number().integer().min(1).required(),
  pi_precio_unitario: Joi.number().min(0).required(),
  pi_descuento_pct:   Joi.number().min(0).max(100).default(0),
  pi_orden:           Joi.number().integer().min(0)
});

module.exports = {
  list: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(500).default(20),
    estado:       Joi.string().valid('borrador','enviada','aceptada','rechazada'),
    empresa_id:   Joi.number().integer(),
    prospecto_id: Joi.number().integer()
  }),
  create: Joi.object({
    prop_prospecto_id:  Joi.number().integer().required(),
    prop_empresa_id:    Joi.number().integer().required(),
    prop_contacto_id:   Joi.number().integer().allow(null),
    prop_descuento_pct: Joi.number().min(0).max(100).default(0),
    prop_vigencia_dias: Joi.number().integer().min(1).max(365).default(30),
    prop_notas:         Joi.string().allow('', null),
    items:              Joi.array().items(itemSchema).min(1).required()
  }),
  update: Joi.object({
    prop_descuento_pct: Joi.number().min(0).max(100),
    prop_vigencia_dias: Joi.number().integer().min(1).max(365),
    prop_destinatario:  Joi.string().max(200).allow('', null),
    prop_notas:         Joi.string().allow('', null),
    items:              Joi.array().items(itemSchema)
  }).min(1),
  enviar: Joi.object({
    canal:        Joi.string().valid('correo','presencial').default('correo'),
    destinatario: Joi.string().max(200),
    asunto:       Joi.string().max(200).allow('', null),
    mensaje:      Joi.string().allow('', null)
  })
};
