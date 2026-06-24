const Joi = require('joi');

// tlds:{allow:false} permite TLDs no estándar como `.local` o `.internal`
// que se usan en dominios corporativos privados (ej: jparada@olivos.local).
const EMAIL = Joi.string().email({ tlds: { allow: false } });

module.exports = {
  login: Joi.object({
    email:    EMAIL.required(),
    password: Joi.string().min(4).max(200).required()
  }),
  refresh: Joi.object({
    refreshToken: Joi.string().required()
  }),
  changePassword: Joi.object({
    actual: Joi.string().min(4).required(),
    nueva:  Joi.string().min(6).max(200).required()
  })
};
