const Joi = require('joi');

const planTipos = ['UNIPERSONAL', 'BASICO', 'UNIFAMILIAR'];
const preciosPorRango = Joi.object({
  UNIPERSONAL: Joi.number().min(0).required(),
  BASICO: Joi.number().min(0).required(),
  UNIFAMILIAR: Joi.number().min(0).required()
});

const crearEmpresaAdminSchema = Joi.object({
  nit: Joi.string().max(20).required().trim(),
  nombre: Joi.string().max(200).required().trim(),
  rangoAfiliados: Joi.string().valid('R7', 'R15').required(),
  vigenciaInicio: Joi.date().iso().required(),
  vigenciaCierre: Joi.date().iso().greater(Joi.ref('vigenciaInicio')).required()
    .messages({ 'date.greater': 'La vigencia de cierre debe ser posterior al inicio' }),
  slug: Joi.string().max(80).pattern(/^[a-z0-9-]+$/).allow('', null),
  asesorId: Joi.number().integer().allow(null),
  publicoActivo: Joi.number().valid(0, 1)
});

const editarEmpresaAdminSchema = Joi.object({
  nombre: Joi.string().max(200).trim(),
  rangoAfiliados: Joi.string().valid('R7', 'R15'),
  vigenciaInicio: Joi.date().iso(),
  vigenciaCierre: Joi.date().iso(),
  activo: Joi.number().valid(0, 1),
  slug: Joi.string().max(80).pattern(/^[a-z0-9-]+$/).allow('', null),
  asesorId: Joi.number().integer().allow(null),
  publicoActivo: Joi.number().valid(0, 1)
}).min(1);

const editarPlanSchema = Joi.object({
  valorMensual: Joi.number().min(0).required(),
  reglas: Joi.object().required(),
  activo: Joi.number().valid(0, 1).default(1)
});

const parametroSchema = Joi.object({
  anio: Joi.number().integer().min(2020).max(2100).required(),
  valorAdicionalMenor50: Joi.number().min(0).required(),
  valorAdicionalMayor50: Joi.number().min(0).required(),
  valorAsistencia: Joi.number().min(0).required(),
  preciosEstandar: Joi.object({ R7: preciosPorRango.required(), R15: preciosPorRango.required() }).required()
});

module.exports = { crearEmpresaAdminSchema, editarEmpresaAdminSchema, editarPlanSchema, parametroSchema };
