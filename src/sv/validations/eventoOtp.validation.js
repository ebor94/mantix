// sv/validations/eventoOtp.validation.js — SP-3
// Schemas Joi planos: sv/middleware/validate llama schema.validate(req.body).
const Joi = require('joi');

const solicitarOtp = Joi.object({
  cambios: Joi.object().min(1).required()
});

const confirmarOtp = Joi.object({
  otp_id: Joi.number().integer().positive().required(),
  otp:    Joi.string().pattern(/^\d{6}$/).required()
});

module.exports = { solicitarOtp, confirmarOtp };
