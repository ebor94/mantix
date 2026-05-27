const Joi = require('joi');

module.exports = {
  registroRapido: Joi.object({
    nombre:     Joi.string().min(2).max(100).required(),
    telefono:   Joi.string().min(7).max(20).required(),
    direccion:  Joi.string().max(250).allow('', null),
    zona_pap:   Joi.string().max(100).allow('', null),
    resultado_codigo: Joi.string().valid(
      'AFILIADO_HOY', 'INTERESADO', 'VOLVER', 'NO_INTERESADO', 'SIN_RESPUESTA'
    ).required(),
    lat:        Joi.number().min(-90).max(90).allow(null),
    lng:        Joi.number().min(-180).max(180).allow(null),
    comentario: Joi.string().allow('', null),
    nota:       Joi.string().allow('', null),
    prox_fecha: Joi.date().iso().allow(null),
    prox_hora:  Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).allow(null, '')
  }),
  zonas: Joi.object({
    asesor_id: Joi.number().integer(),
    fecha: Joi.date().iso()
  }),
  mapa: Joi.object({
    asesor_id: Joi.number().integer(),
    fecha: Joi.date().iso(),
    desde: Joi.date().iso(),
    hasta: Joi.date().iso()
  }),
  metricas: Joi.object({
    asesor_id: Joi.number().integer(),
    desde: Joi.date().iso(),
    hasta: Joi.date().iso()
  })
};
