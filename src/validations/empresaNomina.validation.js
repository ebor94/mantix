const Joi = require('joi');
const ESTADOS = ['SOLTERO','CASADO','UNION_LIBRE','DIVORCIADO','VIUDO','SEPARADO'];
const PLANES = ['UNIPERSONAL','BASICO','UNIFAMILIAR'];

// Una fila de la carga CSV (asesor). numeroDocumento + primerNombre obligatorios.
const filaNominaSchema = Joi.object({
  numeroDocumento: Joi.string().max(20).required().trim(),
  primerNombre: Joi.string().max(80).required().trim(),
  segundoNombre: Joi.string().max(80).allow('', null),
  primerApellido: Joi.string().max(80).allow('', null),
  segundoApellido: Joi.string().max(80).allow('', null),
  estadoCivil: Joi.string().valid(...ESTADOS).allow('', null),
  fechaNacimiento: Joi.date().iso().allow('', null),
  direccion: Joi.string().max(255).allow('', null),
  celular: Joi.string().max(20).allow('', null),
  email: Joi.string().email().max(150).allow('', null),
  planTipo: Joi.string().valid(...PLANES).allow('', null)
});

// Autoregistro público del interesado (link abierto): mínimos + contacto.
const interesadoPublicoSchema = Joi.object({
  numeroDocumento: Joi.string().max(20).required().trim(),
  primerNombre: Joi.string().max(80).required().trim(),
  primerApellido: Joi.string().max(80).allow('', null),
  celular: Joi.string().max(20).required().trim(),
  email: Joi.string().email().max(150).allow('', null)
});

module.exports = { filaNominaSchema, interesadoPublicoSchema };
