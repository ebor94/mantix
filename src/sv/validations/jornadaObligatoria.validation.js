/**
 * sv/validations/jornadaObligatoria.validation.js
 * Schemas para el popup bloqueante de inicio de jornada (SP-4).
 */
const Joi = require('joi');

const TIPOS_AUSENCIA = ['PERMISO', 'INCAPACIDAD', 'DIA_LIBRE', 'OTRO'];

const registrarAusencia = Joi.object({
  tipo:   Joi.string().valid(...TIPOS_AUSENCIA).required(),
  motivo: Joi.string().trim().min(5).max(500).required()
}).prefs({ abortEarly: false });

module.exports = { registrarAusencia, TIPOS_AUSENCIA };
