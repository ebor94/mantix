const Joi = require('joi');

module.exports = {
  login: Joi.object({
    email:    Joi.string().email().required(),
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
