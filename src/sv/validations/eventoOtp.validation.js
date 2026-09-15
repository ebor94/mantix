// sv/validations/eventoOtp.validation.js — SP-3
const Joi = require('joi');

const solicitarOtp = {
  body: Joi.object({
    cambios: Joi.object().min(1).required()
  })
};

const confirmarOtp = {
  body: Joi.object({
    otp_id: Joi.number().integer().positive().required(),
    otp:    Joi.string().pattern(/^\d{6}$/).required()
  })
};

module.exports = { solicitarOtp, confirmarOtp };
