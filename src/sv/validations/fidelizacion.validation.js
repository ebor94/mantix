const Joi = require('joi');

const TIPOS_FECHA = ['nacimiento', 'aniversario_laboral', 'aniversario_boda', 'otro'];
// Nota: dia_madre/dia_padre NO se aceptan en create — se derivan del género.

const personaSchema = Joi.object({
  persona_nombre:             Joi.string().min(2).max(100).required(),
  persona_apellido:           Joi.string().max(100).allow('', null),
  persona_telefono_principal: Joi.string().min(7).max(20).required(),
  persona_telefono_alterno:   Joi.string().max(20).allow('', null),
  persona_email:              Joi.string().email().allow('', null),
  persona_documento_tipo:     Joi.string().max(10).allow('', null),
  persona_documento_num:      Joi.string().max(20).allow('', null),
  persona_direccion:          Joi.string().max(250).allow('', null),
  persona_barrio:             Joi.string().max(100).allow('', null),
  persona_ciudad:             Joi.string().max(80).allow('', null),
  persona_fecha_nacimiento:   Joi.date().iso().allow(null),
  persona_genero:             Joi.string().valid('M', 'F', 'N').allow(null, '')
});

const fechaEspecialSchema = Joi.object({
  tipo:        Joi.string().valid(...TIPOS_FECHA).required(),
  fecha:       Joi.date().iso().required(),
  descripcion: Joi.string().max(200).allow('', null)
});

module.exports = {
  // Contactos
  crearContacto: Joi.object({
    // empresa_id viene del path param `:empresaId` (lo inyecta el controller)
    empresa_id:        Joi.number().integer(),
    persona:           personaSchema.required(),
    cargo:             Joi.string().max(120).allow('', null),
    departamento:      Joi.string().max(120).allow('', null),
    fecha_ingreso:     Joi.date().iso().allow(null),
    es_titular:        Joi.boolean().default(false),
    observaciones:     Joi.string().max(1000).allow('', null),
    fechas_especiales: Joi.array().items(fechaEspecialSchema).default([])
  }),

  actualizarContacto: Joi.object({
    cf_cargo:          Joi.string().max(120).allow('', null),
    cf_departamento:   Joi.string().max(120).allow('', null),
    cf_fecha_ingreso:  Joi.date().iso().allow(null),
    cf_es_titular:     Joi.number().valid(0, 1),
    cf_observaciones:  Joi.string().max(1000).allow('', null)
  }).min(1),

  agregarFecha: fechaEspecialSchema,

  // Próximos cumples / calendario
  proximos: Joi.object({
    dias: Joi.number().integer().min(0).max(60).default(3)
  }),
  calendario: Joi.object({
    anio: Joi.number().integer().min(2024).max(2099).required(),
    mes:  Joi.number().integer().min(1).max(12).required()
  }),

  // Envíos
  registrarEnvio: Joi.object({
    persona_id:         Joi.number().integer().required(),
    empresa_id:         Joi.number().integer().required(),
    fecha_especial_id:  Joi.number().integer().allow(null),
    evento_anio:        Joi.number().integer().min(2024).max(2099).required(),
    evento_tipo:        Joi.string().valid(
      'nacimiento', 'aniversario_laboral', 'aniversario_boda', 'dia_madre', 'dia_padre', 'otro'
    ).required(),
    tipo_detalle:       Joi.string().max(100).allow('', null),
    direccion_entrega:  Joi.string().max(250).allow('', null),
    estado:             Joi.string().valid('enviado', 'confirmado', 'devuelto').default('enviado'),
    evidencia_url:      Joi.string().max(255).allow('', null),
    comentario:         Joi.string().max(2000).allow('', null)
  }),

  actualizarEnvio: Joi.object({
    estado:        Joi.string().valid('enviado', 'confirmado', 'devuelto'),
    evidencia_url: Joi.string().max(255).allow('', null),
    comentario:    Joi.string().max(2000).allow('', null)
  }).min(1),

  metricas: Joi.object({
    desde:      Joi.date().iso().allow(null),
    hasta:      Joi.date().iso().allow(null),
    agente_id:  Joi.number().integer().allow(null)
  }),

  enviosList: Joi.object({
    persona_id: Joi.number().integer().required()
  })
};
