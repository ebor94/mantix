const Joi = require('joi');

module.exports = {
  create: Joi.object({
    usr_area_id:  Joi.number().integer().allow(null),
    usr_grupo_id: Joi.number().integer().allow(null),
    usr_rol_id:   Joi.number().integer().required(),
    usr_punto_id: Joi.number().integer().allow(null),
    usr_email:    Joi.string().email().required(),
    usr_nombre:   Joi.string().min(2).max(100).required(),
    usr_apellido: Joi.string().min(2).max(100).required(),
    usr_telefono: Joi.string().max(20).allow('', null),
    usr_password: Joi.string().min(6).max(200).required(),
    usr_activo:   Joi.number().valid(0, 1).default(1)
  }),
  update: Joi.object({
    usr_area_id:  Joi.number().integer().allow(null),
    usr_grupo_id: Joi.number().integer().allow(null),
    usr_rol_id:   Joi.number().integer(),
    usr_punto_id: Joi.number().integer().allow(null),
    usr_email:    Joi.string().email(),
    usr_nombre:   Joi.string().min(2).max(100),
    usr_apellido: Joi.string().min(2).max(100),
    usr_telefono: Joi.string().max(20).allow('', null),
    usr_activo:   Joi.number().valid(0, 1)
  }).min(1),
  resetPassword: Joi.object({
    nueva: Joi.string().min(6).max(200).required()
  })
};
