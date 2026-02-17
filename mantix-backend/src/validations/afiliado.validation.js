const Joi = require('joi');

const beneficiarioSchema = Joi.object({
  tipoBeneficiario: Joi.string().valid('DE_LEY', 'ADICIONAL').required()
    .messages({ 'any.only': 'Tipo de beneficiario debe ser DE_LEY o ADICIONAL' }),
  parentesco: Joi.string().valid(
    'ABUELASTRO (A)', 'ABUELO (A)', 'AHIJADO (A)', 'ASEGURADO PRINCIPAL',
    'BISABUELO (A)', 'BISNIETO (A)', 'COMPAÑERO (A)', 'CONYUGE',
    'CUÑADO (A)', 'EX-ESPOSO (A)', 'HERMANASTRO (A)', 'HERMANO (A)',
    'HERMANO CON INCAPACIDAD', 'HIJASTRO (A)', 'HIJO (A)', 'HIJO ADOPTIVO',
    'HIJO CON INCAPACIDAD', 'MADRASTRA', 'MADRE', 'MADRINA',
    'NIETO (A)', 'OTRO', 'PADRASTRO', 'PADRE', 'PADRINO',
    'PRIMO (A)', 'PROTEGIDO (A)', 'SERVICIO DOMESTICO (A)', 'SOBRINO (A)',
    'SUEGRASTRO', 'SUEGRO (A)', 'TIO (A)', 'YERNO/NUERA'
  ).required()    
    .messages({ 'any.only': 'Parentesco no válido' }),
  tipoDocumento: Joi.string().valid('CC', 'TI', 'CE', 'PA', 'RC', 'PPT', 'ADT').required()
    .messages({ 'any.only': 'Tipo de documento no válido' }),
  numeroDocumento: Joi.string().pattern(/^\d{5,20}$/).required().trim()
    .messages({ 'string.pattern.base': 'Número de documento debe tener entre 5 y 20 dígitos' }),
  primerApellido: Joi.string().max(80).required().trim()
    .messages({ 'string.empty': 'Primer apellido es obligatorio' }),
  segundoApellido: Joi.string().max(80).allow('', null).trim(),
  primerNombre: Joi.string().max(80).required().trim()
    .messages({ 'string.empty': 'Primer nombre es obligatorio' }),
  segundoNombre: Joi.string().max(80).allow('', null).trim(),
  fechaNacimiento: Joi.date().iso().max('now').required()
    .messages({ 'date.max': 'Fecha de nacimiento no puede ser futura' }),
  edad: Joi.number().integer().min(0).max(150).required(),
  estado: Joi.string().valid('ACTUALIZACION', 'RETIRO', 'INGRESO').required()
    .messages({ 'any.only': 'Estado debe ser ACTUALIZACION, RETIRO o INGRESO' })
});

const createAfiliadoSchema = Joi.object({
  tipoDocumento: Joi.string().valid('CC', 'TI', 'CE', 'PA', 'NIT').required()
    .messages({ 'any.only': 'Tipo de documento no válido' }),
  numeroDocumento: Joi.string().pattern(/^\d{5,15}$/).required().trim()
    .messages({ 'string.pattern.base': 'Número de documento debe tener entre 5 y 15 dígitos' }),
  primerApellido: Joi.string().max(80).required().trim()
    .messages({ 'string.empty': 'Primer apellido es obligatorio' }),
  segundoApellido: Joi.string().max(80).allow('', null).trim(),
  primerNombre: Joi.string().max(80).required().trim()
    .messages({ 'string.empty': 'Primer nombre es obligatorio' }),
  segundoNombre: Joi.string().max(80).allow('', null).trim(),
  fechaNacimiento: Joi.date().iso().max('now').required()
    .messages({ 'date.max': 'Fecha de nacimiento no puede ser futura' }),
  edad: Joi.number().integer().min(0).max(150).required(),
  sexo: Joi.string().valid('F', 'M', 'X').required()
    .messages({ 'any.only': 'Sexo debe ser F, M o X' }),
  estadoCivil: Joi.string().valid('SOLTERO', 'CASADO', 'UNION_LIBRE', 'DIVORCIADO', 'VIUDO', 'SEPARADO').required()
    .messages({ 'any.only': 'Estado civil no válido' }),
  celular: Joi.string().pattern(/^\d{7,15}$/).required()
    .messages({ 'string.pattern.base': 'Celular debe tener entre 7 y 15 dígitos' }),
  email: Joi.string().email().allow('', null)
    .messages({ 'string.email': 'Email no tiene formato válido' }),
  direccion: Joi.string().max(200).allow('', null).trim(),
  departamento: Joi.string().max(80).allow('', null).trim(),
  ciudad: Joi.string().max(80).allow('', null).trim(),
  barrio: Joi.string().max(120).allow('', null).trim(),
  canal: Joi.string().valid('BANCARIO', 'LIBRANZA', 'CAJA', 'PSE', 'TRANSFERENCIA', 'OTRO').allow('', null)
    .messages({ 'any.only': 'Canal no válido' }),
  producto: Joi.string().valid('INTEGRAL', 'BASICO', 'OTRO').allow('', null)
    .messages({ 'any.only': 'Producto no válido' }),
  grupo: Joi.string().valid('BASICO', 'PLUS', 'PREMIUM', 'OTRO').allow('', null)
    .messages({ 'any.only': 'Grupo no válido' }),
  beneficiarios: Joi.array().items(beneficiarioSchema).min(0).default([])
});

module.exports = { createAfiliadoSchema, beneficiarioSchema };
