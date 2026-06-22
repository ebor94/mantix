const Joi = require('joi');

module.exports = {
  list: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(500).default(20),
    q: Joi.string().min(2),
    sector: Joi.string().max(80)
  }),
  buscar: Joi.object({
    nit: Joi.string().min(5).required()
  }),
  create: Joi.object({
    empresa_nit:               Joi.string().min(5).max(20).required(),
    empresa_razon_social:      Joi.string().min(3).max(200).required(),
    empresa_nombre_comercial:  Joi.string().max(200).allow('', null),
    empresa_sector:            Joi.string().max(80).allow('', null),
    empresa_num_empleados:     Joi.number().integer().min(0).allow(null),
    empresa_telefono:          Joi.string().max(20).allow('', null),
    empresa_email_corporativo: Joi.string().email().allow('', null),
    empresa_sitio_web:         Joi.string().max(200).allow('', null),
    empresa_direccion:         Joi.string().max(250).allow('', null),
    empresa_ciudad:            Joi.string().max(80).default('Cucuta'),
    empresa_nota:              Joi.string().allow('', null),
    // Migración 017
    empresa_tipo_id:               Joi.number().integer().required(),
    empresa_grupo_empresarial_id:  Joi.number().integer().allow(null),
    // Migración 019
    empresa_periodicidad_seguimiento: Joi.string().valid('BIMENSUAL','TRIMESTRAL','ANUAL').allow(null, '')
  }),
  update: Joi.object({
    empresa_nit:               Joi.string().min(5).max(20),
    empresa_razon_social:      Joi.string().min(3).max(200),
    empresa_nombre_comercial:  Joi.string().max(200).allow('', null),
    empresa_sector:            Joi.string().max(80).allow('', null),
    empresa_num_empleados:     Joi.number().integer().min(0).allow(null),
    empresa_telefono:          Joi.string().max(20).allow('', null),
    empresa_email_corporativo: Joi.string().email().allow('', null),
    empresa_sitio_web:         Joi.string().max(200).allow('', null),
    empresa_direccion:         Joi.string().max(250).allow('', null),
    empresa_ciudad:            Joi.string().max(80),
    empresa_nota:              Joi.string().allow('', null),
    empresa_activa:            Joi.number().valid(0, 1),
    // Migración 017
    empresa_tipo_id:               Joi.number().integer(),
    empresa_grupo_empresarial_id:  Joi.number().integer().allow(null),
    // Migración 019
    empresa_periodicidad_seguimiento: Joi.string().valid('BIMENSUAL','TRIMESTRAL','ANUAL').allow(null, '')
  }).min(1)
};
